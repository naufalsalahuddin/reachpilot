"use strict";
/** Gather + persist the audit report for one lead (API + PDF + email attach). */
const prisma = require("./prisma");
const { buildReport } = require("./reportContent");
const { buildDoc } = require("./reportDoc");
const { screenshotUrl } = require("./screenshot");

async function getReportData(leadId) {
  const lead = await prisma.leads.findUnique({ where: { id: Number(leadId) } });
  if (!lead) return null;
  const audits = await prisma.audits.findMany({ where: { lead_id: lead.id }, orderBy: { id: "desc" }, take: 1 });
  const audit = audits[0] || null;
  const saved = await prisma.reports.findUnique({ where: { lead_id: lead.id } });

  let checks = []; try { checks = JSON.parse(audit?.checks_json || "[]"); } catch { checks = []; }
  let meta = {}; try { meta = JSON.parse(audit?.meta_json || "{}"); } catch { meta = {}; }
  let savedPs = null; try { savedPs = saved?.pagespeed_json ? JSON.parse(saved.pagespeed_json) : null; } catch { savedPs = null; }
  const pagespeed = savedPs || meta.pagespeed || null; // saved run wins, else the in-audit run
  const built = buildReport(checks, pagespeed);

  let content = null; try { content = saved?.content_json ? JSON.parse(saved.content_json) : null; } catch { content = null; }
  if (!content) content = buildDoc({ whatsGood: built.whatsGood, whatsBad: built.whatsBad, pagespeed });

  return {
    lead_id: lead.id, company_id: lead.company_id || null,
    business: lead.name, name: lead.name, website: lead.website, city: lead.city, industry: lead.industry,
    phone: lead.phone, reviewCount: lead.review_count, review_count: lead.review_count, rating: lead.rating,
    platform: audit?.platform || meta.platform || null, auditedAt: audit?.audited_at || null, audited_at: audit?.audited_at || null,
    screenshot: screenshotUrl(lead.website), checks, pagespeed,
    content, has_saved: !!saved?.content_json,
    meta: { load_seconds: meta.load_seconds, final_url: meta.final_url },
    ...built,
    counts: { fail: built.counts.bad, unknown: built.counts.unknown, pass: built.counts.good },
  };
}

async function saveReportContent(leadId, contentJson) {
  const content_json = JSON.stringify(contentJson || null);
  await prisma.reports.upsert({
    where: { lead_id: Number(leadId) },
    update: { content_json, updated_at: new Date() },
    create: { lead_id: Number(leadId), content_json, updated_at: new Date() },
  });
}

async function saveReportPagespeed(leadId, ps) {
  const pagespeed_json = JSON.stringify(ps || null);
  await prisma.reports.upsert({
    where: { lead_id: Number(leadId) },
    update: { pagespeed_json, updated_at: new Date() },
    create: { lead_id: Number(leadId), pagespeed_json, updated_at: new Date() },
  });
}

module.exports = { getReportData, saveReportContent, saveReportPagespeed };
