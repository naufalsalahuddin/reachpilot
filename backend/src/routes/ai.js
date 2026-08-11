"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const providers = require("../lib/ai/providers");
const { applyEdit, presets } = require("../lib/ai/edit");
const { makeDraft } = require("../lib/draft");

const router = express.Router();

router.get("/api/ai/providers", async (req, res) => {
  res.json({ available: await providers.availableProviders(), presets: presets() });
});

router.post("/api/ai/edit", async (req, res) => {
  try {
    const { provider, op, text, instruction, model } = req.body || {};
    if (!(await providers.isAvailable(provider))) {
      return res.status(400).json({ error: `Provider "${provider}" has no API key configured` });
    }
    const out = await applyEdit({ provider, op, text, instruction, model });
    res.json({ text: out });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// regenerate a draft from its verified hook (does not touch the final/approved copy)
router.post("/api/ai/redraft/:draftId", async (req, res) => {
  try {
    const provider = (req.body && req.body.provider) || "template";
    const d = await prisma.drafts.findUnique({ where: { id: parseInt(req.params.draftId, 10) } });
    if (!d) return res.status(404).json({ error: "draft not found" });
    const lead = await prisma.leads.findUnique({ where: { id: d.lead_id } });
    const audit = d.audit_id ? await prisma.audits.findUnique({ where: { id: d.audit_id } }) : null;
    const campaign = await prisma.campaigns.findUnique({ where: { id: d.campaign_id } });

    let checks = [];
    try { checks = JSON.parse(audit?.checks_json || "[]"); } catch { checks = []; }
    const hookCheck = checks.find((ch) => ch.key === d.hook_key);
    if (!hookCheck) return res.status(400).json({ error: "no verified hook to draft from" });

    let pagespeed = null;
    try { pagespeed = JSON.parse(audit?.meta_json || "{}").pagespeed || null; } catch { /* ignore */ }

    const hook = { key: hookCheck.key, label: hookCheck.label, detail: hookCheck.detail, evidence: hookCheck.evidence };
    const result = await makeDraft(lead, hook, campaign?.sender_name || "", {
      provider, model: campaign?.ai_model, rules: campaign?.pitch_rules, pagespeed,
    });
    await prisma.drafts.update({
      where: { id: d.id },
      data: { subject: result.subject, body: result.body, flags_json: JSON.stringify(result.flags), source: result.source },
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
