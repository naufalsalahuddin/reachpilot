"use strict";
/**
 * Public tracking endpoints (no auth — the tracking id is the token). Prisma port.
 *   GET /t/o/:tid.gif   open pixel
 *   GET /t/c/:tid?u=...  click redirect
 *   GET /u/:tid          unsubscribe
 *   ALL /webhook/meeting booking webhook (token-guarded)
 */
const express = require("express");
const prisma = require("../lib/prisma");
const suppress = require("../lib/suppress");
const config = require("../config");
const { fireWebhook } = require("../lib/webhook");
const crm = require("../lib/crm");

const router = express.Router();

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim().slice(0, 64);
}

async function recordEvent(tid, type, url, req) {
  const send = await prisma.sends.findFirst({ where: { tracking_id: tid }, select: { id: true } });
  if (!send) return;
  await prisma.tracking_events.create({
    data: { send_id: send.id, type, url: url || null, ip: clientIp(req), ua: (req.headers["user-agent"] || "").slice(0, 512), created_at: new Date() },
  });
  if (type === "open") {
    await prisma.sends.update({ where: { id: send.id }, data: { open_count: { increment: 1 } } });
    await prisma.sends.updateMany({ where: { id: send.id, opened_at: null }, data: { opened_at: new Date() } });
  } else if (type === "click") {
    await prisma.sends.update({ where: { id: send.id }, data: { click_count: { increment: 1 } } });
    await prisma.sends.updateMany({ where: { id: send.id, clicked_at: null }, data: { clicked_at: new Date() } });
  }
}

router.get("/t/o/:tid.gif", async (req, res) => {
  try { await recordEvent(req.params.tid, "open", null, req); } catch { /* never break the pixel */ }
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.end(PIXEL);
});

router.get("/t/c/:tid", async (req, res) => {
  const url = req.query.u || "";
  try { await recordEvent(req.params.tid, "click", url, req); } catch { /* ignore */ }
  if (/^https?:\/\//i.test(url)) return res.redirect(302, url);
  res.status(400).send("bad link");
});

router.get("/u/:tid", async (req, res) => {
  try {
    const send = await prisma.sends.findFirst({ where: { tracking_id: req.params.tid }, select: { lead_id: true } });
    if (send) {
      const lead = await prisma.leads.findUnique({ where: { id: send.lead_id }, select: { email: true, company_id: true } });
      if (lead && lead.email) {
        await suppress.add(lead.email, "email", "unsubscribed");
        if (lead.company_id) await prisma.companies.update({ where: { id: lead.company_id }, data: { status: "dnc" } });
        await prisma.sends.updateMany({ where: { lead_id: send.lead_id, status: "queued" }, data: { status: "canceled" } });
      }
    }
  } catch { /* still show confirmation */ }
  res.set("Content-Type", "text/html; charset=utf-8").send(
    `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Unsubscribed</title>` +
    `<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f5fa;color:#1b1b2e">` +
    `<div style="text-align:center;max-width:440px;padding:32px"><h2 style="margin:0 0 10px">You've been unsubscribed</h2>` +
    `<p style="color:#6b6b80;line-height:1.6">You won't receive any more emails from us. Sorry for the interruption.</p></div></body>`
  );
});

// Mark the matching company as "meeting" + notify webhook/CRM. Shared by all booking sources.
async function markMeeting(email) {
  email = String(email || "").toLowerCase().trim();
  if (!email) return { matched: false };
  const company = await prisma.companies.findFirst({ where: { email }, select: { id: true, name: true, phone: true, website: true } });
  if (!company) return { matched: false };
  await prisma.companies.update({ where: { id: company.id }, data: { status: "meeting", last_activity: new Date() } });
  fireWebhook("meeting", { email, company_id: company.id });
  crm.pushContact({ email, name: company.name, phone: company.phone, website: company.website }, "meeting").catch(() => {});
  return { matched: true, company_id: company.id };
}

// generic booking webhook (token-guarded) — email in query/body
router.all("/webhook/meeting", async (req, res) => {
  if (!config.cronToken || req.query.token !== config.cronToken) return res.status(403).json({ error: "bad token" });
  const email = req.query.email || (req.body && req.body.email);
  if (!email) return res.status(400).json({ error: "email required" });
  res.json({ ok: true, ...(await markMeeting(email)) });
});

// Calendly native webhook (invitee.created). Point Calendly's webhook here.
router.post("/webhook/calendly", async (req, res) => {
  if (!config.cronToken || req.query.token !== config.cronToken) return res.status(403).json({ error: "bad token" });
  const p = req.body && req.body.payload;
  const email = p && (p.email || (p.invitee && p.invitee.email) || (p.questions_and_answers || []).find?.((q) => /email/i.test(q.question))?.answer);
  if (!email) return res.json({ ok: true, matched: false });
  res.json({ ok: true, ...(await markMeeting(email)) });
});

// Cal.com native webhook (BOOKING_CREATED). Point Cal.com's webhook here.
router.post("/webhook/calcom", async (req, res) => {
  if (!config.cronToken || req.query.token !== config.cronToken) return res.status(403).json({ error: "bad token" });
  const p = req.body && req.body.payload;
  const email = p && ((p.attendees && p.attendees[0] && p.attendees[0].email) || p.responses?.email?.value || p.email);
  if (!email) return res.json({ ok: true, matched: false });
  res.json({ ok: true, ...(await markMeeting(email)) });
});

module.exports = router;
