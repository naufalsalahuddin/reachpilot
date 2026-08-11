"use strict";
/**
 * Cron entry point. Point a cron job (every minute or few) at:
 *   GET https://your-app/cron/tick?token=YOUR_CRON_TOKEN
 * It claims and runs one batch of queued jobs. This is deliberately public
 * (no login) but guarded by the token, so cron can hit it without a session.
 */
const express = require("express");
const config = require("../config");
const { processBatch } = require("../jobs/worker");

const router = express.Router();

router.get("/cron/tick", async (req, res) => {
  if (!config.cronToken || req.query.token !== config.cronToken) {
    return res.status(403).json({ error: "bad token" });
  }
  try {
    const out = await processBatch(config.batch.audit + config.batch.draft);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
