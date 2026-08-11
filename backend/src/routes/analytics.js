"use strict";
const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();
const num = (v) => Number(v) || 0;

router.get("/api/analytics", async (req, res) => {
  try {
    const campaign = req.query.campaign && req.query.campaign !== "all" ? parseInt(req.query.campaign, 10) : null;
    const cWhere = campaign ? { campaign_id: campaign } : {};

    // leads by status (Prisma groupBy)
    const leadRows = await prisma.leads.groupBy({ by: ["status"], where: cWhere, _count: { _all: true } });
    const leads = {}; for (const r of leadRows) leads[r.status] = r._count._all;
    const leadsTotal = Object.values(leads).reduce((a, b) => a + b, 0);

    // send aggregates (Prisma counts)
    const sent = await prisma.sends.count({ where: { ...cWhere, sent_at: { not: null } } });
    const opened = await prisma.sends.count({ where: { ...cWhere, opened_at: { not: null } } });
    const clicked = await prisma.sends.count({ where: { ...cWhere, clicked_at: { not: null } } });
    const replied = await prisma.sends.count({ where: { ...cWhere, status: "replied" } });
    const decided = (leads.approved || 0) + (leads.rejected || 0) + (leads.sent || 0);

    const funnel = [
      { k: "Sourced", n: leadsTotal },
      { k: "Audited (has finding)", n: (leads.audited || 0) + (leads.drafted || 0) + (leads.approved || 0) + (leads.sent || 0) },
      { k: "Drafted", n: (leads.drafted || 0) + (leads.approved || 0) + (leads.sent || 0) },
      { k: "Approved", n: (leads.approved || 0) + (leads.sent || 0) },
      { k: "Sent", n: sent },
      { k: "Replied", n: replied },
    ];
    const rates = {
      reply_rate: sent ? Math.round((replied / sent) * 1000) / 10 : 0,
      open_rate: sent ? Math.round((opened / sent) * 1000) / 10 : 0,
      click_rate: sent ? Math.round((clicked / sent) * 1000) / 10 : 0,
      approval_rate: (leads.approved || 0) + (leads.rejected || 0) ? Math.round(((leads.approved || 0) / ((leads.approved || 0) + (leads.rejected || 0))) * 1000) / 10 : 0,
    };

    // per-campaign sent/replied/opened (small N of campaigns → a few counts each)
    const campaigns = await prisma.campaigns.findMany({ select: { id: true, name: true }, orderBy: { id: "desc" } });
    const by_campaign = [];
    for (const c of campaigns) {
      by_campaign.push({
        id: c.id, name: c.name,
        sent: await prisma.sends.count({ where: { campaign_id: c.id, sent_at: { not: null } } }),
        replied: await prisma.sends.count({ where: { campaign_id: c.id, status: "replied" } }),
        opened: await prisma.sends.count({ where: { campaign_id: c.id, opened_at: { not: null } } }),
      });
    }
    by_campaign.sort((a, b) => b.sent - a.sent);

    // conditional cross-table roll-ups Prisma groupBy can't express — kept as raw reads
    const campFilterHook = campaign ? prisma.$queryRaw`AND d.campaign_id=${campaign}` : prisma.$queryRaw``;
    const byHook = await prisma.$queryRawUnsafe(
      `SELECT d.hook_key hook_key, COUNT(*) drafted,
              SUM(sn.sent_at IS NOT NULL) sent, SUM(sn.status='replied') replied
         FROM drafts d LEFT JOIN sends sn ON sn.draft_id=d.id
        ${campaign ? "WHERE d.campaign_id=?" : ""}
        GROUP BY d.hook_key ORDER BY sent DESC`,
      ...(campaign ? [campaign] : [])
    );
    const sendsByDay = await prisma.$queryRawUnsafe(
      `SELECT DATE(sent_at) day, COUNT(*) n FROM sends
        WHERE sent_at IS NOT NULL ${campaign ? "AND campaign_id=?" : ""}
        GROUP BY DATE(sent_at) ORDER BY day DESC LIMIT 14`,
      ...(campaign ? [campaign] : [])
    );

    // best send times — by hour-of-day and weekday, with reply rate
    const byHour = await prisma.$queryRawUnsafe(
      `SELECT HOUR(sent_at) h, COUNT(*) sent, SUM(status='replied') replied FROM sends
        WHERE sent_at IS NOT NULL ${campaign ? "AND campaign_id=?" : ""} GROUP BY HOUR(sent_at) ORDER BY h`,
      ...(campaign ? [campaign] : [])
    );
    const byDow = await prisma.$queryRawUnsafe(
      `SELECT DAYOFWEEK(sent_at) d, COUNT(*) sent, SUM(status='replied') replied FROM sends
        WHERE sent_at IS NOT NULL ${campaign ? "AND campaign_id=?" : ""} GROUP BY DAYOFWEEK(sent_at) ORDER BY d`,
      ...(campaign ? [campaign] : [])
    );

    const platformRows = await prisma.companies.groupBy({ by: ["platform"], where: { platform: { not: null } }, _count: { _all: true }, orderBy: { _count: { platform: "desc" } } });
    const subjectRows = await prisma.subject_variants.findMany({
      where: campaign ? { campaign_id: campaign } : {}, orderBy: { sent_count: "desc" }, take: 20,
    });
    const subjCampaignIds = [...new Set(subjectRows.map((s) => s.campaign_id))];
    const subjCampaigns = subjCampaignIds.length ? await prisma.campaigns.findMany({ where: { id: { in: subjCampaignIds } }, select: { id: true, name: true } }) : [];
    const scmap = new Map(subjCampaigns.map((c) => [c.id, c.name]));

    res.json({
      leads, leadsTotal, sent, opened, clicked, replied, decided, funnel, rates, by_campaign,
      by_hook: byHook.filter((r) => r.hook_key).map((r) => ({
        hook_key: r.hook_key, drafted: num(r.drafted), sent: num(r.sent), replied: num(r.replied),
        reply_rate: num(r.sent) ? Math.round((num(r.replied) / num(r.sent)) * 1000) / 10 : 0,
      })),
      sends_by_day: sendsByDay.map((r) => ({ day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day, n: num(r.n) })).reverse(),
      by_platform: platformRows.map((r) => ({ platform: r.platform, n: r._count._all })),
      by_hour: byHour.map((r) => ({ hour: num(r.h), sent: num(r.sent), replied: num(r.replied) })),
      by_weekday: byDow.map((r) => ({ dow: num(r.d), sent: num(r.sent), replied: num(r.replied) })),
      by_subject: subjectRows.map((r) => ({
        subject: r.subject, campaign_name: scmap.get(r.campaign_id) || "", sent: r.sent_count, replied: r.replied_count,
        reply_rate: r.sent_count ? Math.round((r.replied_count / r.sent_count) * 1000) / 10 : 0,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
