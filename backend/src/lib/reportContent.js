"use strict";
/**
 * Turn raw audit checks into a client-friendly, template-based report:
 *   - whatsGood : short positive bullets (from PASS checks)
 *   - whatsBad  : { title, detail } bullets (from FAIL then UNKNOWN checks)
 *   - pagespeedBullets : plain sentences summarising mobile/desktop performance
 * Reused by the report API, the PDF generator, and the AI-polish endpoint.
 */

// Friendlier phrasing for PASS checks; falls back to the check label.
const GOOD_COPY = {
  cert: "Secure HTTPS certificate is valid and current.",
  speed: "The homepage loads quickly.",
  viewport: "The site is built to display properly on phones.",
  tel: "The phone number is tap-to-call on mobile.",
  form: "Visitors can send an enquiry from the homepage.",
  booking: "Online booking / appointment requests are available.",
  copyright: "The footer year is up to date.",
  title: "The homepage has a proper search-result title.",
  meta_desc: "A meta description is set for search results.",
  links: "Internal links check out — no broken pages found.",
  platform: "Built on a recognised, maintainable platform.",
};

function goodBullet(c) {
  return GOOD_COPY[c.key] || c.label;
}

function badBullet(c) {
  return { key: c.key, state: c.state, title: c.label, detail: c.detail || c.evidence || "" };
}

function pagespeedBullets(ps) {
  if (!ps) return [];
  const out = [];
  for (const [k, label] of [["mobile", "Mobile"], ["desktop", "Desktop"]]) {
    const r = ps[k];
    if (!r) continue;
    if (r.score == null) { if (r.error) out.push(`${label}: performance could not be measured (${r.error}).`); continue; }
    const verdict = r.score >= 90 ? "good" : r.score >= 50 ? "needs improvement" : "poor";
    const worst = Object.entries(r.metrics || {}).filter(([, v]) => v).slice(0, 3).map(([m, v]) => `${m} ${v}`).join(", ");
    out.push(`${label} performance is ${verdict} (${r.score}/100)${worst ? ` — ${worst}` : ""}.`);
  }
  return out;
}

function buildReport(checks, pagespeed) {
  const list = Array.isArray(checks) ? checks : [];
  const good = list.filter((c) => c.state === "PASS").map(goodBullet);
  const fails = list.filter((c) => c.state === "FAIL").sort((a, b) => a.tier - b.tier).map(badBullet);
  const unknown = list.filter((c) => c.state === "UNKNOWN").map(badBullet);
  return {
    whatsGood: good,
    whatsBad: [...fails, ...unknown],
    pagespeedBullets: pagespeedBullets(pagespeed),
    counts: { good: good.length, bad: fails.length, unknown: unknown.length },
  };
}

module.exports = { buildReport, pagespeedBullets };
