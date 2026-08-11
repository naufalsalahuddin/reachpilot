"use strict";
const express = require("express");
const dns = require("dns").promises;

const router = express.Router();

async function txtFind(name, re) {
  try {
    const txt = await dns.resolveTxt(name);
    const flat = txt.map((a) => a.join(""));
    const hit = flat.find((t) => re.test(t));
    return hit ? { found: true, value: hit } : { found: false };
  } catch (e) { return { found: false, error: e.code }; }
}

// GET /api/dns?domain=example.com&selector=google
router.get("/api/dns", async (req, res) => {
  const domain = String(req.query.domain || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!domain) return res.status(400).json({ error: "domain required" });

  const out = { domain };
  out.spf = await txtFind(domain, /^v=spf1/i);
  out.dmarc = await txtFind("_dmarc." + domain, /^v=DMARC1/i);
  try {
    const mx = await dns.resolveMx(domain);
    out.mx = { found: mx.length > 0, records: mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange).slice(0, 5) };
  } catch (e) { out.mx = { found: false, error: e.code }; }

  const selector = String(req.query.selector || "").trim();
  if (selector) {
    out.dkim = { ...(await txtFind(`${selector}._domainkey.${domain}`, /v=DKIM1|p=/i)), selector };
  }
  res.json(out);
});

module.exports = router;
