"use strict";
const express = require("express");
const prisma = require("../lib/prisma");
const suppress = require("../lib/suppress");

const router = express.Router();

router.get("/api/suppression", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const per = Math.min(200, Math.max(10, parseInt(req.query.per, 10) || 50));
    const where = req.query.q ? { value: { contains: req.query.q } } : {};
    const total = await prisma.suppression.count({ where });
    const items = await prisma.suppression.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * per, take: per });
    res.json({ items, total, page, per, pages: Math.max(1, Math.ceil(total / per)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/suppression", async (req, res) => {
  try {
    const b = req.body || {};
    let added = 0;
    const list = [];
    if (b.text) list.push(...b.text.split(/[\s,;]+/).filter(Boolean));
    if (b.value) list.push(b.value);
    for (const raw of list) {
      const v = raw.trim().toLowerCase();
      if (!v) continue;
      await suppress.add(v, v.includes("@") ? "email" : "domain", b.reason || "manual");
      added++;
    }
    res.json({ ok: true, added });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/api/suppression/:id", async (req, res) => {
  try { await prisma.suppression.delete({ where: { id: parseInt(req.params.id, 10) } }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
