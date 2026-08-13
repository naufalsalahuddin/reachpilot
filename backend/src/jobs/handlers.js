"use strict";
/**
 * Job handlers (Prisma port): source → audit → draft → send, plus CSV import.
 * Each stage processes a small batch and re-enqueues while work remains.
 *
 * PageSpeed Insights (mobile + desktop) is folded into the audit when the
 * campaign has it enabled, and the resulting scores are passed into AI drafting.
 */
const prisma = require("../lib/prisma");
const config = require("../config");
const places = require("../lib/places");
const yelp = require("../lib/yelp");
const foursquare = require("../lib/foursquare");
const { auditSite } = require("../lib/audit");
const { makeDraft } = require("../lib/draft");
const providers = require("../lib/ai/providers");
const keystore = require("../lib/keystore");
const emailFinder = require("../lib/emailFinder");
const pagespeed = require("../lib/pagespeed");
const sending = require("../sending");
const rotation = require("../sending/rotation");
const suppress = require("../lib/suppress");
const dns = require("dns").promises;
const { lintEmail } = require("../lib/contentLint");
const { buildTrackedHtml } = require("../tracking/inject");
const { wrapWithDesign } = require("../lib/emailDesign");
const { getReportData } = require("../lib/reportData");
const { buildReportPdf, fetchScreenshot } = require("../lib/reportPdf");
const queue = require("./queue");
const data = require("../lib/data");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROLE_LOCALPARTS = new Set([
  "info", "contact", "hello", "admin", "office", "sales", "support",
  "enquiries", "enquiry", "inquiries", "inquiry", "bookings", "booking",
  "reception", "team", "mail", "marketing", "accounts", "billing", "hr",
  "jobs", "careers", "help", "service", "services",
]);
const NEVER_USE = ["noreply", "no-reply", "postmaster", "abuse", "privacy", "webmaster", "mailer-daemon"];

function classifyEmail(addr) {
  const local = addr.split("@")[0].toLowerCase();
  if (ROLE_LOCALPARTS.has(local)) return "role";
  if (/^[a-z]+([._-][a-z]+)?$/.test(local)) return "personal";
  return "generic";
}

function chooseEmail(found) {
  const usable = (found || []).filter((e) => !NEVER_USE.some((p) => e.startsWith(p)));
  if (!usable.length) return null;
  const rank = { personal: 0, role: 1, generic: 2 };
  usable.sort((a, b) => rank[classifyEmail(a)] - rank[classifyEmail(b)]);
  const email = usable[0];
  const type = classifyEmail(email);
  let firstName = null;
  if (type === "personal") {
    const first = email.split("@")[0].split(/[._-]/)[0];
    if (first && first.length > 1) firstName = first[0].toUpperCase() + first.slice(1);
  }
  return { email, type, firstName };
}

async function getCampaign(id) {
  const c = await prisma.campaigns.findUnique({ where: { id } });
  if (!c) throw new Error(`Campaign ${id} not found`);
  return c;
}

async function getDesign(id) {
  try { return await prisma.email_templates.findUnique({ where: { id } }); }
  catch { return null; }
}

// ------------------------------------------------------------------ source
const SOURCES = {
  google_places: { keystore: "google_places", search: (key, c) => places.search(key, c.industry, c.city, { want: c.leads_per_run, minReviews: c.min_reviews, requireWebsite: !!c.require_website }) },
  yelp:          { keystore: "yelp",          search: (key, c) => yelp.search(key, c.industry, c.city, { want: c.leads_per_run, minReviews: c.min_reviews }) },
  foursquare:    { keystore: "foursquare",    search: (key, c) => foursquare.search(key, c.industry, c.city, { want: c.leads_per_run, minReviews: c.min_reviews, requireWebsite: !!c.require_website }) },
};

async function handleSource(job) {
  const c = await getCampaign(job.campaign_id);
  const src = SOURCES[c.source_provider] || SOURCES.google_places;
  const leads = await keystore.withKey(src.keystore, (key) => src.search(key, c));

  let inserted = 0;
  for (const lead of leads) {
    const id = await data.insertLead(c.id, lead);
    if (id) inserted++;
  }
  await queue.enqueue("audit", c.id);
  return `${leads.length} found via ${c.source_provider || "google_places"}, ${inserted} new`;
}

