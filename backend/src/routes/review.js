"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const data = require("../lib/data");
const { enqueueForDraft } = require("../sending/schedule");
const { auditSite } = require("../lib/audit");
const pagespeed = require("../lib/pagespeed");
const { lintEmail } = require("../lib/contentLint");
const flowEngine = require("../jobs/flowEngine");

const router = express.Router();
const int = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const ORDER = { FAIL: 0, UNKNOWN: 1, PASS: 2 };
const sortChecks = (checks) => checks.sort((a, b) => (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3) || a.tier - b.tier);
const parse = (s, dflt) => { try { return JSON.parse(s || dflt); } catch { return JSON.parse(dflt); } };

async function joinLeadsAndCampaigns(drafts) {
  const leadIds = [...new Set(drafts.map((d) => d.lead_id))];
  const campIds = [...new Set(drafts.map((d) => d.campaign_id))];
  const leads = new Map((leadIds.length ? await prisma.leads.findMany({ where: { id: { in: leadIds } } }) : []).map((l) => [l.id, l]));
  const camps = new Map((campIds.length ? await prisma.campaigns.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c]));
  return { leads, camps };
}

// pending queue (evidence-rich) — drives the reviewer
router.get("/api/queue", async (req, res) => {
  try {
    const campaignId = int(req.query.campaign);
    const drafts = await prisma.drafts.findMany({
      where: { decision: "pending", ...(campaignId ? { campaign_id: campaignId } : {}) }, orderBy: { id: "asc" },
    });
    const { leads } = await joinLeadsAndCampaigns(drafts);
    const auditIds = drafts.map((d) => d.audit_id).filter(Boolean);
    const audits = new Map((auditIds.length ? await prisma.audits.findMany({ where: { id: { in: auditIds } }, select: { id: true, checks_json: true } }) : []).map((a) => [a.id, a]));
    const out = drafts.map((d) => {
      const l = leads.get(d.lead_id) || {};
      const checks = sortChecks(parse(audits.get(d.audit_id)?.checks_json, "[]"));
      return {
        draft_id: d.id, subject: d.subject || "", body: d.body || "", hook_key: d.hook_key,
        flags: parse(d.flags_json, "[]"), source: d.source || "", checks, campaign_id: d.campaign_id,
        name: l.name, website: l.website || "", email: l.email, email_type: l.email_type,
        city: l.city, industry: l.industry, review_count: l.review_count, first_name: l.first_name,
      };
    });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// list drafts by decision + campaign (Review list + Archive)
router.get("/api/drafts", async (req, res) => {
  try {
    const decision = req.query.decision || "pending";
    const campaign = req.query.campaign && req.query.campaign !== "all" ? int(req.query.campaign) : null;
    const where = {};
    if (decision === "decided") where.decision = { in: ["approved", "rejected"] };
    else if (decision !== "all") where.decision = decision;
    if (campaign) where.campaign_id = campaign;
    const page = Math.max(1, int(req.query.page, 1));
    const per = Math.min(100, Math.max(5, int(req.query.per, 25)));
    const total = await prisma.drafts.count({ where });
    const drafts = await prisma.drafts.findMany({
      where,
      orderBy: decision === "pending" ? { id: "asc" } : [{ decided_at: "desc" }, { id: "desc" }],
      skip: (page - 1) * per, take: per,
    });
    const { leads, camps } = await joinLeadsAndCampaigns(drafts);
    const draftIds = drafts.map((d) => d.id);
    const latestSends = new Map();
    if (draftIds.length) {
      for (const s of await prisma.sends.findMany({ where: { draft_id: { in: draftIds } }, orderBy: { id: "desc" }, select: { draft_id: true, status: true } })) {
        if (!latestSends.has(s.draft_id)) latestSends.set(s.draft_id, s.status);
      }
    }
    const items = drafts.map((d) => {
      const l = leads.get(d.lead_id) || {};
      return {
        draft_id: d.id, subject: d.final_subject || d.subject || "", hook_key: d.hook_key,
        flags_count: parse(d.flags_json, "[]").length, decision: d.decision, decided_at: d.decided_at,
        campaign_id: d.campaign_id, campaign_name: camps.get(d.campaign_id)?.name,
        name: l.name, website: l.website || "", email: l.email, email_type: l.email_type,
        city: l.city, industry: l.industry, review_count: l.review_count, send_status: latestSends.get(d.id) || null,
        score: l.score, lint_score: l.lint_score,
      };
    });
    res.json({ items, total, page, per, pages: Math.max(1, Math.ceil(total / per)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// full detail for one draft (evidence + editable copy)
router.get("/api/drafts/:id", async (req, res) => {
  try {
    const d = await prisma.drafts.findUnique({ where: { id: int(req.params.id) } });
    if (!d) return res.status(404).json({ error: "not found" });
    const l = await prisma.leads.findUnique({ where: { id: d.lead_id } });
    const camp = await prisma.campaigns.findUnique({ where: { id: d.campaign_id }, select: { name: true, attach_report_pdf: true } });
    const audit = d.audit_id ? await prisma.audits.findUnique({ where: { id: d.audit_id }, select: { checks_json: true } }) : null;
    const checks = sortChecks(parse(audit?.checks_json, "[]"));
    res.json({
      draft_id: d.id, lead_id: d.lead_id, company_id: l?.company_id || null,
      subject: d.final_subject || d.subject || "", body: d.final_body || d.body || "",
      preview_text: d.preview_text || "", hook_key: d.hook_key, flags: parse(d.flags_json, "[]"), source: d.source || "",
      checks, decision: d.decision, campaign_id: d.campaign_id, campaign_name: camp?.name,
      attach_pdf: d.attach_pdf, campaign_attach_default: camp?.attach_report_pdf ? 1 : 0,
      score: l?.score, lint: lintEmail({ subject: d.final_subject || d.subject || "", body: d.final_body || d.body || "" }),
      name: l?.name, website: l?.website || "", email: l?.email, email_type: l?.email_type,
      city: l?.city, industry: l?.industry, review_count: l?.review_count, first_name: l?.first_name,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// For flow-mode campaigns, a decided draft's lead is parked at a `review_gate`
// node — resolve its approved/rejected edge (chasing any branches beyond it) and
// advance the lead. Returns null for legacy (non-flow) campaigns, doing nothing.
async function resolveFlowDecision(draftId, decision) {
  const d = await prisma.drafts.findUnique({ where: { id: draftId }, select: { lead_id: true, campaign_id: true } });
  if (!d) return null;
  const campaign = await prisma.campaigns.findUnique({ where: { id: d.campaign_id }, select: { id: true, flow_id: true } });
  if (!campaign || !campaign.flow_id) return null;
  const { graph } = await flowEngine.loadGraph(campaign.id);
  const lead = await prisma.leads.findUnique({ where: { id: d.lead_id } });
  if (!lead || !lead.flow_node_id) return null;
  const gateNode = graph.nodes.find((n) => n.id === lead.flow_node_id && n.type === "review_gate");
  if (!gateNode) return null;
  const nextNode = await flowEngine.advanceLeadTo(graph, gateNode.id, decision === "approved" ? "approved" : "rejected", lead);
  return { nextNodeId: nextNode ? nextNode.id : null };
}

router.post("/api/decide", async (req, res) => {
  try {
    const b = req.body || {};
    const { draft_id, decision, subject = "", body = "" } = b;
    if (!draft_id || !["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "draft_id and decision (approved|rejected) required" });
    await data.decide(Number(draft_id), decision, subject, body, b.preview_text);
    // per-draft "attach the audit PDF" choice (null = follow the campaign default)
    if (b.attach_pdf !== undefined) await prisma.drafts.update({ where: { id: Number(draft_id) }, data: { attach_pdf: b.attach_pdf === null ? null : (b.attach_pdf ? 1 : 0) } });
    const flow = await resolveFlowDecision(Number(draft_id), decision);
    let send = null;
    if (decision === "approved") { try { send = await enqueueForDraft(draft_id, flow ? flow.nextNodeId : null); } catch (e) { send = { queued: 0, reason: e.message }; } }
    res.json({ ok: true, send });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/decide/bulk", async (req, res) => {
  try {
    const { draft_ids, decision } = req.body || {};
    if (!Array.isArray(draft_ids) || !draft_ids.length || !["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "draft_ids[] and decision required" });
    let queued = 0;
    for (const id of draft_ids) {
      const d = await prisma.drafts.findUnique({ where: { id: Number(id) }, select: { subject: true, body: true, final_subject: true, final_body: true } });
      if (!d) continue;
      await data.decide(Number(id), decision, d.final_subject || d.subject || "", d.final_body || d.body || "");
      const flow = await resolveFlowDecision(Number(id), decision);
      if (decision === "approved") { try { const r = await enqueueForDraft(id, flow ? flow.nextNodeId : null); queued += r.queued || 0; } catch { /* ignore */ } }
    }
    res.json({ ok: true, count: draft_ids.length, queued });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// re-crawl a lead's site and refresh stored evidence
router.post("/api/leads/:id/reaudit", async (req, res) => {
  try {
    const lead = await prisma.leads.findUnique({ where: { id: int(req.params.id) }, select: { id: true, website: true, company_id: true } });
    if (!lead) return res.status(404).json({ error: "not found" });
    if (!lead.website) return res.status(400).json({ error: "this lead has no website" });
    const result = await auditSite(lead.website);
    const platform = (result.meta && result.meta.platform) || null;
    const existing = await data.latestAudit(lead.id);
    if (existing) {
      await prisma.audits.update({ where: { id: existing.id }, data: { checks_json: JSON.stringify(result.checks), meta_json: JSON.stringify(result.meta || {}), platform, audited_at: new Date() } });
    } else {
      await data.saveAudit(lead.id, result);
    }
    if (lead.company_id) await prisma.companies.update({ where: { id: lead.company_id }, data: { platform: platform || undefined, last_activity: new Date() } });
    res.json({ ok: true, checks: sortChecks(result.checks), platform, hook: result.hook ? result.hook.key : null, fail_count: result.fail_count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// on-demand PageSpeed — mobile, desktop, or both
router.post("/api/leads/:id/pagespeed", async (req, res) => {
  try {
    const lead = await prisma.leads.findUnique({ where: { id: int(req.params.id) }, select: { website: true } });
    if (!lead || !lead.website) return res.status(400).json({ error: "this lead has no website" });
    const strategy = (req.body && req.body.strategy) || "mobile";
    if (strategy === "both") return res.json(await pagespeed.runBoth(lead.website));
    res.json(await pagespeed.runPagespeed(lead.website, { strategy }));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
