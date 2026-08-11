"use strict";
/**
 * Turn a plain-text email into tracked HTML: a 1x1 open pixel and/or click-wrapped
 * links pointing at this app's public tracking endpoints.
 *
 * Cold-email note: opens/clicks are spam signals and Apple Mail pre-loads pixels,
 * so this is OFF per campaign by default. Replies are the signal that matters.
 */
const crypto = require("crypto");
const config = require("../config");

function newTrackingId() {
  return crypto.randomBytes(16).toString("hex");
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * @returns {string|null} tracked HTML, or null if nothing to track (send text-only).
 */
function buildTrackedHtml(text, { trackingId, trackOpens, trackClicks }) {
  if (!trackOpens && !trackClicks) return null;
  const base = config.publicBaseUrl;

  // escape, linkify (and optionally wrap), newlines -> <br>
  let html = esc(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const clean = url.replace(/&amp;/g, "&");
    const href = trackClicks
      ? `${base}/t/c/${trackingId}?u=${encodeURIComponent(clean)}`
      : clean;
    return `<a href="${href}">${url}</a>`;
  }).replace(/\n/g, "<br>\n");

  html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#111">${html}</div>`;
  if (trackOpens) {
    html += `<img src="${base}/t/o/${trackingId}.gif" width="1" height="1" alt="" style="display:block;border:0" />`;
  }
  return html;
}

module.exports = { newTrackingId, buildTrackedHtml };