// ------------------------------------------------------------------ import
async function handleImport(job) {
  let payload = {};
  try { payload = JSON.parse(job.payload_json || "{}"); } catch { payload = {}; }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const insertedIds = [];
  let inserted = 0;
  for (const lead of rows) {
    try { const id = await data.insertLead(job.campaign_id, lead); if (id) { inserted++; insertedIds.push(id); } } catch { /* skip bad row */ }
  }

  const campaign = await getCampaign(job.campaign_id);
  if (campaign.flow_id) {
    // Flow-mode campaigns don't run the legacy audit/enrich chain — imported
    // leads skip the (search-only) lead_source block and advance straight past
    // it, exactly like a lead that finished any other node would.
    const flowEngine = require("./flowEngine");
    const { graph } = await flowEngine.loadGraph(campaign.id);
    const entry = graph.nodes.find((n) => n.id === graph.entry);
    if (entry && insertedIds.length) {
      const leads = await prisma.leads.findMany({ where: { id: { in: insertedIds } } });
      for (const lead of leads) await flowEngine.advanceLead(graph, entry, lead);
    }
    return `${inserted}/${rows.length} imported (flow)${payload.last ? " (final chunk)" : ""}`;
  }

  if (payload.last) {
    await queue.enqueue("audit", job.campaign_id);
    await queue.enqueue("enrich", job.campaign_id);
  }
  return `${inserted}/${rows.length} imported${payload.last ? " (final chunk)" : ""}`;
}

// ------------------------------------------------------------------- audit
/** Add PageSpeed (mobile+desktop) results to an audit result in place. */
async function attachPagespeed(result, website) {
  try {
    const ps = await pagespeed.runBoth(website);
    result.meta = result.meta || {};
    result.meta.pagespeed = ps;
    result.checks.push(...pagespeed.buildChecks(ps));
    result.fail_count = result.checks.filter((c) => c.state === "FAIL").length;
  } catch { /* pagespeed is best-effort; never fail the audit over it */ }
}

async function handleAudit(job) {
  const c = await getCampaign(job.campaign_id);
  const batch = config.batch.audit;
  const rows = await prisma.leads.findMany({
    where: { campaign_id: c.id, status: "new", website: { not: null } },
    orderBy: { review_count: "desc" }, take: Number(batch),
  });
  if (!rows.length) {
    await queue.enqueue("draft", c.id);
    await queue.enqueue("enrich", c.id);
    return "nothing to audit";
  }

  const skipGroups = (c.disabled_checks || "").split(",").map((s) => s.trim()).filter(Boolean);
  let hooks = 0, blocked = 0, clean = 0;
  for (const lead of rows) {
    let res;
    try { res = await auditSite(lead.website, { skipGroups }); }
    catch { await prisma.leads.update({ where: { id: lead.id }, data: { status: "skipped" } }); continue; }

    if (c.pagespeed_in_audit && !res.blocked) await attachPagespeed(res, lead.website);
    await data.saveAudit(lead.id, res);

    if (!lead.email && res.meta && res.meta.emails_found) {
      const pick = chooseEmail(res.meta.emails_found);
      if (pick) {
        await prisma.leads.update({
          where: { id: lead.id },
          data: { email: pick.email, email_type: pick.type, email_status: "found", first_name: lead.first_name || pick.firstName },
        });
      }
    }

    if (res.blocked) blocked++;
    else if (res.hook) hooks++;
    else clean++;
    await sleep(c.delay_ms || 1500);
  }

  const remaining = await prisma.leads.count({ where: { campaign_id: c.id, status: "new", website: { not: null } } });
  if (remaining > 0) await queue.enqueue("audit", c.id);
  else { await queue.enqueue("draft", c.id); await queue.enqueue("enrich", c.id); }
  return `${hooks} pitchable, ${clean} clean, ${blocked} blocked (${remaining} left)`;
}

// ------------------------------------------------------------------- draft
async function handleDraft(job) {
  const c = await getCampaign(job.campaign_id);
  let provider = c.ai_provider || "template";
  if (provider !== "template" && !(await providers.isAvailable(provider))) provider = "template";

  const batch = Number(config.batch.draft);
  const candidates = await prisma.leads.findMany({
    where: { campaign_id: c.id, status: "audited" },
    orderBy: { review_count: "desc" }, take: batch * 3,
  });

  let done = 0;
  for (const lead of candidates) {
    if (done >= batch) break;
    const audit = await data.latestAudit(lead.id);
    if (!audit || !audit.pitchable) continue;
    let checks = [];
    try { checks = JSON.parse(audit.checks_json || "[]"); } catch { checks = []; }
    const hookCheck = checks.find((ch) => ch.key === audit.hook_key);
    if (!hookCheck) { await prisma.leads.update({ where: { id: lead.id }, data: { status: "skipped" } }); continue; }
    const hook = { key: hookCheck.key, label: hookCheck.label, detail: hookCheck.detail, evidence: hookCheck.evidence };

    // PageSpeed context for the AI writer (if the audit captured it)
    let pagespeed = null;
    try { const meta = JSON.parse(audit.meta_json || "{}"); pagespeed = meta.pagespeed || null; } catch { /* ignore */ }

    const { subject, body, preview, flags, source } = await makeDraft(
      lead, hook, c.sender_name || "", { provider, model: c.ai_model, rules: c.pitch_rules, pagespeed }
    );
    await data.saveDraft(lead.id, audit.id, c.id, subject, body, audit.hook_key, flags, source, preview);
    done++;
  }

  const remainingLeads = await prisma.leads.findMany({ where: { campaign_id: c.id, status: "audited" }, select: { id: true } });
  let remaining = 0;
  for (const l of remainingLeads) { const a = await data.latestAudit(l.id); if (a && a.pitchable) remaining++; }
  if (remaining > 0) await queue.enqueue("draft", c.id);
  return `${done} drafted (${remaining} left)`;
}

