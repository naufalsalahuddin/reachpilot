"use strict";
/**
 * DB-backed job queue (Prisma port). A cron hit (/cron/tick) claims and runs a
 * small batch each time; long stages (audit, draft) re-enqueue themselves.
 */
const prisma = require("../lib/prisma");

async function enqueue(type, campaignId, payload = {}, runAfter = null) {
  const now = new Date();
  const row = await prisma.jobs.create({
    data: {
      type, campaign_id: campaignId ?? null, payload_json: JSON.stringify(payload),
      status: "queued", run_after: runAfter || now, created_at: now, updated_at: now,
    },
  });
  return row.id;
}

function ago(seconds) {
  return new Date(Date.now() - seconds * 1000);
}

/** Claim up to `limit` due jobs, marking them 'running'. Returns claimed rows. */
async function claim(limit = 5) {
  // Self-heal orphaned 'running' jobs from an interrupted tick.
  await prisma.jobs.updateMany({
    where: { status: "running", updated_at: { lt: ago(15 * 60) }, attempts: { gte: 3 } },
    data: { status: "error", last_error: "orphaned: stuck in running" },
  });
  await prisma.jobs.updateMany({
    where: { status: "running", updated_at: { lt: ago(5 * 60) }, attempts: { lt: 3 } },
    data: { status: "queued" },
  });

  const candidates = await prisma.jobs.findMany({
    where: { status: "queued", run_after: { lte: new Date() } },
    orderBy: { id: "asc" }, take: Number(limit), select: { id: true },
  });
  const claimed = [];
  for (const { id } of candidates) {
    const res = await prisma.jobs.updateMany({
      where: { id, status: "queued" },
      data: { status: "running", attempts: { increment: 1 }, updated_at: new Date() },
    });
    if (res.count === 1) claimed.push(await prisma.jobs.findUnique({ where: { id } }));
  }
  return claimed;
}

async function markDone(id) {
  await prisma.jobs.update({ where: { id }, data: { status: "done", updated_at: new Date() } });
}

async function markError(id, message) {
  await prisma.jobs.update({ where: { id }, data: { status: "error", last_error: String(message).slice(0, 2000), updated_at: new Date() } });
}

async function pending(campaignId = null) {
  const rows = await prisma.jobs.groupBy({
    by: ["type", "status"],
    where: campaignId ? { campaign_id: campaignId } : {},
    _count: { _all: true },
  });
  return rows.map((r) => ({ type: r.type, status: r.status, n: r._count._all }));
}

module.exports = { enqueue, claim, markDone, markError, pending };
