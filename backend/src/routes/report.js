"use strict";
const express = require("express");
const { getReportData, saveReportContent, saveReportPagespeed } = require("../lib/reportData");
const { buildReportPdf, fetchScreenshot } = require("../lib/reportPdf");
const { pagespeedNodes, blocksToDoc, DEFAULT_REPORT_PROMPT } = require("../lib/reportDoc");
const { getPrompts } = require("../lib/reportPrompts");
const pagespeed = require("../lib/pagespeed");
const providers = require("../lib/ai/providers");

const router = express.Router();
const safeName = (s) => String(s || "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");

// report data + saved editable document + saved PageSpeed
router.get("/api/report/:leadId", async (req, res) => {
  try {
    const data = await getReportData(req.params.leadId);
    if (!data) return res.status(404).json({ error: "not found" });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// save the edited document (TipTap JSON) to the DB
router.put("/api/report/:leadId", async (req, res) => {
  try {
    if (!req.body || !req.body.content) return res.status(400).json({ error: "content required" });
    await saveReportContent(req.params.leadId, req.body.content);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// run PageSpeed, STORE it, and return the doc-nodes to drop into the document
router.post("/api/report/:leadId/pagespeed", async (req, res) => {
  try {
    const data = await getReportData(req.params.leadId);
    if (!data || !data.website) return res.status(400).json({ error: "this lead has no website" });
    const ps = await pagespeed.runBoth(data.website);
    await saveReportPagespeed(req.params.leadId, ps);
    res.json({ pagespeed: ps, nodes: pagespeedNodes(ps) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// proxy the homepage screenshot (reliable, same-origin, no CORS/taint)
router.get("/api/report/:leadId/screenshot", async (req, res) => {
  try {
    const data = await getReportData(req.params.leadId);
    if (!data || !data.screenshot) return res.status(404).end();
    const buf = await fetchScreenshot(data.screenshot);
    if (!buf) return res.status(404).end();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// generate the PDF from the (possibly edited) document, else the saved/default one
router.post("/api/report/:leadId/pdf", async (req, res) => {
  try {
    const data = await getReportData(req.params.leadId);
    if (!data) return res.status(404).json({ error: "not found" });
    const contentJson = (req.body && req.body.content) || data.content;
    const screenshotBuffer = await fetchScreenshot(data.screenshot);
    const pdf = await buildReportPdf({
      business: (req.body && req.body.business) || data.business, website: data.website, city: data.city, industry: data.industry,
      phone: data.phone, reviewCount: data.review_count, rating: data.rating, platform: data.platform, auditedAt: data.audited_at,
      screenshotBuffer, contentJson,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="audit-${safeName(data.business)}.pdf"`);
    res.end(pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI → ENTIRELY rewrite the report as one cohesive document, using a user-defined
// report "type" (Settings → Report AI) as the base prompt, plus any extra comments.
router.post("/api/report/:leadId/ai", async (req, res) => {
  try {
    const data = await getReportData(req.params.leadId);
    if (!data) return res.status(404).json({ error: "not found" });
    let provider = (req.body && req.body.provider) || (await providers.availableProviders())[0];
    if (!provider || !(await providers.isAvailable(provider))) return res.status(400).json({ error: "no AI provider connected — add a key under Integrations" });

    const prompts = await getPrompts();
    const chosen = prompts.find((p) => p.id === (req.body && req.body.promptId)) || prompts[0];
    const basePrompt = (chosen && chosen.prompt) || DEFAULT_REPORT_PROMPT;
    const instruction = (req.body && req.body.instruction) || "";

    const good = data.whatsGood.map((g) => (typeof g === "string" ? g : g.title)).join("\n");
    const bad = data.whatsBad.map((b) => `${b.title}: ${b.detail}`).join("\n");
    const ps = data.pagespeed;
    const psText = ps ? [["mobile", "Mobile"], ["desktop", "Desktop"]].map(([k, l]) => {
      const r = ps[k]; if (!r || r.score == null) return null;
      return `${l}: ${r.score}/100 (${Object.entries(r.metrics || {}).filter(([, v]) => v).slice(0, 5).map(([m, v]) => m + " " + v).join(", ")})`;
    }).filter(Boolean).join("\n") : "";

    const prompt = `${basePrompt}${instruction ? "\n\nExtra comments from the user (follow these): " + instruction : ""}

Use ONLY this data — never invent numbers or facts:

BUSINESS: ${data.business}${data.industry ? " (" + data.industry + ")" : ""}${data.website ? " — " + data.website : ""}

WHAT'S WORKING:
${good || "(nothing notable)"}

WHAT NEEDS ATTENTION:
${bad || "(nothing major)"}

PAGE PERFORMANCE (Google Lighthouse):
${psText || "(not measured — do not mention performance)"}

Return STRICT JSON with a "blocks" array that IS the whole report, in order:
{"blocks":[{"type":"heading","level":2,"text":"Section title"},{"type":"paragraph","text":"..."},{"type":"bullets","items":["...","..."]}]}
Use headings to structure sections and weave the performance findings into the narrative. Return only the JSON.`;

    const raw = await providers.chat({ provider, system: "You output only valid JSON. No markdown fences, no commentary.", prompt, maxTokens: 1400, temperature: 0.6 });
    let parsed;
    try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim()); }
    catch { return res.status(502).json({ error: "AI returned an unexpected format — try again" }); }
    res.json({ content: blocksToDoc(parsed.blocks) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
