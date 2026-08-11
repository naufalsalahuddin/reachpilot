"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const crm = require("../lib/crm");
const { fireWebhook } = require("../lib/webhook");
const sending = require("../sending");

const router = express.Router();

router.get("/api/inbox/unread_count", async (req, res) => {
  const count = await prisma.inbox_messages.count({ where: { status: "unread" } });
  res.json({ count });
});

router.get("/api/inbox", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const per = Math.min(100, Math.max(10, parseInt(req.query.per, 10) || 25));
    const where = {};
    if (req.query.status && ["unread", "read", "archived"].includes(req.query.status)) where.status = req.query.status;
    const total = await prisma.inbox_messages.count({ where });
    const rows = await prisma.inbox_messages.findMany({
      where, orderBy: [{ received_at: "desc" }, { id: "desc" }], skip: (page - 1) * per, take: per,
    });
    const companyIds = [...new Set(rows.map((m) => m.company_id).filter(Boolean))];
    const companies = companyIds.length ? await prisma.companies.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true, status: true } }) : [];
    const cmap = new Map(companies.map((c) => [c.id, c]));
    const items = rows.map((m) => ({ ...m, company_name: cmap.get(m.company_id)?.name || null, company_status: cmap.get(m.company_id)?.status || null }));
    res.json({ items, total, page, per, pages: Math.max(1, Math.ceil(total / per)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/inbox/:id/action", async (req, res) => {
  try {
    const m = await prisma.inbox_messages.findUnique({ where: { id: parseInt(req.params.id, 10) } });
    if (!m) return res.status(404).json({ error: "not found" });
    const action = (req.body && req.body.action) || "read";
    const msgStatus = action === "archive" ? "archived" : "read";
    await prisma.inbox_messages.update({ where: { id: m.id }, data: { status: msgStatus } });
    if (m.company_id && (action === "interested" || action === "not_interested")) {
      await prisma.companies.update({ where: { id: m.company_id }, data: { status: action === "interested" ? "interested" : "lost", last_activity: new Date() } });
      if (action === "interested") {
        const co = await prisma.companies.findUnique({ where: { id: m.company_id }, select: { email: true, name: true, phone: true, website: true } });
        fireWebhook("interested", { company_id: m.company_id, email: co?.email });
        if (co && co.email) crm.pushContact(co, "interested").catch(() => {});
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// reply to the lead directly from the portal, through the inbox that received it
router.post("/api/inbox/:id/reply", async (req, res) => {
  try {
    const body = (req.body && req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "message is empty" });
    const m = await prisma.inbox_messages.findUnique({ where: { id: parseInt(req.params.id, 10) } });
    if (!m) return res.status(404).json({ error: "not found" });
    if (!m.account_id) return res.status(400).json({ error: "this message has no linked inbox" });
    const account = await prisma.sending_accounts.findUnique({ where: { id: m.account_id } });
    if (!account || !sending.isOwned(account.method)) return res.status(400).json({ error: "can only reply from an owned inbox (SMTP/Gmail)" });
    const subject = /^re:/i.test(m.subject || "") ? m.subject : `Re: ${m.subject || "your message"}`;
    await sending.sendVia(account, { to: m.from_email, subject, text: body, fromName: account.from_name, fromEmail: account.from_email });
    await prisma.inbox_messages.update({ where: { id: m.id }, data: { status: "read" } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
