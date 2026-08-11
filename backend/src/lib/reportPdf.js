"use strict";
/**
 * Server-side audit report → real, selectable-text PDF via PDFKit.
 * Renders either a saved TipTap JSON document (preferred) or the template
 * sections. Used by "Download PDF" and the email attachment.
 */
const PDFKit = require("pdfkit");

const BLUE = "#2563eb", GREEN = "#1f9d67", RED = "#d1364a", INK = "#1b1b2e", MUTED = "#6b6b80", WARN = "#c47d13";
const pxToPt = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n * 0.75 : null; };

function header(doc, data, W, left) {
  doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(9).text("WEBSITE AUDIT", { characterSpacing: 1.5 });
  doc.moveDown(0.2);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(data.business || "Website audit");
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text([data.website, data.city].filter(Boolean).join("  ·  "));
  doc.fillColor(MUTED).fontSize(9).text(new Date().toLocaleDateString() + (data.platform ? "   ·   Built on " + data.platform : ""));
  doc.moveDown(0.4);
  doc.moveTo(left, doc.y).lineTo(left + W, doc.y).lineWidth(2).strokeColor(BLUE).stroke();
  doc.moveDown(0.8);
  if (data.screenshotBuffer && data.screenshotBuffer.length) {
    try { doc.image(data.screenshotBuffer, left, doc.y, { fit: [W, 240], align: "center" }); doc.y += 246; } catch { /* skip */ }
  }
  const meta = [];
  if (data.industry) meta.push("Industry: " + data.industry);
  if (data.phone) meta.push("Phone: " + data.phone);
  if (data.reviewCount) meta.push(`Reviews: ${data.reviewCount}${data.rating ? ` (${Number(data.rating).toFixed(1)}★)` : ""}`);
  if (meta.length) { doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(meta.join("     ")); doc.moveDown(0.4); }
}

// ---- TipTap JSON rendering ----
function runsOf(node) {
  const out = [];
  for (const c of node.content || []) {
    if (c.type !== "text") continue;
    const marks = c.marks || [];
    const style = marks.find((m) => m.type === "textStyle");
    out.push({
      text: c.text || "",
      bold: marks.some((m) => m.type === "bold"),
      italic: marks.some((m) => m.type === "italic"),
      underline: marks.some((m) => m.type === "underline"),
      color: style?.attrs?.color || null,
      size: style?.attrs?.fontSize ? pxToPt(style.attrs.fontSize) : null,
    });
  }
  return out;
}
function fontFor(bold, italic) {
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}
function renderRuns(doc, runs, { baseSize, baseBold, indent = 0, W, left }) {
  if (!runs.length) { doc.moveDown(0.3); return; }
  const opts = { width: W - indent, continued: false };
  runs.forEach((r, i) => {
    doc.font(fontFor(r.bold || baseBold, r.italic)).fontSize(r.size || baseSize).fillColor(r.color || INK);
    const last = i === runs.length - 1;
    if (i === 0) doc.text(r.text, left + indent, doc.y, { ...opts, continued: !last });
    else doc.text(r.text, { continued: !last });
  });
}
function renderNode(doc, node, ctx) {
  const { W, left } = ctx;
  switch (node.type) {
    case "heading": {
      const lvl = node.attrs?.level || 2;
      doc.moveDown(0.5);
      renderRuns(doc, runsOf(node), { baseSize: lvl === 1 ? 18 : lvl === 2 ? 15 : 13, baseBold: true, W, left });
      doc.moveDown(0.2);
      break;
    }
    case "paragraph":
      renderRuns(doc, runsOf(node), { baseSize: 11, baseBold: false, W, left });
      doc.moveDown(0.4);
      break;
    case "bulletList":
    case "orderedList": {
      let n = 1;
      for (const li of node.content || []) {
        const marker = node.type === "orderedList" ? `${n++}. ` : "•  ";
        const para = (li.content || []).find((x) => x.type === "paragraph") || { content: [] };
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(11).fillColor(node.type === "orderedList" ? INK : BLUE).text(marker, left + 8, y, { width: 20, continued: false });
        renderRuns(doc, runsOf(para), { baseSize: 11, baseBold: false, indent: 26, W, left });
        doc.moveDown(0.25);
      }
      doc.moveDown(0.2);
      break;
    }
    default:
      if (node.content) for (const c of node.content) renderNode(doc, c, ctx);
  }
}

function bullet(doc, title, detail, color, W, left) {
  const y = doc.y;
  doc.fillColor(color).font("Helvetica-Bold").fontSize(11).text("•", left, y, { width: 12 });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(title, left + 14, y, { width: W - 14 });
  if (detail) doc.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(detail, left + 14, doc.y, { width: W - 14 });
  doc.moveDown(0.4);
}

function buildReportPdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFKit({ size: "A4", margin: 54 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      header(doc, data, W, left);

      const heading = (text, color) => { doc.moveDown(0.5); doc.fillColor(color).font("Helvetica-Bold").fontSize(14).text(text); doc.moveDown(0.3); };

      if (data.contentJson && data.contentJson.content) {
        // render the saved editable document
        for (const node of data.contentJson.content) renderNode(doc, node, { W, left });
      } else {
        if (data.note) { doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(data.note, { width: W }); doc.moveDown(0.4); }
        if (data.whatsGood?.length) { heading("What's working", GREEN); for (const g of data.whatsGood) bullet(doc, typeof g === "string" ? g : g.title, typeof g === "string" ? "" : g.detail, GREEN, W, left); }
        if (data.whatsBad?.length) { heading("What needs attention", RED); for (const b of data.whatsBad) bullet(doc, b.title || b, b.detail || "", b.state === "UNKNOWN" ? WARN : RED, W, left); }
        if (data.pagespeedBullets?.length) { heading("Page performance (Google Lighthouse)", BLUE); for (const p of data.pagespeedBullets) bullet(doc, p, "", BLUE, W, left); }
      }

      doc.moveDown(1);
      doc.moveTo(left, doc.y).lineTo(left + W, doc.y).lineWidth(0.5).strokeColor("#e6e6ef").stroke();
      doc.moveDown(0.4);
      doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(8.5).text(
        `Automated check of the public homepage${data.auditedAt ? " on " + new Date(data.auditedAt).toLocaleDateString() : ""}. Happy to walk through any of it.`, { width: W });

      doc.end();
    } catch (e) { reject(e); }
  });
}

async function fetchScreenshot(url) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    if (!/image\//.test(r.headers.get("content-type") || "")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 1000 ? buf : null;
  } catch { return null; }
}

module.exports = { buildReportPdf, fetchScreenshot };
