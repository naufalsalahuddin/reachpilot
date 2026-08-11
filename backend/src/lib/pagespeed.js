"use strict";
/**
 * Real performance data via Google PageSpeed Insights (Lighthouse). Runs keyless
 * (rate-limited) or with a `google_pagespeed` key. Supports mobile AND desktop.
 */
const keystore = require("./keystore");
const { cleanUrl } = require("./url");

async function runOne(url, strategy) {
  const u = cleanUrl(url);
  if (!u) throw new Error("no url");
  const k = await keystore.getKey("google_pagespeed");
  const keyParam = k && k.key ? `&key=${encodeURIComponent(k.key)}` : "";
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(u)}&strategy=${strategy}&category=performance${keyParam}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  let r;
  try { r = await fetch(api, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.lighthouseResult) {
    throw new Error((data.error && data.error.message) || `PageSpeed HTTP ${r.status}`);
  }
  const lr = data.lighthouseResult;
  const a = lr.audits || {};
  const val = (id) => (a[id] ? a[id].displayValue : null);
  // top opportunities = audits with a measurable time saving, biggest first
  const opportunities = Object.values(a)
    .filter((au) => au && au.details && au.details.type === "opportunity" && (au.details.overallSavingsMs || au.numericValue) && au.score != null && au.score < 0.9)
    .map((au) => ({ title: au.title, saving: au.displayValue || (au.details.overallSavingsMs ? `~${(au.details.overallSavingsMs / 1000).toFixed(1)} s` : ""), description: (au.description || "").replace(/\[.*?\]\(.*?\)/g, "").trim().slice(0, 220) }))
    .sort((x, y) => (parseFloat(y.saving) || 0) - (parseFloat(x.saving) || 0))
    .slice(0, 6);
  return {
    strategy,
    score: lr.categories?.performance?.score != null ? Math.round(lr.categories.performance.score * 100) : null,
    metrics: {
      "Largest Contentful Paint": val("largest-contentful-paint"),
      "First Contentful Paint": val("first-contentful-paint"),
      "Total Blocking Time": val("total-blocking-time"),
      "Cumulative Layout Shift": val("cumulative-layout-shift"),
      "Speed Index": val("speed-index"),
      "Time to Interactive": val("interactive"),
    },
    opportunities,
  };
}

/** Single strategy (mobile by default). */
async function runPagespeed(url, { strategy = "mobile" } = {}) {
  return runOne(url, strategy);
}

/** Both strategies at once. Returns { mobile, desktop } (either may be an error stub). */
async function runBoth(url) {
  const [mobile, desktop] = await Promise.allSettled([runOne(url, "mobile"), runOne(url, "desktop")]);
  const pick = (res, strategy) => (res.status === "fulfilled" ? res.value : { strategy, score: null, metrics: {}, error: res.reason?.message || "failed" });
  return { mobile: pick(mobile, "mobile"), desktop: pick(desktop, "desktop") };
}

module.exports = { runPagespeed, runBoth, runOne };