// ------------------------------------------------------------------ enrich
async function handleEnrich(job) {
  const c = await getCampaign(job.campaign_id);
  const batch = Number(config.batch.enrich);
  const rows = await prisma.leads.findMany({
    where: {
      campaign_id: c.id, status: { in: ["audited", "drafted"] },
      OR: [{ email_type: null }, { email_type: { not: "personal" } }],
      AND: [{ OR: [{ email_status: null }, { email_status: "found" }] }],
    },
    orderBy: { review_count: "desc" }, take: batch,
  });
  if (!rows.length) return "nothing to enrich";

  let improved = 0;
  for (const lead of rows) {
    try {
      const best = await emailFinder.findBest(lead);
      if (best && best.type === "personal") {
        await prisma.leads.update({ where: { id: lead.id }, data: { email: best.email, email_type: "personal", email_status: best.status, first_name: lead.first_name || best.first_name } });
        if (lead.company_id) await prisma.companies.update({ where: { id: lead.company_id }, data: { email: best.email, email_type: "personal", last_activity: new Date() } });
        improved++;
      } else if (best && best.email && !lead.email) {
        await prisma.leads.update({ where: { id: lead.id }, data: { email: best.email, email_type: best.type, email_status: "searched", first_name: lead.first_name || best.first_name } });
      } else {
        await prisma.leads.update({ where: { id: lead.id }, data: { email_status: "searched" } });
      }
    } catch {
      await prisma.leads.update({ where: { id: lead.id }, data: { email_status: "searched" } });
    }
  }

  const remaining = await prisma.leads.count({
    where: {
      campaign_id: c.id, status: { in: ["audited", "drafted"] },
      OR: [{ email_type: null }, { email_type: { not: "personal" } }],
      AND: [{ OR: [{ email_status: null }, { email_status: "found" }] }],
    },
  });
  if (remaining > 0) await queue.enqueue("enrich", c.id);
  return `${improved} personal email(s) found (${remaining} left)`;
}

// -------------------------------------------------------------------- send helpers
function renderVars(tmpl, lead) {
  return String(tmpl || "").replace(/\{(\w+)\}/g, (_, k) => {
    const m = { first_name: lead.first_name || "there", name: lead.name || "", city: lead.city || "", industry: lead.industry || "", sender: lead.sender || "", booking_link: lead.booking_link || "" };
    return m[k] !== undefined ? m[k] : `{${k}}`;
  });
}

function withinSendWindow(c) {
  const start = Number.isFinite(c.send_start_hour) ? c.send_start_hour : 0;
  const end = Number.isFinite(c.send_end_hour) ? c.send_end_hour : 24;
  const weekdaysOnly = !!c.send_weekdays_only;
  if (start <= 0 && end >= 24 && !weekdaysOnly) return true;
  let hour, weekday;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: c.timezone || undefined, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date());
    hour = parseInt(parts.find((p) => p.type === "hour").value, 10) % 24;
    weekday = parts.find((p) => p.type === "weekday").value;
  } catch { return true; }
  if (weekdaysOnly && (weekday === "Sat" || weekday === "Sun")) return false;
  return start <= end ? (hour >= start && hour < end) : (hour >= start || hour < end);
}

// DMARC lookup with a 1h in-memory cache (keeps the send loop fast).
const dmarcCache = new Map();
async function dmarcOk(domain) {
  if (!domain) return true;
  const c = dmarcCache.get(domain);
  if (c && Date.now() - c.ts < 3600000) return c.ok;
  let ok = false;
  try { const txt = await dns.resolveTxt("_dmarc." + domain); ok = txt.flat().some((t) => /v=DMARC1/i.test(t)); } catch { ok = false; }
  dmarcCache.set(domain, { ok, ts: Date.now() });
  return ok;
}

