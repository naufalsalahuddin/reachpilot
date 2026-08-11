"use strict";
require("dotenv").config();

function int(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

module.exports = {
  port: int(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET || "dev-insecure-secret",
  cronToken: process.env.CRON_TOKEN || "",

  admin: {
    email: process.env.ADMIN_EMAIL || "",
    password: process.env.ADMIN_PASSWORD || "",
  },

  db: {
    host: process.env.DB_HOST || "localhost",
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "outreach",
  },

  googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || "",
  yelpKey: process.env.YELP_API_KEY || "",
  foursquareKey: process.env.FOURSQUARE_API_KEY || "",

  ai: {
    anthropic: {
      key: process.env.ANTHROPIC_API_KEY || "",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    },
    openai: {
      key: process.env.OPENAI_API_KEY || "",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    groq: {
      key: process.env.GROQ_API_KEY || "",
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      baseURL: "https://api.groq.com/openai/v1",
    },
  },

  batch: {
    audit: int(process.env.AUDIT_BATCH, 5),
    draft: int(process.env.DRAFT_BATCH, 5),
    send: int(process.env.SEND_BATCH, 10),
    enrich: int(process.env.ENRICH_BATCH, 5),
  },

  // Used to encrypt sending-account credentials at rest (AES-256-GCM).
  appSecret: process.env.APP_SECRET || process.env.SESSION_SECRET || "dev-insecure-secret",

  // Public origin the recipient's email client can reach — REQUIRED for tracking.
  // e.g. https://outreach.yourdomain.com  (localhost pixels never load in real inboxes)
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${int(process.env.PORT, 3000)}`).replace(/\/+$/, ""),

  emailFinder: {
    hunterKey: process.env.HUNTER_API_KEY || "",
    smtpVerify: process.env.VERIFY_EMAILS === "true", // port 25 outbound; many hosts block it
    verifyFrom: process.env.VERIFY_FROM || "verify@example.com",
  },
};
