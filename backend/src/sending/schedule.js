"use strict";
/**
 * When a draft is approved and its campaign has sending enabled + assigned accounts,
 * create the queued sends: step 1 now, plus one per active follow-up at its day
 * offset. Editing an approved draft updates the still-queued step-1 send. (Prisma.)
 */
const prisma = require("../lib/prisma");
const queue = require("../jobs/queue");
const { newTrackingId } = require("../tracking/inject");

function render(tmpl, lead) {
  return String(tmpl || "").replace(/\{(\w+)\}/g, (_, k) => {
    const map = { first_name: lead.first_name || "there", name: lead.name || "", city: lead.city || "", industry: lead.industry || "", website: lead.website || "", booking_link: lead.booking_link || "" };
    return map[k] !== undefined ? map[k] : `{${k}}`;
  });
}

async function enqueueForDraft(draftId) {
  const d = await prisma.drafts.findUnique({ where: { id: Number(draftId) } });
  if (!d) return { queued: 0, reason: "draft not found" };
  const lead = await prisma.leads.findUnique({ where: { id: d.lead_id } });
  const campaign = await prisma.campaigns.findUnique({ where: { id: d.campaign_id } });
  if (!campaign || !campaign.sending_enabled) return { queued: 0, reason: "sending disabled for this campaign" };
  if (!lead || !lead.email) return { queued: 0, reason: "lead has no email address" };
  const assigned = await prisma.campaign_accounts.count({ where: { campaign_id: d.campaign_id } });
  if (!assigned) return { queued: 0, reason: "no sending accounts assigned to this campaign" };

  const now = new Date();
  const subject = d.final_subject || d.subject;
  const body = d.final_body || d.body;
  const preview = d.preview_text || null;
  const ctx = { ...lead, booking_link: campaign.booking_link };

  const existing = await prisma.sends.findMany({ where: { draft_id: d.id }, select: { id: true, status: true } });
  if (existing.length) {
    const queued = existing.filter((s) => s.status === "queued");
    if (queued.length) {
      await prisma.sends.updateMany({ where: { draft_id: d.id, status: "queued", step_no: 1 }, data: { subject, body, preview_text: preview } });
      return { queued: queued.length, updated: true };
    }
    return { queued: 0, reason: "already sent" };
  }

  // Stagger step-1 sends so a batch of approvals isn't blasted at once (anti-spam).
  // Each new send is scheduled a random gap AFTER the last still-queued one.
  const gapMin = Math.max(0, campaign.send_gap_min_sec ?? 120);
  const gapMax = Math.max(gapMin, campaign.send_gap_max_sec ?? 600);
  const lastQueued = await prisma.sends.findFirst({ where: { campaign_id: d.campaign_id, status: "queued", step_no: 1 }, orderBy: { scheduled_at: "desc" }, select: { scheduled_at: true } });
  const base = lastQueued && lastQueued.scheduled_at && lastQueued.scheduled_at > now ? new Date(lastQueued.scheduled_at) : now;
  const jitterMs = Math.floor(gapMin + Math.random() * (gapMax - gapMin)) * 1000;
  const step1At = new Date(base.getTime() + jitterMs);

  await prisma.sends.create({
    data: { draft_id: d.id, lead_id: d.lead_id, campaign_id: d.campaign_id, tracking_id: newTrackingId(), status: "queued", step_no: 1, subject, body, preview_text: preview, scheduled_at: step1At, created_at: now },
  });
  let count = 1;

  const steps = await prisma.sequence_steps.findMany({ where: { campaign_id: d.campaign_id, active: 1, step_no: { gte: 2 } }, orderBy: { step_no: "asc" } });
  for (const st of steps) {
    const when = new Date(step1At.getTime() + (Number(st.day_offset) || 0) * 86400000);
    await prisma.sends.create({
      data: { draft_id: d.id, lead_id: d.lead_id, campaign_id: d.campaign_id, tracking_id: newTrackingId(), status: "queued", step_no: st.step_no, subject: render(st.subject, ctx) || subject, body: render(st.body, ctx), preview_text: preview, scheduled_at: when, created_at: now },
    });
    count++;
  }

  await queue.enqueue("send", d.campaign_id);
  return { queued: count };
}

module.exports = { enqueueForDraft };
