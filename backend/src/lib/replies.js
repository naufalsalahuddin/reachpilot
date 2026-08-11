"use strict";
/**
 * Poll an owned account's IMAP inbox for replies AND bounces (Prisma).
 *  - a reply from a lead marks the send 'replied' + cancels follow-ups.
 *  - a bounce (mailer-daemon / DSN) suppresses the address, marks the send 'bounced',
 *    and auto-pauses the inbox if its bounce rate gets dangerous.
 */
const { ImapFlow } = require("imapflow");
const prisma = require("./prisma");
const { decryptJSON } = require("./crypto");
const suppress = require("./suppress");
const data = require("./data");
const { fireWebhook } = require("./webhook");
const crm = require("./crm");

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function looksLikeBounce(from, subject) {
  const f = (from || "").toLowerCase(), s = (subject || "").toLowerCase();
  if (/mailer-daemon|postmaster|maildelivery|mail\.delivery/.test(f)) return true;
  return /undeliverable|delivery status notification|delivery has failed|delivery failure|returned mail|failure notice|mail delivery (failed|subsystem)|address not found|message not delivered|could not be delivered/.test(s);
}

async function handleBounce(client, msg, account) {
  let body = "";
  try { const full = await client.fetchOne(msg.uid, { source: true }, { uid: true }); body = full?.source?.toString("utf8") || ""; } catch { return false; }
  const emails = [...new Set((body.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))].filter((e) => !/mailer-daemon|postmaster|@.*\b(google|outlook|yahoo|proofpoint)\b/.test(e));
  if (!emails.length) return false;
  const leads = await prisma.leads.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, company_id: true } });
  if (!leads.length) return false;
  const send = await prisma.sends.findFirst({ where: { account_id: account.id, status: "sent", lead_id: { in: leads.map((l) => l.id) } }, orderBy: { id: "desc" } });
  if (!send) return false;
  const lead = leads.find((l) => l.id === send.lead_id);
  await suppress.add(lead.email, "email", "hard bounce");
  await prisma.sends.update({ where: { id: send.id }, data: { status: "bounced", error: "bounced (delivery failed)" } });
  await prisma.sending_accounts.update({ where: { id: account.id }, data: { bounces_today: { increment: 1 } } });
  if (lead.company_id) { try { await prisma.companies.update({ where: { id: lead.company_id }, data: { status: "dnc" } }); } catch { /* ignore */ } }
  fireWebhook("bounce", { email: lead.email, account_id: account.id, send_id: send.id });
  return true;
}

async function checkAccount(account) {
  const cfg = decryptJSON(account.config_json);
  const host = cfg.imap_host || (account.method === "gmail_api" ? "imap.gmail.com" : cfg.host);
  const user = cfg.imap_user || cfg.user || account.from_email;
  const pass = cfg.imap_pass || cfg.pass;
  if (!host || !user || !pass) return { checked: false, reason: "no imap creds" };

  const client = new ImapFlow({ host, port: Number(cfg.imap_port) || 993, secure: true, auth: { user, pass }, logger: false, connectionTimeout: 12000, greetingTimeout: 8000, socketTimeout: 30000 });
  client.on("error", () => {});
  let matched = 0, bounced = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = account.last_checked ? new Date(account.last_checked) : new Date(Date.now() - 2 * 86400000);
      const uids = await client.search({ since }, { uid: true });
      if (uids && uids.length) {
        for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
          const from = msg.envelope?.from?.[0]?.address;
          const subject = msg.envelope?.subject || "";
          if (!from) continue;

          if (looksLikeBounce(from, subject)) { if (await handleBounce(client, msg, account)) bounced++; continue; }

          const leadRows = await prisma.leads.findMany({ where: { email: from.toLowerCase() }, select: { id: true, company_id: true } });
          if (!leadRows.length) continue;
          const send = await prisma.sends.findFirst({ where: { account_id: account.id, status: "sent", replied_at: null, lead_id: { in: leadRows.map((l) => l.id) } }, select: { id: true, lead_id: true, subject_variant_id: true } });
          if (!send) continue;

          let snippet = null;
          try {
            const full = await client.fetchOne(msg.uid, { source: true }, { uid: true });
            if (full && full.source) { const b = full.source.toString("utf8").split(/\r?\n\r?\n/).slice(1).join("\n\n"); snippet = b.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) || null; }
          } catch { /* snippet stays null */ }
          const companyId = leadRows.find((l) => l.id === send.lead_id)?.company_id || null;
          const receivedAt = msg.envelope.date ? new Date(msg.envelope.date) : new Date();

          await prisma.inbox_messages.create({ data: { account_id: account.id, lead_id: send.lead_id, company_id: companyId, send_id: send.id, from_email: from.toLowerCase(), subject: (msg.envelope.subject || "").slice(0, 500), snippet, received_at: receivedAt, status: "unread", created_at: new Date() } });
          await prisma.sends.update({ where: { id: send.id }, data: { status: "replied", replied_at: new Date() } });
          await prisma.sends.updateMany({ where: { lead_id: send.lead_id, status: "queued" }, data: { status: "canceled" } });
          if (companyId) await prisma.companies.update({ where: { id: companyId }, data: { status: "replied", last_activity: new Date() } });
          if (send.subject_variant_id) await prisma.subject_variants.update({ where: { id: send.subject_variant_id }, data: { replied_count: { increment: 1 } } });
          fireWebhook("reply", { from: from.toLowerCase(), lead_id: send.lead_id, company_id: companyId, send_id: send.id });
          try { const cl = await prisma.leads.findUnique({ where: { id: send.lead_id }, select: { email: true, name: true, phone: true, website: true } }); if (cl && cl.email) crm.pushContact(cl, "reply").catch(() => {}); } catch { /* ignore */ }
          matched++;
        }
      }
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }

  await prisma.sending_accounts.update({ where: { id: account.id }, data: { last_checked: new Date() } });

  // auto-pause a high-bounce inbox to protect the domain reputation
  const acc = await prisma.sending_accounts.findUnique({ where: { id: account.id }, select: { sent_today: true, bounces_today: true, status: true, name: true } });
  const rate = parseFloat(await data.getSetting("bounce_pause_rate")) || 0.08;
  if (acc && acc.status === "active" && acc.sent_today >= 20 && acc.bounces_today / acc.sent_today >= rate) {
    await prisma.sending_accounts.update({ where: { id: account.id }, data: { status: "paused" } });
    console.warn(`[bounce] paused inbox "${acc.name}" — ${acc.bounces_today}/${acc.sent_today} bounced`);
    fireWebhook("inbox_paused", { account_id: account.id, name: acc.name, bounces_today: acc.bounces_today, sent_today: acc.sent_today });
  }
  return { checked: true, matched, bounced };
}

module.exports = { checkAccount, looksLikeBounce };
