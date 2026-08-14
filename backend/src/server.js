"use strict";
/**
 * Outreach API — Express + Prisma. Pure JSON API + public tracking/cron endpoints.
 * The frontend is a separate Vite + React SPA (./frontend) that calls this over
 * HTTPS with credentialed cookies, so CORS + a credentialed session are enabled.
 */
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const config = require("./config");
const auth = require("./auth");
const prisma = require("./lib/prisma");
const { applyPendingMigrations } = require("./lib/migrate");

const app = express();
app.set("trust proxy", 1);

// CORS for the SPA origin(s). FRONTEND_ORIGIN can be a comma-separated allowlist;
// otherwise the request origin is reflected (fine for local dev on localhost:5173).
const allowlist = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / same-origin / server-to-server
      if (!allowlist.length || allowlist.includes(origin))
        return cb(null, true);
      cb(new Error(`origin ${origin} not allowed by CORS`));
    },
  }),
);

app.use(express.json({ limit: "5mb" })); // headroom for CSV imports
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: process.env.COOKIE_SAMESITE || "lax", // set 'none' + secure for cross-site prod
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  }),
);

// ---- public routes (no session) ----
app.use(require("./routes/cron")); // /cron/tick (token-guarded)
app.use(require("./routes/tracking")); // /t/o, /t/c, /u/:tid, /webhook/meeting
app.use(require("./routes/auth")); // /api/login, /api/logout, /api/me, /api/profile
app.get("/", (req, res) => res.json({ ok: true, service: "deployit-api" }));
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use(require("./routes/branding")); // public: /api/branding

// ---- everything below requires a session ----
app.use(auth.requireAuth);
app.use(["/api/users", "/api/keys"], auth.requireAdmin);

app.use(require("./routes/campaigns"));
if (config.flowBuilderEnabled) app.use(require("./routes/flows")); // dark-launched — see config.js
app.use(require("./routes/review"));
app.use(require("./routes/ai"));
app.use(require("./routes/accounts"));
app.use(require("./routes/keys"));
app.use(require("./routes/users"));
app.use(require("./routes/companies"));
app.use(require("./routes/inbox"));
app.use(require("./routes/suppression"));
app.use(require("./routes/report"));
app.use(require("./routes/analytics"));
app.use(require("./routes/dns"));
app.use(require("./routes/appsettings"));
app.use(require("./routes/guide"));
app.use(require("./routes/status"));
app.use(require("./routes/templates"));

app.use((req, res) => res.status(404).json({ error: "not found" }));

function validateEnv() {
  const problems = [];
  if (!process.env.DATABASE_URL)
    problems.push("DATABASE_URL is not set — Prisma cannot connect");
  if (!process.env.APP_SECRET && !process.env.SESSION_SECRET)
    problems.push(
      "APP_SECRET/SESSION_SECRET not set — encryption + sessions use an insecure dev key",
    );
  if (!config.cronToken)
    console.warn(
      "[env] CRON_TOKEN not set — /cron/tick and the meeting webhook are unguarded",
    );
  if (problems.length) {
    console.warn(
      "[env] configuration warnings:\n  - " + problems.join("\n  - "),
    );
    if (!process.env.DATABASE_URL) {
      console.error("Refusing to start without DATABASE_URL.");
      process.exit(1);
    }
  }
}

async function main() {
  validateEnv();
  await applyPendingMigrations(prisma);
  await auth.ensureAdmin();
  app.listen(config.port, () => {
    console.log(`\n  Outreach API on http://localhost:${config.port}`);
    console.log(
      `  Cron tick: /cron/tick?token=${config.cronToken ? "***" : "(set CRON_TOKEN)"}`,
    );
    require("./jobs/scheduler").start();
  });
}

main().catch((e) => {
  console.error("Failed to start:", e.message);
  process.exit(1);
});

module.exports = app;
