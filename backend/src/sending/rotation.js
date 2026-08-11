"use strict";
/** Sending-account rotation, daily caps, warmup ramp + per-domain limits (Prisma). */
const prisma = require("../lib/prisma");
const data = require("../lib/data");

function todayMidnightUtc() { return new Date(new Date().toISOString().slice(0, 10)); }
function domainOf(email) { const at = String(email || "").lastIndexOf("@"); return at >= 0 ? email.slice(at + 1).toLowerCase() : ""; }

async function resetDailyCaps() {
  await prisma.sending_accounts.updateMany({
    where: { OR: [{ last_reset: null }, { last_reset: { lt: todayMidnightUtc() } }] },
    data: { sent_today: 0, bounces_today: 0, last_reset: todayMidnightUtc() },
  });
}

/** Effective cap for today — ramps while an inbox is warming up. */
function effectiveCap(a, base, step) {
  if (!a.warmup) return a.daily_cap;
  const days = a.created_at ? Math.max(0, Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000)) : 0;
  return Math.min(a.daily_cap, base + step * days);
}

async function settings() {
  const base = parseInt(await data.getSetting("warmup_base"), 10);
  const step = parseInt(await data.getSetting("warmup_step"), 10);
  const domainCap = parseInt(await data.getSetting("per_domain_daily_cap"), 10);
  return {
    base: Number.isFinite(base) ? base : 8,
    step: Number.isFinite(step) ? step : 6,
    domainCap: Number.isFinite(domainCap) ? domainCap : 0, // 0 = off
  };
}

/** Sum of today's sends per from-domain across ALL active inboxes. */
async function domainSentMap() {
  const accts = await prisma.sending_accounts.findMany({ where: { status: "active" }, select: { from_email: true, sent_today: true } });
  const map = {};
  for (const a of accts) { const d = domainOf(a.from_email); map[d] = (map[d] || 0) + a.sent_today; }
  return map;
}

async function assignedAccountIds(campaignId) {
  const rows = await prisma.campaign_accounts.findMany({ where: { campaign_id: Number(campaignId) }, select: { account_id: true } });
  return rows.map((r) => r.account_id);
}

async function pickAccount(campaignId) {
  const ids = await assignedAccountIds(campaignId);
  if (!ids.length) return null;
  const { base, step, domainCap } = await settings();
  const accts = await prisma.sending_accounts.findMany({ where: { id: { in: ids }, status: "active" }, orderBy: [{ sent_today: "asc" }, { id: "asc" }] });
  const domainSent = domainCap > 0 ? await domainSentMap() : {};
  return accts.find((a) => {
    if (a.sent_today >= effectiveCap(a, base, step)) return false;
    if (domainCap > 0 && (domainSent[domainOf(a.from_email)] || 0) >= domainCap) return false;
    return true;
  }) || null;
}

async function bumpSent(accountId) {
  await prisma.sending_accounts.update({ where: { id: accountId }, data: { sent_today: { increment: 1 } } });
}

async function campaignCapacity(campaignId) {
  const ids = await assignedAccountIds(campaignId);
  if (!ids.length) return 0;
  const { base, step, domainCap } = await settings();
  const accts = await prisma.sending_accounts.findMany({ where: { id: { in: ids }, status: "active" } });
  // remaining per account, grouped by domain and clamped to the domain cap
  const byDomain = {};
  for (const a of accts) {
    const rem = Math.max(effectiveCap(a, base, step) - a.sent_today, 0);
    const d = domainOf(a.from_email);
    (byDomain[d] = byDomain[d] || { rem: 0, sent: 0 }).rem += rem;
    byDomain[d].sent += a.sent_today;
  }
  let total = 0;
  for (const d in byDomain) {
    let rem = byDomain[d].rem;
    if (domainCap > 0) rem = Math.min(rem, Math.max(domainCap - byDomain[d].sent, 0));
    total += rem;
  }
  return total;
}

module.exports = { resetDailyCaps, pickAccount, bumpSent, campaignCapacity, effectiveCap, domainOf };
