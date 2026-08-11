"use strict";
const express = require("express");
const keystore = require("../lib/keystore");
const crypto = require("../lib/crypto");
const prisma = require("../lib/prisma");

const router = express.Router();

router.get("/api/keys", async (req, res) => {
  try { res.json(await keystore.listKeys()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/keys", async (req, res) => {
  try {
    const { provider, label, key } = req.body || {};
    await keystore.addKey(provider, label, key);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put("/api/keys/:id", async (req, res) => {
  try { await keystore.updateKey(parseInt(req.params.id, 10), req.body || {}); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/api/keys/:id", async (req, res) => {
  try { await keystore.deleteKey(parseInt(req.params.id, 10)); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/api/keys/test", async (req, res) => {
  try {
    const { provider, key } = req.body || {};
    await keystore.testKey(provider, key);
    res.json({ ok: true, message: "Key works" });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post("/api/keys/:id/test", async (req, res) => {
  try {
    const row = await prisma.api_keys.findUnique({ where: { id: parseInt(req.params.id, 10) }, select: { provider: true, key_ciphertext: true } });
    if (!row) return res.status(404).json({ error: "not found" });
    await keystore.testKey(row.provider, crypto.decrypt(row.key_ciphertext));
    await prisma.api_keys.update({ where: { id: parseInt(req.params.id, 10) }, data: { status: "active", cooldown_until: null, last_error: null } });
    res.json({ ok: true, message: "Key works" });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

module.exports = router;
