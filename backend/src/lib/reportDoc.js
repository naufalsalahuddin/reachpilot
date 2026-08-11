"use strict";
/**
 * Build a TipTap/ProseMirror JSON document for the audit report. Stored in the DB
 * (reports.content_json) and rendered to PDF by reportPdf. Keeping the document as
 * the single source of truth means edits, AI rewrites and PageSpeed all persist.
 */
const RED = "#d1364a", GREEN = "#1f9d67", WARN = "#c47d13", BLUE = "#2563eb";

const text = (str, marks) => ({ type: "text", text: String(str || ""), ...(marks && marks.length ? { marks } : {}) });
const bold = { type: "bold" };
const color = (c) => ({ type: "textStyle", attrs: { color: c } });
const para = (runs) => ({ type: "paragraph", content: Array.isArray(runs) ? runs : [text(runs)] });
const heading = (level, str, c) => ({ type: "heading", attrs: { level }, content: [text(str, c ? [color(c)] : undefined)] });
const listItem = (runs) => ({ type: "listItem", content: [para(runs)] });
const bulletList = (items) => ({ type: "bulletList", content: items.map((it) => listItem(it)) });

function scoreColor(s) { return s == null ? WARN : s >= 90 ? GREEN : s >= 50 ? WARN : RED; }

/** Nodes for the PageSpeed section (detailed: scores, metrics, opportunities) — lives IN the document. */
function pagespeedNodes(ps) {
  if (!ps) return [];
  const nodes = [heading(2, "Page performance (Google Lighthouse)", BLUE)];
  for (const [k, label] of [["mobile", "Mobile"], ["desktop", "Desktop"]]) {
    const r = ps[k];
    if (!r) continue;
    if (r.score == null) { nodes.push(para([text(`${label}: not measured${r.error ? " (" + r.error + ")" : ""}`, [color(WARN)])])); continue; }
    nodes.push(para([text(`${label} — ${r.score}/100`, [bold, color(scoreColor(r.score))])]));
    const metrics = Object.entries(r.metrics || {}).filter(([, v]) => v).map(([m, v]) => [text(m + ": ", [bold]), text(v)]);
    if (metrics.length) nodes.push(bulletList(metrics));
    if (r.opportunities && r.opportunities.length) {
      nodes.push(para([text("Top opportunities:", [bold])]));
      nodes.push(bulletList(r.opportunities.map((o) => [text(o.title, [bold]), text(o.saving ? `  (${o.saving})` : ""), ...(o.description ? [text(" — " + o.description)] : [])])));
    }
  }
  return nodes;
}

function buildDoc({ intro, whatsGood = [], whatsBad = [], pagespeed = null } = {}) {
  const content = [];
  if (intro) content.push(para(intro));
  content.push(heading(2, "What's working", GREEN));
  content.push(whatsGood.length ? bulletList(whatsGood.map((g) => [text(typeof g === "string" ? g : g.title)])) : para([text("—")]));
  content.push(heading(2, "What needs attention", RED));
  content.push(whatsBad.length
    ? bulletList(whatsBad.map((b) => [text(b.title || b, [bold]), ...(b.detail ? [text(" — " + b.detail)] : [])]))
    : para([text("No major issues found on the homepage.")]));
  for (const n of pagespeedNodes(pagespeed)) content.push(n);
  return { type: "doc", content };
}

/** Build ONE cohesive document from AI output — performance is woven in, not bolted on. */
function buildDocFromAi({ intro, strengths = [], issues = [], performanceSummary = "", pagespeed = null, closing = "" } = {}) {
  const content = [];
  if (intro) content.push(para(intro));
  content.push(heading(2, "What's working", GREEN));
  content.push(strengths.length ? bulletList(strengths.map((s) => [text(typeof s === "string" ? s : s.title)])) : para([text("—")]));
  content.push(heading(2, "What needs attention", RED));
  content.push(issues.length
    ? bulletList(issues.map((b) => [text(b.title || b, [bold]), ...(b.detail ? [text(" — " + b.detail)] : [])]))
    : para([text("No major issues found on the homepage.")]));
  if (performanceSummary || pagespeed) {
    content.push(heading(2, "Website performance", BLUE));
    if (performanceSummary) content.push(para(performanceSummary));
    if (pagespeed) {
      const scores = [];
      for (const [k, l] of [["mobile", "Mobile"], ["desktop", "Desktop"]]) {
        const r = pagespeed[k];
        if (r && r.score != null) scores.push([text(l + ": ", [bold, color(scoreColor(r.score))]), text(`${r.score}/100`, [color(scoreColor(r.score))])]);
      }
      if (scores.length) content.push(bulletList(scores));
    }
  }
  if (closing) content.push(para(closing));
  return { type: "doc", content };
}

// ---- full AI rewrite: the model returns free-form blocks, we render them ----
const DEFAULT_REPORT_PROMPT = `You are a senior web consultant writing a website-audit report for a small-business owner who is NOT technical.
Write a clear, warm, persuasive report that:
- opens with a short, friendly summary of the overall picture;
- highlights what the website already does well;
- explains each problem in plain language and why it costs them customers (no jargon);
- interprets the Google PageSpeed / Lighthouse scores in everyday terms — especially call out slow mobile if relevant — and ties speed to the visitor's experience;
- ends with a confident, low-pressure offer to help.
Never invent numbers, statistics, competitors or facts beyond the data provided. Keep it concise and skimmable. Use clear section headings.`;

function blocksToDoc(blocks) {
  const content = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || !b.type) continue;
    if (b.type === "heading") content.push(heading(Math.min(3, Math.max(1, b.level || 2)), b.text || ""));
    else if (b.type === "bullets") content.push(bulletList((b.items || []).map((i) => [text(String(i))])));
    else content.push(para(String(b.text || "")));
  }
  if (!content.length) content.push(para([text("")]));
  return { type: "doc", content };
}

module.exports = { buildDoc, buildDocFromAi, pagespeedNodes, blocksToDoc, DEFAULT_REPORT_PROMPT };
