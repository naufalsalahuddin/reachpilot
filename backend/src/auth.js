"use strict";
const bcrypt = require("bcryptjs");
const prisma = require("./lib/prisma");
const config = require("./config");

/** Create the first admin from .env if there are no users yet. */
async function ensureAdmin() {
  const n = await prisma.users.count();
  if (n > 0) return;
  if (!config.admin.email || !config.admin.password) {
    console.warn("[auth] No users and no ADMIN_EMAIL/ADMIN_PASSWORD in .env — set them and restart to log in.");
    return;
  }
  const hash = await bcrypt.hash(config.admin.password, 10);
  await prisma.users.create({
    data: { email: config.admin.email.toLowerCase(), password_hash: hash, role: "admin", status: "active", created_at: new Date() },
  });
  console.log(`[auth] Created admin user ${config.admin.email}`);
}

async function verify(email, password) {
  const user = await prisma.users.findUnique({ where: { email: String(email || "").toLowerCase() } });
  if (!user || user.status === "disabled") return null;
  const ok = await bcrypt.compare(password || "", user.password_hash);
  return ok ? { id: user.id, email: user.email, role: user.role || "admin" } : null;
}

/** Gate: APIs get 401 (the SPA handles redirects to /login). */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: "unauthorized" });
}

/** Admin-only gate (user management + API keys). */
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === "admin") return next();
  return res.status(403).json({ error: "Admins only" });
}

module.exports = { ensureAdmin, verify, requireAuth, requireAdmin };
