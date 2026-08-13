"use strict";
/** Flow block: send queued emails. Port of legacy handleSend, scoped to sends rows
 * created for THIS send node (sends.flow_node_id) rather than all due sends for the
 * campaign — a flow could in principle have more than one send node. Send is
 * terminal by default (no outgoing edge, matching leads.status="sent" today) but
 * — like any block — can optionally continue into one more step; advanceLead()
 * in flowEngine.js is generic and doesn't special-case this block type. */
const prisma = require("../../prisma");
const data = require("../../data");
const config = require("../../../config");
const sending = require("../../../sending");
const rotation = require("../../../sending/rotation");
const suppress = require("../../suppress");
const { lintEmail } = require("../../contentLint");
const { buildTrackedHtml } = require("../../../tracking/inject");
const { wrapWithDesign } = require("../../emailDesign");
const { getReportData } = require("../../reportData");
const { buildReportPdf, fetchScreenshot } = require("../../reportPdf");
const { renderVars, withinSendWindow, dmarcOk, textToHtml, preheaderHtml, bodyContentHtml, getDesign } = require("../../../jobs/handlers");

module.exports = {
  type: "send",
  async run(ctx) {
    const { campaign: c, node, batchSize } = ctx;
    if (!c.sending_enabled) return { doneLeadIds: [], remaining: 0 };
    if (!withinSendWindow(c)) return { doneLeadIds: [], remaining: 0 };
    await rotation.resetDailyCaps();

    const globalUnsub = (await data.getSetting("include_unsubscribe", "1")) !== "0";
    const includeUnsub = c.include_unsubscribe == null ? globalUnsub : !!c.include_unsubscribe;
    const blockSpam = (await data.getSetting("block_spammy_sends")) === "1";
    const spamThreshold = parseInt(await data.getSetting("spam_block_threshold"), 10) || 55;
    const requireDmarc = (await data.getSetting("require_dmarc")) === "1";

    const where = { campaign_id: c.id, flow_node_id: node.id, status: "queued", scheduled_at: { lte: new Date() } };
    const total = await prisma.sends.count({ where });
    const dueSends = await prisma.sends.findMany({ where, orderBy: { scheduled_at: "asc" }, take: Number(batchSize) });
    if (!dueSends.length) return { doneLeadIds: [], remaining: total };

    const leadMap = new Map();
    for (const l of await prisma.leads.findMany({ where: { id: { in: [...new Set(dueSends.map((s) => s.lead_id))] } } })) leadMap.set(l.id, l);

    const doneLeadIds = [];
    for (const s of dueSends) {
      const lead = leadMap.get(s.lead_id) || {};
      const email = lead.email;
      if (!email) { await prisma.sends.update({ where: { id: s.id }, data: { status: "failed", error: "no email address" } }); doneLeadIds.push(s.lead_id); continue; }
      if (await suppress.isSuppressed(email)) {
        await prisma.sends.update({ where: { id: s.id }, data: { status: "suppressed", error: "on suppression list" } });
        if (lead.company_id) await prisma.companies.update({ where: { id: lead.company_id }, data: { status: "dnc" } });
        doneLeadIds.push(s.lead_id); continue;
      }
      if (blockSpam) {
        const lint = lintEmail({ subject: s.subject, body: s.body });
        if (lint.score >= spamThreshold) {
          await prisma.sends.update({ where: { id: s.id }, data: { status: "blocked", error: `blocked: spammy content (score ${lint.score}) — ${lint.flags[0] || ""}` } });
          doneLeadIds.push(s.lead_id); continue;
        }
      }
      const account = await rotation.pickAccount(c.id);
      if (!account) break;

      if (requireDmarc && !(await dmarcOk((account.from_email || "").split("@")[1]))) {
        await prisma.sends.update({ where: { id: s.id }, data: { status: "blocked", error: "blocked: sender domain has no DMARC record", account_id: account.id } });
        doneLeadIds.push(s.lead_id); continue;
      }

      const varCtx = { ...lead, sender: c.sender_name || "", booking_link: c.booking_link || "" };
      let subject = renderVars(s.subject, varCtx), variantId = null;
      if (s.step_no === 1) {
        const v = await prisma.subject_variants.findFirst({ where: { campaign_id: c.id, active: 1 }, orderBy: [{ sent_count: "asc" }, { id: "asc" }] });
        if (v) { subject = renderVars(v.subject, varCtx); variantId = v.id; }
      }
      const renderedBody = renderVars(s.body, varCtx);

      const owned = sending.isOwned(account.method);
      let text = renderedBody, html = null;
      if (owned) {
        const unsubUrl = includeUnsub ? `${config.publicBaseUrl}/u/${s.tracking_id}` : "";
        text = includeUnsub ? `${renderedBody}\n\n—\nNot interested? Unsubscribe: ${unsubUrl}` : renderedBody;
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
      } catch (e) {
        await prisma.sends.update({ where: { id: s.id }, data: { status: "failed", error: String(e.message || e).slice(0, 500), account_id: account.id } });
      }
      doneLeadIds.push(s.lead_id);
    }

    return { doneLeadIds, remaining: Math.max(0, total - doneLeadIds.length) };
  },
};
