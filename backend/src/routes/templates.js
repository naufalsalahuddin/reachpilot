"use strict";
/** Email DESIGN templates (HTML layouts that wrap the plain-text body). */
const express = require("express");
const prisma = require("../lib/prisma");
const { DEFAULTS } = require("../lib/emailDesign");

const router = express.Router();

async function ensureSeed() {
  const withHtml = await prisma.email_templates.count({ where: { html: { not: null } } });
  if (withHtml > 0) return;
  // Fresh install, or the table still holds the old plain-text copy seeds — clear
  // any legacy rows that were never given a design and seed the default designs.
  await prisma.email_templates.deleteMany({ where: { html: null } });
  for (const t of DEFAULTS) {
    await prisma.email_templates.create({ data: { name: t.name, html: t.html, created_at: new Date() } });
  }
}

router.get("/api/templates", async (req, res) => {
  try { await ensureSeed(); res.json(await prisma.email_templates.findMany({ orderBy: { id: "asc" } })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/templates", async (req, res) => {
  try {
    const b = req.body || {};
    if (!(b.name || "").trim()) return res.status(400).json({ error: "name required" });
    if (!(b.html || "").trim()) return res.status(400).json({ error: "html required" });
    if (!/\{\{\s*content\s*\}\}/.test(b.html)) return res.status(400).json({ error: "design must include a {{content}} placeholder" });
    const row = await prisma.email_templates.create({ data: { name: b.name.trim(), html: b.html, created_at: new Date() } });
    res.json({ id: row.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put("/api/templates/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.name !== undefined) data.name = String(b.name).trim();
    if (b.html !== undefined) {
      if (!/\{\{\s*content\s*\}\}/.test(b.html || "")) return res.status(400).json({ error: "design must include a {{content}} placeholder" });
      data.html = b.html || null;
    }
    await prisma.email_templates.update({ where: { id: parseInt(req.params.id, 10) }, data });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/api/templates/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Detach from any campaign that used this design so sends fall back to plain text.
    await prisma.campaigns.updateMany({ where: { email_template_id: id }, data: { email_template_id: null } });
    await prisma.email_templates.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