const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
function preheaderHtml(text) {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escHtml(text)}</div>`;
}
function textToHtml(text) {
  return `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#111">${escHtml(text).replace(/\n/g, "<br>\n")}</div>`;
}
/** Body text -> paragraph HTML for a design template's {{content}}, with optional click-tracked links. */
function bodyContentHtml(text, { trackingId, trackClicks } = {}) {
  const base = config.publicBaseUrl;
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const clean = url.replace(/&amp;/g, "&");
    const href = trackClicks ? `${base}/t/c/${trackingId}?u=${encodeURIComponent(clean)}` : clean;
    return `<a href="${href}" style="color:#1c97e6;">${url}</a>`;
  });
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${linkify(escHtml(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// -------------------------------------------------------------------- send
async function handleSend(job) {
  const c = await getCampaign(job.campaign_id);
  if (!c.sending_enabled) return "sending disabled";
  if (!withinSendWindow(c)) return "outside send window — will resume in the campaign's hours";
  await rotation.resetDailyCaps();

  const globalUnsub = (await data.getSetting("include_unsubscribe", "1")) !== "0";
  const includeUnsub = c.include_unsubscribe == null ? globalUnsub : !!c.include_unsubscribe;
  // deliverability guards (workspace settings)
  const blockSpam = (await data.getSetting("block_spammy_sends")) === "1";
  const spamThreshold = parseInt(await data.getSetting("spam_block_threshold"), 10) || 55;
  const requireDmarc = (await data.getSetting("require_dmarc")) === "1";

  const batch = Number(config.batch.send);
  const dueSends = await prisma.sends.findMany({
    where: { campaign_id: c.id, status: "queued", scheduled_at: { lte: new Date() } },
    orderBy: { scheduled_at: "asc" }, take: batch,
  });
  if (!dueSends.length) return "0 sent, 0 failed (0 due)";
  const leadMap = new Map();
  for (const l of await prisma.leads.findMany({ where: { id: { in: [...new Set(dueSends.map((s) => s.lead_id))] } } })) leadMap.set(l.id, l);

  let sent = 0, failed = 0;
  for (const s of dueSends) {
    const lead = leadMap.get(s.lead_id) || {};
    const email = lead.email;
    if (!email) { await prisma.sends.update({ where: { id: s.id }, data: { status: "failed", error: "no email address" } }); failed++; continue; }
    if (await suppress.isSuppressed(email)) {
      await prisma.sends.update({ where: { id: s.id }, data: { status: "suppressed", error: "on suppression list" } });
      if (lead.company_id) await prisma.companies.update({ where: { id: lead.company_id }, data: { status: "dnc" } });
      failed++; continue;
    }
    // block obviously spammy content before it ever leaves (protects reputation)
    if (blockSpam) {
      const lint = lintEmail({ subject: s.subject, body: s.body });
      if (lint.score >= spamThreshold) {
        await prisma.sends.update({ where: { id: s.id }, data: { status: "blocked", error: `blocked: spammy content (score ${lint.score}) — ${lint.flags[0] || ""}` } });
        failed++; continue;
      }
    }
    const account = await rotation.pickAccount(c.id);
    if (!account) break;

    // optional: refuse to send from a domain with no DMARC record
    if (requireDmarc && !(await dmarcOk((account.from_email || "").split("@")[1]))) {
      await prisma.sends.update({ where: { id: s.id }, data: { status: "blocked", error: "blocked: sender domain has no DMARC record", account_id: account.id } });
      failed++; continue;
    }

    const ctx = { ...lead, sender: c.sender_name || "", booking_link: c.booking_link || "" };
    let subject = renderVars(s.subject, ctx), variantId = null;
    if (s.step_no === 1) {
      const v = await prisma.subject_variants.findFirst({ where: { campaign_id: c.id, active: 1 }, orderBy: [{ sent_count: "asc" }, { id: "asc" }] });
      if (v) { subject = renderVars(v.subject, ctx); variantId = v.id; }
    }
    const renderedBody = renderVars(s.body, ctx);

    const owned = sending.isOwned(account.method);
    let text = renderedBody, html = null;
    if (owned) {
      const unsubUrl = includeUnsub ? `${config.publicBaseUrl}/u/${s.tracking_id}` : "";
      text = includeUnsub ? `${renderedBody}\n\n—\nNot interested? Unsubscribe: ${unsubUrl}` : renderedBody;
      // A campaign can wrap the plain-text body in an HTML design template.
      // Default (no template) stays plain text — best for cold-email deliverability.
      const design = c.email_template_id ? await getDesign(c.email_template_id) : null;
      if (design && design.html) {
        const contentHtml = bodyContentHtml(renderedBody, { trackingId: s.tracking_id, trackClicks: !!c.track_clicks });
        const brand = {
          name: await data.getSetting("brand_name", ""),
          primary: await data.getSetting("brand_primary", "#1c97e6"),
          secondary: await data.getSetting("brand_secondary", "#0b6fb8"),
          logo: `${config.publicBaseUrl}/logo.svg`,
        };
        html = wrapWithDesign(design.html, { contentHtml, subject, preheader: s.preview_text || "", brand, unsubscribeUrl: unsubUrl, bookingLink: c.booking_link || "" });
        if (c.track_opens) {
          const pixel = `<img src="${config.publicBaseUrl}/t/o/${s.tracking_id}.gif" width="1" height="1" alt="" style="display:block;border:0" />`;
          html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, pixel + "</body>") : html + pixel;
        }
      } else {
        if (c.track_opens || c.track_clicks) html = buildTrackedHtml(text, { trackingId: s.tracking_id, trackOpens: !!c.track_opens, trackClicks: !!c.track_clicks });
        else if (s.preview_text) html = textToHtml(text);
        if (html && s.preview_text) html = preheaderHtml(s.preview_text) + html;
      }
    }
    const msg = { to: email, firstName: lead.first_name, company: lead.name, fromName: account.from_name, fromEmail: account.from_email, subject, text, html };
    // Attach the audit PDF to the first email (owned methods only). The per-draft
    // choice made in Review wins; null there falls back to the campaign default.
    let attachPdf = !!c.attach_report_pdf;
    if (s.step_no === 1) {
      const dr = await prisma.drafts.findUnique({ where: { id: s.draft_id }, select: { attach_pdf: true } });
      if (dr && dr.attach_pdf != null) attachPdf = !!dr.attach_pdf;
    }
    if (owned && attachPdf && s.step_no === 1) {
      try {
        const rd = await getReportData(s.lead_id);
        if (rd) {
          const shot = await fetchScreenshot(rd.screenshot);
          const pdf = await buildReportPdf({ business: rd.business, website: rd.website, city: rd.city, industry: rd.industry, phone: rd.phone, reviewCount: rd.review_count, rating: rd.rating, platform: rd.platform, auditedAt: rd.audited_at, screenshotBuffer: shot, contentJson: rd.content });
          msg.attachments = [{ filename: "website-audit.pdf", content: pdf, contentType: "application/pdf" }];
        }
      } catch { /* attachment is best-effort — never block the send */ }
    }
    try {
      const r = await sending.sendVia(account, msg);
      await prisma.sends.update({ where: { id: s.id }, data: { status: "sent", sent_at: new Date(), provider_message_id: r.messageId || null, account_id: account.id, subject, subject_variant_id: variantId } });
      if (variantId) await prisma.subject_variants.update({ where: { id: variantId }, data: { sent_count: { increment: 1 } } });
      await rotation.bumpSent(account.id);
      if (s.step_no === 1) await prisma.leads.updateMany({ where: { id: s.lead_id, status: { in: ["approved", "drafted", "audited"] } }, data: { status: "sent" } });
      if (lead.company_id) {
        await prisma.companies.updateMany({ where: { id: lead.company_id, status: "new" }, data: { status: "contacted" } });
        await prisma.companies.update({ where: { id: lead.company_id }, data: { last_activity: new Date() } });
      }
      sent++;
    } catch (e) {
      await prisma.sends.update({ where: { id: s.id }, data: { status: "failed", error: String(e.message || e).slice(0, 500), account_id: account.id } });
      failed++;
    }
  }

  const remaining = await prisma.sends.count({ where: { campaign_id: c.id, status: "queued", scheduled_at: { lte: new Date() } } });
  const cap = await rotation.campaignCapacity(c.id);
  if (remaining > 0 && cap > 0) await queue.enqueue("send", c.id);
  return `${sent} sent, ${failed} failed (${remaining} due, cap ${cap})`;
}

const HANDLERS = {
  source: handleSource, audit: handleAudit, enrich: handleEnrich,
  draft: handleDraft, send: handleSend, import: handleImport,
};

module.exports = {
  HANDLERS, chooseEmail, classifyEmail,
  // shared with the flow engine's `send` block adapter (lib/flow/blocks/send.js)
  renderVars, withinSendWindow, dmarcOk, textToHtml, preheaderHtml, bodyContentHtml, getDesign,
};
