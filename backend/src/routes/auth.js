"use strict";
const express = require("express");
const bcrypt = require("bcryptjs");
const auth = require("../auth");
const prisma = require("../lib/prisma");

const router = express.Router();

router.post("/api/login", async (req, res) => {
  try {
    const user = await auth.verify(req.body.email, req.body.password);
    if (!user) return res.status(401).json({ error: "Wrong email or password" });
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    // "Remember me" → persistent 30-day cookie; otherwise clears on browser close
    req.session.cookie.maxAge = req.body.remember ? 1000 * 60 * 60 * 24 * 30 : null;
    await prisma.users.update({ where: { id: user.id }, data: { last_login: new Date() } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/api/me", (req, res) => {
  if (req.session && req.session.userId) return res.json({ email: req.session.email, role: req.session.role || "admin" });
  res.status(401).json({ error: "unauthorized" });
});

// change your own email / password (requires the current password)
router.put("/api/profile", auth.requireAuth, async (req, res) => {
  try {
    const { current_password, email, new_password } = req.body || {};
    const user = await prisma.users.findUnique({ where: { id: req.session.userId } });
    if (!user) return res.status(404).json({ error: "not found" });
    const ok = await bcrypt.compare(current_password || "", user.password_hash);
    if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

    const data = {};
    if (email && email.toLowerCase() !== user.email) {
      const exists = await prisma.users.findFirst({ where: { email: email.toLowerCase(), NOT: { id: user.id } }, select: { id: true } });
      if (exists) return res.status(400).json({ error: "That email is already in use" });
      data.email = email.toLowerCase();
    }
    if (new_password) {
      if (new_password.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
      data.password_hash = await bcrypt.hash(new_password, 10);
    }
    if (Object.keys(data).length) {
      await prisma.users.update({ where: { id: user.id }, data });
      if (data.email) req.session.email = data.email;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
