"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const crypto = require("../lib/crypto");
const sending = require("../sending");

const router = express.Router();

function publicAccount(a) {
  let keys = [];
  try { keys = Object.keys(crypto.decryptJSON(a.config_json)); } catch { keys = []; }
  return {
    id: a.id, name: a.name, method: a.method, from_name: a.from_name, from_email: a.from_email,
    daily_cap: a.daily_cap, sent_today: a.sent_today, warmup: a.warmup, status: a.status,
    owned: sending.isOwned(a.method), config_keys: keys, last_checked: a.last_checked,
  };
}

router.get("/api/accounts", async (req, res) => {
  const rows = await prisma.sending_accounts.findMany({ orderBy: { id: "desc" } });
  res.json(rows.map(publicAccount));
});

router.post("/api/accounts", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !sending.METHODS.includes(b.method)) {
      return res.status(400).json({ error: "name and a valid method are required" });
    }
    const row = await prisma.sending_accounts.create({
      data: {
        name: b.name, method: b.method, from_name: b.from_name || null, from_email: b.from_email || null,
        config_json: crypto.encrypt(b.config || {}), daily_cap: parseInt(b.daily_cap, 10) || 30,
        warmup: b.warmup ? 1 : 0, status: "active", created_at: new Date(),
        last_reset: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    res.json({ id: row.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/api/accounts/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    for (const f of ["name", "from_name", "from_email", "daily_cap", "status"]) if (b[f] !== undefined) data[f] = b[f];
    if (b.daily_cap !== undefined) data.daily_cap = parseInt(b.daily_cap, 10) || 30;
    if (b.warmup !== undefined) data.warmup = b.warmup ? 1 : 0;
    if (b.config && Object.keys(b.config).length) data.config_json = crypto.encrypt(b.config);
    if (!Object.keys(data).length) return res.json({ ok: true });
    await prisma.sending_accounts.update({ where: { id: parseInt(req.params.id, 10) }, data });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.campaign_accounts.deleteMany({ where: { account_id: id } });
    await prisma.sending_accounts.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/accounts/:id/test", async (req, res) => {
  try {
    const a = await prisma.sending_accounts.findUnique({ where: { id: parseInt(req.params.id, 10) } });
    if (!a) return res.status(404).json({ error: "not found" });
    await sending.testAccount(a);
    res.json({ ok: true, message: "Connection OK" });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

module.exports = router;
