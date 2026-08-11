"use strict";
/**
 * Homepage screenshot URL for a site. Uses WordPress mShots by default (free,
 * no key, cached server-side). Override with SCREENSHOT_URL_TEMPLATE in .env,
 * using {url} as the placeholder (e.g. an ApiFlash/Screenshotone endpoint).
 */
const TEMPLATE = process.env.SCREENSHOT_URL_TEMPLATE
  || "https://s.wordpress.com/mshots/v1/{url}?w=1200";

function screenshotUrl(siteUrl, width) {
  if (!siteUrl) return null;
  let u = String(siteUrl).trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return TEMPLATE.replace("{url}", encodeURIComponent(u));
}

module.exports = { screenshotUrl };
