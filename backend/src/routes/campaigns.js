"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const data = require("../lib/data");
const queue = require("../jobs/queue");
const { processBatch } = require("../jobs/worker");
const config = require("../config");
const { csvToLeads } = require("../lib/csv");

const router = express.Router();

const STAGE_LABELS = [
  ["new", "waiting to be audited"], ["audited", "have a real finding"], ["skipped", "nothing to say — parked"],
  ["drafted", "waiting for review"], ["approved", "approved"], ["rejected", "rejected"], ["exported", "exported"],
];

function int(v, dflt) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : dflt; }

async function campaignSummary(c) {
  const counts = await data.pipelineCounts(c.id);
  const pending = await prisma.drafts.count({ where: { campaign_id: c.id, decision: "pending" } });
  const activeJobs = await prisma.jobs.count({ where: { campaign_id: c.id, status: { in: ["queued", "running"] } } });
  const total = await prisma.sends.count({ where: { campaign_id: c.id } });
  const sent = await prisma.sends.count({ where: { campaign_id: c.id, status: "sent" } });
  const queued = await prisma.sends.count({ where: { campaign_id: c.id, status: "queued" } });
  const replied = await prisma.sends.count({ where: { campaign_id: c.id, status: "replied" } });
  const failed = await prisma.sends.count({ where: { campaign_id: c.id, status: "failed" } });
  const accounts = await prisma.campaign_accounts.count({ where: { campaign_id: c.id } });
  return {
    ...c, counts,
    stages: STAGE_LABELS.filter(([k]) => counts[k]).map(([k, label]) => ({ key: k, label, n: counts[k] })),
    pending_review: pending, active_jobs: activeJobs, accounts,
    sends: { total, sent, queued, replied, failed },
  };
}

router.get("/api/campaigns", async (req, res) => {
  const rows = await prisma.campaigns.findMany({ orderBy: { id: "desc" } });
  res.json(await Promise.all(rows.map(campaignSummary)));
});

router.post("/api/campaigns", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.industry || !b.city) return res.status(400).json({ error: "name, industry and city are required" });
    if (b.flow_id && !config.flowBuilderEnabled) return res.status(403).json({ error: "the flow builder isn't enabled on this deployment" });
    const defTz = await data.getSetting("default_timezone");
    const defSender = await data.getSetting("default_sender");
    const row = await prisma.campaigns.create({
      data: {
        name: b.name, industry: b.industry, city: b.city,
        leads_per_run: int(b.leads_per_run, 60), audits_per_run: int(b.audits_per_run, 60), emails_per_day: int(b.emails_per_day, 30),
        min_reviews: int(b.min_reviews, 0), require_website: b.require_website === false ? 0 : 1, delay_ms: int(b.delay_ms, 1500),
        ai_provider: b.ai_provider || "template", ai_model: b.ai_model || null, pitch_rules: b.pitch_rules || null,
        sender_name: b.sender_name || defSender || null, source_provider: b.source_provider || "google_places",
        timezone: defTz || null, status: "active", created_at: new Date(),
        attach_report_pdf: b.attach_report_pdf === false ? 0 : 1,
        flow_id: b.flow_id ? int(b.flow_id) : null,
      },
    });
    res.json({ id: row.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/campaigns/:id", async (req, res) => {
  const c = await prisma.campaigns.findUnique({ where: { id: int(req.params.id) } });
  if (!c) return res.status(404).json({ error: "not found" });
  res.json(await campaignSummary(c));
});

