"use strict";
const express = require("express");
const data = require("../lib/data");
const { getPrompts, savePrompts, DEFAULT_REPORT_PROMPT } = require("../lib/reportPrompts");

const router = express.Router();
const KEYS = ["default_timezone", "default_sender", "include_unsubscribe",
  "per_domain_daily_cap", "warmup_base", "warmup_step", "require_dmarc",
  "block_spammy_sends", "spam_block_threshold", "bounce_pause_rate", "outbound_webhook_url",
  "brand_name", "brand_primary", "brand_secondary", "brand_logo"];

router.get("/api/appsettings", async (req, res) => {
  const out = {};
  for (const k of KEYS) out[k] = await data.getSetting(k);
  if (out.include_unsubscribe == null) out.include_unsubscribe = "1"; // default ON
  out.report_ai_prompts = await getPrompts();
  out.report_ai_prompt_default = DEFAULT_REPORT_PROMPT;
  res.json(out);
});

router.put("/api/appsettings", async (req, res) => {
  if (!req.session || req.session.role !== "admin") return res.status(403).json({ error: "Admins only" });
  const b = req.body || {};
  for (const k of KEYS) {
    if (b[k] === undefined) continue;
    await data.setSetting(k, String(b[k]));
  }
  if (Array.isArray(b.report_ai_prompts)) await savePrompts(b.report_ai_prompts);
  res.json({ ok: true });
});

module.exports = router;
