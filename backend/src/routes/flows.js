"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const { BLOCKS, palette, isInitiator } = require("../lib/flow/registry");

const router = express.Router();
const int = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

/** Structural validation for a flow graph — returns an array of error strings (empty = valid). */
function validateGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") return ["graph must be an object"];
  const { entry, nodes, edges } = graph;
  if (!Array.isArray(nodes) || !nodes.length) return ["graph.nodes must be a non-empty array"];
  if (!Array.isArray(edges)) return ["graph.edges must be an array"];

  const ids = new Set();
  let initiatorCount = 0;
  for (const n of nodes) {
    if (!n || typeof n.id !== "string" || !n.id) { errors.push("every node needs a non-empty string id"); continue; }
    if (ids.has(n.id)) errors.push(`duplicate node id "${n.id}"`);
    ids.add(n.id);
    if (!BLOCKS[n.type]) errors.push(`node "${n.id}" has unknown block type "${n.type}"`);
    if (isInitiator(n.type)) initiatorCount++;
  }
  if (!entry || !ids.has(entry)) errors.push(`graph.entry "${entry}" does not reference an existing node`);
  else {
    const entryNode = nodes.find((n) => n.id === entry);
    if (entryNode && !isInitiator(entryNode.type)) errors.push(`graph.entry must be a lead-source block (got "${entryNode.type}")`);
  }
  if (initiatorCount > 1) errors.push(`only one lead-source block is allowed per flow (found ${initiatorCount})`);

  for (const e of edges) {
    if (!e || typeof e.from !== "string" || !ids.has(e.from)) errors.push(`edge has invalid "from" (${e && e.from})`);
    if (e && e.to != null && !ids.has(e.to)) errors.push(`edge from "${e.from}" has invalid "to" (${e.to})`);
  }

  const outBy = new Map();
  for (const e of edges) { if (!outBy.has(e.from)) outBy.set(e.from, []); outBy.get(e.from).push(e); }

  for (const n of nodes) {
    const out = outBy.get(n.id) || [];
    if (n.type === "branch") {
      const whens = out.map((e) => e.when).sort();
      if (JSON.stringify(whens) !== JSON.stringify(["false", "true"])) errors.push(`branch node "${n.id}" must have exactly one "true" and one "false" outgoing edge`);
    } else if (n.type === "review_gate") {
      const whens = out.map((e) => e.when).sort();
      if (JSON.stringify(whens) !== JSON.stringify(["approved", "rejected"])) errors.push(`review_gate node "${n.id}" must have exactly one "approved" and one "rejected" outgoing edge`);
    } else if (n.type === "send") {
      // Send is terminal by default (0 outgoing edges) but may optionally continue
      // into one more step, same as any normal block — nothing in the engine
      // requires it to be a dead end.
      if (out.length > 1 || (out.length === 1 && out[0].when !== undefined)) errors.push(`send node "${n.id}" may have at most one outgoing edge`);
    } else {
      if (out.length !== 1 || out[0].when !== undefined) errors.push(`node "${n.id}" (${n.type}) must have exactly one unconditional outgoing edge`);
    }
  }

  return errors;
}

router.get("/api/flows/blocks", (req, res) => res.json(palette()));

router.get("/api/flows", async (req, res) => {
  try {
    const rows = await prisma.flows.findMany({ orderBy: [{ is_template: "desc" }, { id: "desc" }] });
    res.json(rows.map((r) => ({ id: r.id, name: r.name, description: r.description, is_template: !!r.is_template, updated_at: r.updated_at })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/flows/:id", async (req, res) => {
  try {
    const row = await prisma.flows.findUnique({ where: { id: int(req.params.id) } });
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ id: row.id, name: row.name, description: row.description, is_template: !!row.is_template, graph: JSON.parse(row.graph_json) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/flows", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: "name is required" });
    const errors = validateGraph(b.graph);
    if (errors.length) return res.status(400).json({ error: "invalid graph", details: errors });
    const now = new Date();
    const row = await prisma.flows.create({
      data: { name: b.name, description: b.description || null, graph_json: JSON.stringify(b.graph), is_template: b.is_template ? 1 : 0, created_at: now, updated_at: now },
    });
    res.json({ id: row.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/api/flows/:id", async (req, res) => {
  try {
    const id = int(req.params.id);
    const existing = await prisma.flows.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "not found" });
    const b = req.body || {};
    const data = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description || null;
    if (b.graph !== undefined) {
      const errors = validateGraph(b.graph);
      if (errors.length) return res.status(400).json({ error: "invalid graph", details: errors });
      // Structural graph edits are blocked once a campaign using this flow has leads
      // mid-flight — reshaping/removing nodes a lead currently sits at isn't supported
      // yet (name/description edits are always fine).
      const inFlightCampaigns = await prisma.campaigns.findMany({ where: { flow_id: id }, select: { id: true } });
      if (inFlightCampaigns.length) {
        const campaignIds = inFlightCampaigns.map((c) => c.id);
        const midFlight = await prisma.leads.count({ where: { campaign_id: { in: campaignIds }, flow_node_id: { not: null } } });
        if (midFlight > 0) return res.status(409).json({ error: `cannot change the graph shape — ${midFlight} lead(s) are already in flight on a campaign using this flow` });
      }
      data.graph_json = JSON.stringify(b.graph);
    }
    if (!Object.keys(data).length) return res.json({ ok: true });
    data.updated_at = new Date();
    await prisma.flows.update({ where: { id }, data });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
