"use strict";
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");

const router = express.Router();
const ROLES = ["admin", "member"];

router.get("/api/users", async (req, res) => {
  const rows = await prisma.users.findMany({
    select: { id: true, email: true, role: true, status: true, last_login: true, created_at: true },
    orderBy: { id: "asc" },
  });
  res.json(rows.map((u) => ({ ...u, is_you: u.id === req.session.userId })));
});

router.post("/api/users", async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    if (password.length < 6) return res.status(400).json({ error: "password must be at least 6 characters" });
    if (!ROLES.includes(role)) return res.status(400).json({ error: "invalid role" });
    const exists = await prisma.users.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
    if (exists) return res.status(400).json({ error: "That email is already in use" });
    const hash = await bcrypt.hash(password, 10);
    await prisma.users.create({ data: { email: email.toLowerCase(), password_hash: hash, role, status: "active", created_at: new Date() } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function adminCount() {
  return prisma.users.count({ where: { role: "admin", status: "active" } });
}

router.put("/api/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await prisma.users.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "not found" });
    const b = req.body || {};

    const wouldLoseAdmin = (b.role && b.role !== "admin" && user.role === "admin") || (b.status === "disabled" && user.role === "admin");
    if (wouldLoseAdmin && (await adminCount()) <= 1) {
      return res.status(400).json({ error: "This is the last admin — promote someone else first" });
    }

    const data = {};
    if (b.role && ROLES.includes(b.role)) data.role = b.role;
    if (b.status && ["active", "disabled"].includes(b.status)) data.status = b.status;
    if (b.password) {
      if (b.password.length < 6) return res.status(400).json({ error: "password must be at least 6 characters" });
      data.password_hash = await bcrypt.hash(b.password, 10);
    }
    if (!Object.keys(data).length) return res.json({ ok: true });
    await prisma.users.update({ where: { id }, data });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.session.userId) return res.status(400).json({ error: "You can't delete your own account" });
    const user = await prisma.users.findUnique({ where: { id } });
    if (!user) return res.json({ ok: true });
    if (user.role === "admin" && (await adminCount()) <= 1) return res.status(400).json({ error: "This is the last admin — can't delete" });
    await prisma.users.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
