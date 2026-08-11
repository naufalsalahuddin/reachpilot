"use strict";
/**
 * Prisma-backed data helpers — the port of the old raw-SQL src/db.js.
 * All writes go through Prisma models; a couple of aggregate reports use
 * $queryRaw where a manual multi-table roll-up is clearer than N round-trips.
 *
 * Website URLs are cleaned (UTM/query stripped) at every ingestion point.
 */
const prisma = require("./prisma");
const { cleanUrl, domainOf } = require("./url");
const { scoreLead } = require("./leadScore");
const { lintEmail } = require("./contentLint");

function now() {
  return new Date();
}

// ------------------------------------------------------------------ settings
async function getSetting(key, dflt = null) {
  const row = await prisma.settings.findUnique({ where: { k: key } });
  return row ? row.v : dflt;
}
async function setSetting(key, value) {
  await prisma.settings.upsert({
    where: { k: key },
    update: { v: value },
    create: { k: key, v: value },
  });
}

// ------------------------------------------------------------------ companies
/** Create or find the company for a lead (deduped by cleaned domain). Returns id. */
async function upsertCompany(lead) {
  const website = cleanUrl(lead.website);
  const domain = lead.domain || domainOf(website);
  const base = {
    name: lead.name || "Unknown",
    website,
    phone: lead.phone || null,
    address: lead.address || null,
    street: lead.street || null,
    city: lead.city || null,
    state: lead.state || null,
    postal_code: lead.postal_code || null,
    country: lead.country || null,
    industry: lead.industry || null,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
  };
  if (domain) {
    const row = await prisma.companies.upsert({
      where: { domain },
      update: {
        last_activity: now(),
        phone: base.phone || undefined,
        city: base.city || undefined,
        industry: base.industry || undefined,
      },
      create: { domain, status: "new", last_activity: now(), created_at: now(), ...base },
    });
    return row.id;
  }
  const row = await prisma.companies.create({
    data: { domain: null, status: "new", last_activity: now(), created_at: now(), ...base },
  });
  return row.id;
}

// ------------------------------------------------------------------ leads
async function insertLead(campaignId, lead) {
  const website = cleanUrl(lead.website);
  const domain = lead.domain || domainOf(website);
  const companyId = await upsertCompany({ ...lead, website, domain });
  try {
    const row = await prisma.leads.create({
      data: {
        campaign_id: campaignId,
        company_id: companyId,
        place_id: lead.place_id || null,
        name: lead.name || "Unknown",
        website,
        domain,
        phone: lead.phone || null,
        address: lead.address || null,
        city: lead.city || null,
        industry: lead.industry || null,
        rating: lead.rating ?? null,
        review_count: lead.review_count ?? null,
        email: lead.email || null,
        first_name: lead.first_name || null,
        sourced_at: now(),
        status: "new",
      },
    });
    return row.id;
  } catch (e) {
    if (e.code === "P2002") return null; // already sourced for this campaign
    throw e;
  }
}

/** Link legacy leads to a deduped company. Returns count linked. */
async function backfillCompanies() {
  const rows = await prisma.leads.findMany({ where: { company_id: null } });
  for (const lead of rows) {
    const cid = await upsertCompany(lead);
    await prisma.leads.update({ where: { id: lead.id }, data: { company_id: cid } });
    if (lead.email) {
      const c = await prisma.companies.findUnique({ where: { id: cid } });
      await prisma.companies.update({
        where: { id: cid },
        data: { email: c.email || lead.email, email_type: c.email_type || lead.email_type },
      });
    }
  }
  return rows.length;
}

// ------------------------------------------------------------------ audits
async function saveAudit(leadId, result) {
  const platform = (result.meta && result.meta.platform) || null;
  const row = await prisma.audits.create({
    data: {
      lead_id: leadId,
      audited_at: now(),
      reachable: result.reachable ? 1 : 0,
      blocked: result.blocked ? 1 : 0,
      checks_json: JSON.stringify(result.checks),
      hook_key: result.hook ? result.hook.key : null,
      hook_text: result.hook ? result.hook.detail : null,
      hook_evidence: result.hook ? result.hook.evidence : null,
      pitchable: result.hook ? 1 : 0,
      meta_json: JSON.stringify(result.meta || {}),
      platform,
    },
  });
  const score = scoreLead(result.checks, result.hook ? result.hook.key : null, result.meta && result.meta.pagespeed);
  await prisma.leads.update({ where: { id: leadId }, data: { status: result.hook ? "audited" : "skipped", score } });
  const lead = await prisma.leads.findUnique({ where: { id: leadId }, select: { company_id: true } });
  if (lead && lead.company_id) {
    const data = { last_activity: now() };
    if (platform) data.platform = platform;
    await prisma.companies.update({ where: { id: lead.company_id }, data });
  }
  return row.id;
}

/** Latest audit row for a lead. */
async function latestAudit(leadId) {
  const rows = await prisma.audits.findMany({ where: { lead_id: leadId }, orderBy: { id: "desc" }, take: 1 });
  return rows[0] || null;
}

// ------------------------------------------------------------------ drafts
async function saveDraft(leadId, auditId, campaignId, subject, body, hookKey, flags, source) {
  const row = await prisma.drafts.create({
    data: {
      lead_id: leadId, audit_id: auditId, campaign_id: campaignId,
      subject, body, hook_key: hookKey, flags_json: JSON.stringify(flags),
      source, created_at: now(),
    },
  });
  const lint = lintEmail({ subject, body });
  await prisma.leads.update({ where: { id: leadId }, data: { status: "drafted", lint_score: lint.score } });
  return row.id;
}

async function decide(draftId, decision, subject, body, previewText) {
  const data = { decision, final_subject: subject, final_body: body, decided_at: now() };
  if (previewText !== undefined) data.preview_text = previewText || null;
  await prisma.drafts.update({ where: { id: draftId }, data });
  const row = await prisma.drafts.findUnique({ where: { id: draftId }, select: { lead_id: true } });
  if (row) await prisma.leads.update({ where: { id: row.lead_id }, data: { status: decision } });
}

// ------------------------------------------------------------------ counts
async function pipelineCounts(campaignId) {
  const where = campaignId ? { campaign_id: campaignId } : {};
  const rows = await prisma.leads.groupBy({ by: ["status"], where, _count: { _all: true } });
  const out = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

module.exports = {
  prisma, now,
  getSetting, setSetting,
  upsertCompany, insertLead, backfillCompanies,
  saveAudit, latestAudit, saveDraft, decide, pipelineCounts,
};
