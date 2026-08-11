"use strict";
/**
 * Fire-and-forget outbound webhook for key events (reply, meeting, bounce).
 * Point it at Zapier/Make/n8n or a CRM endpoint. Configured in Settings.
 */
const data = require("./data");

async function fireWebhook(event, payload) {
  let url;
  try { url = await data.getSetting("outbound_webhook_url"); } catch { url = null; }
  if (!url || !/^https?:\/\//i.test(url)) return { sent: false };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "outreach-webhook/1" },
      body: JSON.stringify({ event, data: payload, at: new Date().toISOString() }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return { sent: true };
  } catch (e) { return { sent: false, error: e.message }; }
}

module.exports = { fireWebhook };
