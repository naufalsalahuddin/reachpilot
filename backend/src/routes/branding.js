"use strict";
/** Public branding config (name, colors, logo) — multi-tenant-ready via settings. */
const express = require("express");
const data = require("../lib/data");

const router = express.Router();

const DEFAULTS = { name: "Outreach", primary: "#1c97e6", secondary: "#0b6fb8", logo: "/logo.svg" };

router.get("/api/branding", async (req, res) => {
  try {
    const name = (await data.getSetting("brand_name")) || DEFAULTS.name;
    const primary = (await data.getSetting("brand_primary")) || DEFAULTS.primary;
    const secondary = (await data.getSetting("brand_secondary")) || DEFAULTS.secondary;
    const logo = (await data.getSetting("brand_logo")) || DEFAULTS.logo;
    res.json({ name, primary, secondary, logo });
  } catch { res.json(DEFAULTS); }
});

module.exports = router;
