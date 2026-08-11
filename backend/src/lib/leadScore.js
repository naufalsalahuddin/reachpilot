"use strict";
/**
 * Lead priority score 0–100 from the audit findings, so reviewers work the best
 * (most pitchable) leads first. Weighted by the primary hook + supporting fails.
 */
const HOOK_WEIGHTS = {
  site_down: 100, no_https: 95, cert_expired: 94, cert_expiring: 70,
  form_missing: 88, very_slow: 86, no_viewport: 84, slow: 78,
  tel_not_clickable: 76, no_booking: 74, stale_copyright: 72,
  broken_links: 68, mixed_content: 60,
};

function scoreLead(checks, hookKey, pagespeed) {
  if (!Array.isArray(checks)) return null;
  const fails = checks.filter((c) => c.state === "FAIL");
  const t1 = fails.filter((c) => c.tier === 1).length;
  const t2 = fails.filter((c) => c.tier === 2).length;

  let score = hookKey && HOOK_WEIGHTS[hookKey] ? HOOK_WEIGHTS[hookKey] : Math.min(65, t1 * 22);
  score += t1 * 3 + t2 * 1.5;

  // a poor mobile PageSpeed is a strong, concrete pitch angle
  const mobile = pagespeed && pagespeed.mobile && pagespeed.mobile.score;
  if (mobile != null && mobile < 50) score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { scoreLead, HOOK_WEIGHTS };