router.put("/api/campaigns/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const strFields = ["name", "industry", "city", "ai_provider", "ai_model", "pitch_rules", "sender_name", "sender_email", "status", "booking_link", "source_provider", "timezone"];
    const intFields = ["leads_per_run", "audits_per_run", "emails_per_day", "min_reviews", "delay_ms", "send_start_hour", "send_end_hour", "send_gap_min_sec", "send_gap_max_sec"];
    const bools = ["require_website", "sending_enabled", "track_opens", "track_clicks", "send_weekdays_only", "pagespeed_in_audit", "attach_report_pdf"];
    const data2 = {};
    for (const f of strFields) if (b[f] !== undefined) data2[f] = b[f];
    for (const f of intFields) if (b[f] !== undefined) data2[f] = int(b[f], 0);
    for (const f of bools) if (b[f] !== undefined) data2[f] = b[f] ? 1 : 0;
    if (b.include_unsubscribe !== undefined) {
      const v = b.include_unsubscribe;
      data2.include_unsubscribe = (v === "on" || v === 1 || v === true || v === "1") ? 1 : (v === "off" || v === 0 || v === false || v === "0") ? 0 : null;
    }
    if (b.email_template_id !== undefined) {
      data2.email_template_id = b.email_template_id ? int(b.email_template_id) : null;
    }
    if (b.disabled_checks !== undefined) {
      data2.disabled_checks = Array.isArray(b.disabled_checks) ? b.disabled_checks.join(",") : (b.disabled_checks || null);
    }
    if (!Object.keys(data2).length) return res.json({ ok: true });
    await prisma.campaigns.update({ where: { id: int(req.params.id) }, data: data2 });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/campaigns/:id/run", async (req, res) => {
  try {
    const c = await prisma.campaigns.findUnique({ where: { id: int(req.params.id) }, select: { id: true, flow_id: true } });
    if (!c) return res.status(404).json({ error: "not found" });

    if (c.flow_id) {
      const flowRow = await prisma.flows.findUnique({ where: { id: c.flow_id } });
      if (!flowRow) return res.status(500).json({ error: "campaign's flow no longer exists" });
      const graph = JSON.parse(flowRow.graph_json);
      const entryNode = graph.nodes.find((n) => n.id === graph.entry);
      if (!entryNode) return res.status(500).json({ error: "flow has no valid entry node" });
      const jobId = await queue.enqueue(entryNode.type, c.id, {}, null, entryNode.id);
      return res.json({ ok: true, job_id: jobId, stage: entryNode.type, node_id: entryNode.id });
    }

    const stage = (req.body && req.body.stage) || "source";
    const jobId = await queue.enqueue(stage, c.id);
    res.json({ ok: true, job_id: jobId, stage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CSV import — parsed here, inserted by the queue in chunks
router.post("/api/campaigns/:id/import", async (req, res) => {
  try {
    const c = await prisma.campaigns.findUnique({ where: { id: int(req.params.id) }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "not found" });
    const text = (req.body && req.body.csv) || "";
    if (!text.trim()) return res.status(400).json({ error: "no CSV content" });
    const { leads, skipped, columns } = csvToLeads(text);
    if (!leads.length) return res.status(400).json({ error: "no rows with a business name found — the first row must be a header (name, website, email, phone, city…)" });
    const CHUNK = 100;
    let jobs = 0;
    for (let i = 0; i < leads.length; i += CHUNK) {
      await queue.enqueue("import", c.id, { rows: leads.slice(i, i + CHUNK), last: i + CHUNK >= leads.length });
      jobs++;
    }
    await processBatch(1);
    res.json({ ok: true, parsed: leads.length, skipped, chunks: jobs, columns });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/tick", async (req, res) => {
  try { res.json(await processBatch(int((req.body && req.body.max), config.batch.audit + config.batch.draft))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- sending accounts assigned to a campaign ----
router.get("/api/campaigns/:id/accounts", async (req, res) => {
  const all = await prisma.sending_accounts.findMany({
    select: { id: true, name: true, method: true, from_email: true, daily_cap: true, sent_today: true, status: true }, orderBy: { id: "desc" },
  });
  const assigned = await prisma.campaign_accounts.findMany({ where: { campaign_id: int(req.params.id) }, select: { account_id: true } });
  res.json({ all, assigned: assigned.map((r) => r.account_id) });
});

router.put("/api/campaigns/:id/accounts", async (req, res) => {
  try {
    const cid = int(req.params.id);
    const ids = Array.isArray(req.body && req.body.account_ids) ? req.body.account_ids.map(Number).filter(Boolean) : [];
    await prisma.campaign_accounts.deleteMany({ where: { campaign_id: cid } });
    for (const aid of ids) {
      await prisma.campaign_accounts.upsert({ where: { campaign_id_account_id: { campaign_id: cid, account_id: aid } }, update: {}, create: { campaign_id: cid, account_id: aid } });
    }
    res.json({ ok: true, count: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- follow-up sequence ----
router.get("/api/campaigns/:id/sequence", async (req, res) => {
  const steps = await prisma.sequence_steps.findMany({ where: { campaign_id: int(req.params.id) }, orderBy: { step_no: "asc" } });
  res.json(steps);
});

router.put("/api/campaigns/:id/sequence", async (req, res) => {
  try {
    const cid = int(req.params.id);
    const steps = Array.isArray(req.body && req.body.steps) ? req.body.steps : [];
    await prisma.sequence_steps.deleteMany({ where: { campaign_id: cid } });
    for (const s of steps) {
      await prisma.sequence_steps.create({
        data: { campaign_id: cid, step_no: int(s.step_no, 2), day_offset: int(s.day_offset, 0), subject: s.subject || null, body: s.body || null, active: s.active === false ? 0 : 1 },
      });
    }
    res.json({ ok: true, count: steps.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- A/B subject variants ----
router.get("/api/campaigns/:id/subjects", async (req, res) => {
  const rows = await prisma.subject_variants.findMany({ where: { campaign_id: int(req.params.id) }, orderBy: { id: "asc" } });
  res.json(rows.map((r) => ({ ...r, reply_rate: r.sent_count ? Math.round((r.replied_count / r.sent_count) * 1000) / 10 : 0 })));
});

router.put("/api/campaigns/:id/subjects", async (req, res) => {
  try {
    const cid = int(req.params.id);
    const variants = Array.isArray(req.body && req.body.variants) ? req.body.variants : [];
    const keepIds = [];
    for (const v of variants) {
      const subject = (v.subject || "").trim();
      if (!subject) continue;
      const active = v.active === false ? 0 : 1;
      if (v.id) {
        await prisma.subject_variants.updateMany({ where: { id: Number(v.id), campaign_id: cid }, data: { subject, active } });
        keepIds.push(Number(v.id));
      } else {
        const r = await prisma.subject_variants.create({ data: { campaign_id: cid, subject, active, created_at: new Date() } });
        keepIds.push(r.id);
      }
    }
    await prisma.subject_variants.deleteMany({ where: { campaign_id: cid, id: { notIn: keepIds.length ? keepIds : [0] } } });
    res.json({ ok: true, count: keepIds.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- sending stats ----
router.get("/api/campaigns/:id/stats", async (req, res) => {
  const cid = int(req.params.id);
  const w = (extra) => ({ campaign_id: cid, ...extra });
  const stats = {
    total: await prisma.sends.count({ where: w() }),
    sent: await prisma.sends.count({ where: w({ status: "sent" }) }),
    queued: await prisma.sends.count({ where: w({ status: "queued" }) }),
    replied: await prisma.sends.count({ where: w({ status: "replied" }) }),
    failed: await prisma.sends.count({ where: w({ status: "failed" }) }),
    canceled: await prisma.sends.count({ where: w({ status: "canceled" }) }),
    opened: await prisma.sends.count({ where: w({ opened_at: { not: null } }) }),
    clicked: await prisma.sends.count({ where: w({ clicked_at: { not: null } }) }),
  };
  const recentRows = await prisma.sends.findMany({ where: w(), orderBy: { id: "desc" }, take: 25 });
  const leadIds = [...new Set(recentRows.map((s) => s.lead_id))];
  const leadMap = new Map((leadIds.length ? await prisma.leads.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, email: true } }) : []).map((l) => [l.id, l]));
  const recent = recentRows.map((s) => ({ id: s.id, status: s.status, step_no: s.step_no, sent_at: s.sent_at, opened_at: s.opened_at, replied_at: s.replied_at, name: leadMap.get(s.lead_id)?.name || "", email: leadMap.get(s.lead_id)?.email || "" }));
  res.json({ stats, recent });
});

module.exports = router;
