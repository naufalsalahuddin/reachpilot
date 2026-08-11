"use strict";
/** Claims and runs a batch of queued jobs (Prisma port). Called by /cron/tick and "run now". */
const prisma = require("../lib/prisma");
const queue = require("./queue");
const { HANDLERS } = require("./handlers");
const rotation = require("../sending/rotation");
const sending = require("../sending");
const replies = require("../lib/replies");

async function maintenance() {
  try {
    await rotation.resetDailyCaps();

    const due = await prisma.sends.findMany({
      where: { status: "queued", scheduled_at: { lte: new Date() } },
      distinct: ["campaign_id"], select: { campaign_id: true },
    });
    for (const { campaign_id } of due) {
      const has = await prisma.jobs.findFirst({
        where: { type: "send", campaign_id, status: { in: ["queued", "running"] } }, select: { id: true },
      });
      if (!has) await queue.enqueue("send", campaign_id);
    }

    // reply polling, throttled: a few owned accounts not checked in the last 10 min
    const cutoff = new Date(Date.now() - 10 * 60000);
    const accts = await prisma.sending_accounts.findMany({
      where: { status: "active", OR: [{ last_checked: null }, { last_checked: { lt: cutoff } }] },
      orderBy: [{ last_checked: "asc" }], take: 3,
    });
    for (const a of accts) {
      if (sending.isOwned(a.method)) {
        // Belt-and-braces: even with ImapFlow's own timeouts, never let a single
        // inbox stall the tick. Race it, and always stamp last_checked afterwards.
        try {
          await Promise.race([
            replies.checkAccount(a),
            new Promise((_, rej) => setTimeout(() => rej(new Error("imap poll timed out")), 45000)),
          ]);
        } catch (e) {
          console.warn(`[replies] account #${a.id}: ${e.message}`);
          await prisma.sending_accounts.update({ where: { id: a.id }, data: { last_checked: new Date() } });
        }
      } else {
        await prisma.sending_accounts.update({ where: { id: a.id }, data: { last_checked: new Date() } });
      }
    }
  } catch (e) {
    console.warn("[maintenance]", e.message);
  }
}

async function processBatch(max = 5) {
  await maintenance();
  const jobs = await queue.claim(max);
  const results = [];
  // record heartbeat for the System status page (best-effort)
  try { const db = require("../lib/data"); await db.setSetting("last_tick", JSON.stringify({ at: new Date().toISOString(), claimed: jobs.length })); } catch { /* ignore */ }
  for (const job of jobs) {
    const handler = HANDLERS[job.type];
    if (!handler) {
      await queue.markError(job.id, `no handler for type "${job.type}"`);
      results.push({ id: job.id, type: job.type, status: "error", note: "no handler" });
      continue;
    }
    try {
      const note = await handler(job);
      await queue.markDone(job.id);
      results.push({ id: job.id, type: job.type, campaign_id: job.campaign_id, status: "done", note });
    } catch (e) {
      await queue.markError(job.id, e.message || String(e));
      results.push({ id: job.id, type: job.type, campaign_id: job.campaign_id, status: "error", note: e.message });
    }
  }
  return { claimed: jobs.length, results };
}

module.exports = { processBatch, maintenance };
