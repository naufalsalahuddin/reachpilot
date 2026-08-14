"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const { cleanUrl } = require("../lib/url");
const data = require("../lib/data");
const suppress = require("../lib/suppress");

const router = express.Router();
const STATUSES = ["new", "contacted", "opened", "replied", "interested", "meeting", "customer", "lost", "dnc"];
const clampInt = (v, dflt, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : dflt; };

async function buildWhere(q) {
  const where = {};
  if (q.status && STATUSES.includes(q.status)) where.status = q.status;
  if (q.platform) where.platform = q.platform;
  if (q.q) where.OR = [{ name: { contains: q.q } }, { domain: { contains: q.q } }, { email: { contains: q.q } }, { city: { contains: q.q } }];
  if (q.tag) where.tags = { contains: q.tag };
  if (q.campaign && q.campaign !== "all") {
    const ids = await prisma.leads.findMany({ where: { campaign_id: parseInt(q.campaign, 10) }, select: { company_id: true }, distinct: ["company_id"] });
    where.id = { in: ids.map((r) => r.company_id).filter(Boolean) };
  }
  if ((await data.getSetting("hide_leads_no_email")) === "1") where.email = { not: null };
  return where;
}

// distinct tags across all companies (for the tag filter + autocomplete)
async function allTags() {
  const rows = await prisma.companies.findMany({ where: { tags: { not: null } }, select: { tags: true } });
  const set = new Set();
  for (const r of rows) for (const t of (r.tags || "").split(",").map((x) => x.trim()).filter(Boolean)) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

router.get("/api/companies", async (req, res) => {
  try {
    const page = clampInt(req.query.page, 1, 1, 1e6);
    const per = clampInt(req.query.per, 25, 5, 100);
    const where = await buildWhere(req.query);
    const total = await prisma.companies.count({ where });
    const orderBy = req.query.sort === "no_email"
      ? [{ email: { sort: "asc", nulls: "first" } }, { id: "desc" }]
      : req.query.sort === "no_email_last"
      ? [{ email: { sort: "asc", nulls: "last" } }, { id: "desc" }]
      : [{ last_activity: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    const items = await prisma.companies.findMany({
      where, orderBy, skip: (page - 1) * per, take: per,
    });
    // campaign counts per company
    const ids = items.map((c) => c.id);
    const leadRows = ids.length ? await prisma.leads.findMany({ where: { company_id: { in: ids } }, select: { company_id: true, campaign_id: true } }) : [];
    const counts = {};
    for (const l of leadRows) { (counts[l.company_id] = counts[l.company_id] || new Set()).add(l.campaign_id); }
    res.json({ items: items.map((c) => ({ ...c, campaigns: counts[c.id] ? counts[c.id].size : 0 })), total, page, per, pages: Math.max(1, Math.ceil(total / per)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/companies/stats", async (req, res) => {
  const rows = await prisma.companies.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = {}; for (const r of rows) counts[r.status] = r._count._all;
  const total = await prisma.companies.count();
  res.json({ counts, total });
});

router.get("/api/companies/export", async (req, res) => {
  try {
    const where = await buildWhere(req.query);
    const cols = ["name", "domain", "website", "email", "email_type", "phone", "street", "city", "state", "postal_code", "country", "industry", "rating", "review_count", "platform", "status", "tags", "contract_value", "last_activity"];
    const rows = await prisma.companies.findMany({ where, orderBy: { name: "asc" }, take: 50000 });
    const cell = (v) => { if (v == null) return ""; const s = v instanceof Date ? v.toISOString() : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/companies/tags", async (req, res) => {
  try { res.json(await allTags()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/companies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const company = await prisma.companies.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ error: "not found" });

    const leadRows = await prisma.leads.findMany({ where: { company_id: id }, select: { id: true, campaign_id: true, status: true, email: true, email_type: true } });
    const campIds = [...new Set(leadRows.map((l) => l.campaign_id))];
    const camps = new Map((campIds.length ? await prisma.campaigns.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]));
    const leadIds = leadRows.map((l) => l.id);
    // latest draft per lead so the CRM can deep-link straight into Review
    const draftByLead = new Map();
    if (leadIds.length) {
      for (const dr of await prisma.drafts.findMany({ where: { lead_id: { in: leadIds } }, orderBy: { id: "desc" }, select: { id: true, lead_id: true, decision: true } })) {
        if (!draftByLead.has(dr.lead_id)) draftByLead.set(dr.lead_id, dr);
      }
    }
    const leads = leadRows.map((l) => ({ ...l, campaign_name: camps.get(l.campaign_id), draft_id: draftByLead.get(l.id)?.id || null, draft_decision: draftByLead.get(l.id)?.decision || null }));

    const events = [];
    if (leadIds.length) {
      for (const a of await prisma.audits.findMany({ where: { lead_id: { in: leadIds } }, select: { audited_at: true, hook_key: true, blocked: true } })) {
        events.push({ at: a.audited_at, type: "audit", text: a.blocked ? "Audited — bot-protected" : (a.hook_key ? `Audited — found "${a.hook_key}"` : "Audited — nothing to pitch") });
      }
      for (const d of await prisma.drafts.findMany({ where: { lead_id: { in: leadIds } }, select: { created_at: true, decided_at: true, decision: true, hook_key: true } })) {
        events.push({ at: d.created_at, type: "draft", text: `Email drafted (${d.hook_key || "generic"})` });
        if (d.decided_at) events.push({ at: d.decided_at, type: d.decision, text: `Draft ${d.decision}` });
      }
      for (const s of await prisma.sends.findMany({ where: { lead_id: { in: leadIds } }, select: { sent_at: true, replied_at: true, opened_at: true, step_no: true } })) {
        if (s.sent_at) events.push({ at: s.sent_at, type: "sent", text: `Email sent (step ${s.step_no})` });
        if (s.opened_at) events.push({ at: s.opened_at, type: "open", text: "Opened the email" });
        if (s.replied_at) events.push({ at: s.replied_at, type: "reply", text: "Replied" });
      }
    }
    const noteRows = await prisma.company_notes.findMany({ where: { company_id: id }, orderBy: { id: "desc" } });
    const userIds = [...new Set(noteRows.map((n) => n.user_id).filter(Boolean))];
    const users = new Map((userIds.length ? await prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : []).map((u) => [u.id, u.email]));
    const notes = noteRows.map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: users.get(n.user_id) || null }));
    for (const n of notes) events.push({ at: n.created_at, type: "note", text: n.body, author: n.author });

    events.sort((a, b) => (a.at < b.at ? 1 : -1));
    res.json({ company, leads, notes, timeline: events, statuses: STATUSES });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/api/companies/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const dataObj = {};
    if (b.status && STATUSES.includes(b.status)) dataObj.status = b.status;
    for (const f of ["tags", "assigned_to", "email", "email_type", "phone", "industry", "city", "address", "street", "state", "postal_code", "country"]) {
      if (b[f] !== undefined) dataObj[f] = b[f] === "" ? null : b[f];
    }
    if (b.contract_value !== undefined) dataObj.contract_value = b.contract_value === "" || b.contract_value == null ? null : parseInt(b.contract_value, 10) || null;
    if (b.website !== undefined) dataObj.website = cleanUrl(b.website); // strip UTM/query on edit
    if (b.name !== undefined && String(b.name).trim()) dataObj.name = String(b.name).trim();
    if (!Object.keys(dataObj).length) return res.json({ ok: true });
    dataObj.last_activity = new Date();
    const cid = parseInt(req.params.id, 10);
    await prisma.companies.update({ where: { id: cid }, data: dataObj });

    // Keep the linked leads in sync — sending + review read lead.email/website, so a
    // contact edit on the company must reach them (that was the desync you spotted).
    const leadSync = {};
    for (const f of ["email", "email_type", "phone", "website", "city", "industry", "name"]) if (dataObj[f] !== undefined) leadSync[f] = dataObj[f];
    if (Object.keys(leadSync).length) await prisma.leads.updateMany({ where: { company_id: cid }, data: leadSync });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Un-blocks a company after a bad email caused a bounce/suppression (or it was
// suppressed manually) — clears any matching suppression entry (by exact email
// or by domain, whichever matched), resets the status, and re-queues any
// failed/suppressed/blocked sends for its leads so the next pipeline tick
// actually resends using the corrected email (edit it via PUT first).
router.post("/api/companies/:id/restore", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const company = await prisma.companies.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ error: "not found" });

    let suppressionRemoved = 0;
    if (company.email) {
      const e = company.email.trim().toLowerCase();
      const d = suppress.domainOf(e);
      const or = [{ value: e }];
      if (d) or.push({ kind: "domain", value: d });
      const r = await prisma.suppression.deleteMany({ where: { OR: or } });
      suppressionRemoved = r.count;
    }

    await prisma.companies.update({ where: { id }, data: { status: "new", last_activity: new Date() } });

    const leadIds = (await prisma.leads.findMany({ where: { company_id: id }, select: { id: true } })).map((l) => l.id);
    let sendsRequeued = 0;
    if (leadIds.length) {
      const r = await prisma.sends.updateMany({
        where: { lead_id: { in: leadIds }, status: { in: ["failed", "suppressed", "blocked"] } },
        data: { status: "queued", scheduled_at: new Date(), error: null },
      });
      sendsRequeued = r.count;
    }

    res.json({ ok: true, suppressionRemoved, sendsRequeued });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/companies/:id/notes", async (req, res) => {
  try {
    const body = (req.body && req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "note is empty" });
    await prisma.company_notes.create({ data: { company_id: parseInt(req.params.id, 10), user_id: req.session.userId, body, created_at: new Date() } });
    await prisma.companies.update({ where: { id: parseInt(req.params.id, 10) }, data: { last_activity: new Date() } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
