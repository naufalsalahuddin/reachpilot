"use strict";
/** Operational status for the System page: heartbeat, jobs, inboxes, recent errors. */
const express = require("express");
const prisma = require("../lib/prisma");
const data = require("../lib/data");
const { effectiveCap } = require("../sending/rotation");

const router = express.Router();

router.get("/api/status", async (req, res) => {
  try {
    let lastTick = null;
    try { lastTick = JSON.parse((await data.getSetting("last_tick")) || "null"); } catch { lastTick = null; }
    const base = parseInt(await data.getSetting("warmup_base"), 10) || 8;
    const step = parseInt(await data.getSetting("warmup_step"), 10) || 6;

    const jobRows = await prisma.jobs.groupBy({ by: ["status"], _count: { _all: true } });
    const jobs = {}; for (const r of jobRows) jobs[r.status] = r._count._all;

    const sendsDue = await prisma.sends.count({ where: { status: "queued", scheduled_at: { lte: new Date() } } });
    const queuedTotal = await prisma.sends.count({ where: { status: "queued" } });

    const accts = await prisma.sending_accounts.findMany({ orderBy: { id: "asc" } });
    const accounts = accts.map((a) => ({
      id: a.id, name: a.name, method: a.method, status: a.status, from_email: a.from_email,
      sent_today: a.sent_today, daily_cap: a.daily_cap, effective_cap: effectiveCap(a, base, step),
      bounces_today: a.bounces_today, warmup: !!a.warmup,
    }));

    const failedJobs = await prisma.jobs.findMany({ where: { status: "error" }, orderBy: { id: "desc" }, take: 8, select: { id: true, type: true, last_error: true, updated_at: true } });
    const badSends = await prisma.sends.count({ where: { status: { in: ["failed", "bounced", "blocked", "suppressed"] } } });
    const pendingReview = await prisma.drafts.count({ where: { decision: "pending" } });
    const suppression = await prisma.suppression.count();

    const lastAgoMin = lastTick?.at ? Math.round((Date.now() - new Date(lastTick.at).getTime()) / 60000) : null;
    res.json({
      scheduler_on: String(process.env.SCHEDULER || "").toLowerCase() !== "off",
      last_tick: lastTick, last_tick_minutes_ago: lastAgoMin, tick_healthy: lastAgoMin != null && lastAgoMin < 10,
      jobs, sends_due: sendsDue, sends_queued: queuedTotal, bad_sends: badSends,
      accounts, failed_jobs: failedJobs, pending_review: pendingReview, suppression,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
