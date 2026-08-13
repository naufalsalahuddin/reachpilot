"use strict";
/**
 * Generic dispatcher for flow-mode campaigns (campaigns.flow_id set). Parallel to
 * jobs/handlers.js — legacy (flow_id-less) jobs never touch this file. A job here
 * carries a `node_id` identifying which node in the campaign's flow graph to run;
 * `type` mirrors the node's block type for readability/monitoring, same convention
 * as legacy jobs.
 */
const prisma = require("../lib/prisma");
const queue = require("./queue");
const { BLOCKS, defaultBatchSize } = require("../lib/flow/registry");

const TERMINAL = "__end__";

async function loadGraph(campaignId) {
  const campaign = await prisma.campaigns.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.flow_id) throw new Error(`Campaign ${campaignId} has no flow`);
  const flowRow = await prisma.flows.findUnique({ where: { id: campaign.flow_id } });
  if (!flowRow) throw new Error(`Flow ${campaign.flow_id} not found`);
  let graph;
  try { graph = JSON.parse(flowRow.graph_json); } catch { throw new Error(`Flow ${flowRow.id} has invalid graph_json`); }
  return { campaign, flowRow, graph };
}

/** Resolve the node a lead should move to next, chasing through any consecutive
 * `branch` nodes (which are never a lead's resting place). `when` is the edge label
 * to follow out of `fromNodeId` — undefined for a plain unconditional edge, or an
 * explicit value ("true"/"false"/"approved"/"rejected") for a branch/review_gate. */
async function resolveNext(graph, fromNodeId, when, lead) {
  const edges = graph.edges.filter((e) => e.from === fromNodeId);
  const edge = when === undefined ? edges.find((e) => e.when === undefined) : edges.find((e) => e.when === when);
  if (!edge || edge.to == null) return null;
  const target = graph.nodes.find((n) => n.id === edge.to);
  if (!target) return null;
  if (target.type !== "branch") return target.id;
  const branchWhen = await BLOCKS.branch.evaluate(lead, target);
  return resolveNext(graph, target.id, branchWhen, lead);
}

/** Enqueue a job for `nodeId` unless one is already queued/running for it. */
async function enqueueNodeIfNeeded(campaignId, nodeType, nodeId) {
  const existing = await prisma.jobs.findFirst({
    where: { campaign_id: campaignId, node_id: nodeId, status: { in: ["queued", "running"] } }, select: { id: true },
  });
  if (!existing) await queue.enqueue(nodeType, campaignId, {}, null, nodeId);
}

/** Advance one lead out of `fromNodeId` along the edge labeled `when` (chasing any
 * consecutive branch nodes), either parking it (review_gate/terminal) or enqueueing
 * the next node's job. `when` is undefined for a plain node finishing its work, or
 * an explicit label ("approved"/"rejected") when routes/review.js is resolving a
 * review_gate's decision from outside the job system. */
async function advanceLeadTo(graph, fromNodeId, when, lead) {
  const nextId = await resolveNext(graph, fromNodeId, when, lead);
  if (nextId == null) {
    await prisma.leads.update({ where: { id: lead.id }, data: { flow_node_id: TERMINAL } });
    return null;
  }
  const nextNode = graph.nodes.find((n) => n.id === nextId);
  await prisma.leads.update({ where: { id: lead.id }, data: { flow_node_id: nextId } });
  if (nextNode.type !== "review_gate" && typeof BLOCKS[nextNode.type]?.run === "function") {
    await enqueueNodeIfNeeded(lead.campaign_id, nextNode.type, nextNode.id);
  }
  return nextNode;
}

/** Advance a lead that just finished a normal (non-gate) block. */
async function advanceLead(graph, fromNode, lead) {
  return advanceLeadTo(graph, fromNode.id, undefined, lead);
}

async function handleFlowNode(job) {
  const { campaign, graph } = await loadGraph(job.campaign_id);
  const node = graph.nodes.find((n) => n.id === job.node_id);
  if (!node) throw new Error(`Node ${job.node_id} not found in flow ${campaign.flow_id}`);
  const adapter = BLOCKS[node.type];
  if (!adapter || typeof adapter.run !== "function") throw new Error(`No runnable adapter for block type "${node.type}"`);

  const batchSize = (node.config && node.config.batch_size) || defaultBatchSize(node.type);
  const { doneLeadIds = [], remaining = 0 } = await adapter.run({ campaign, node, flow: graph, batchSize });

  for (const leadId of doneLeadIds) {
    const lead = await prisma.leads.findUnique({ where: { id: leadId } });
    if (lead) await advanceLead(graph, node, lead);
  }

  if (remaining > 0) await enqueueNodeIfNeeded(campaign.id, node.type, node.id);

  return `flow:${node.type}(${node.id}) — ${doneLeadIds.length} done, ${remaining} left`;
}

module.exports = { handleFlowNode, advanceLead, advanceLeadTo, resolveNext, loadGraph, enqueueNodeIfNeeded, TERMINAL };
