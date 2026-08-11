"use strict";
/**
 * Smartlead — add a lead to a campaign. Smartlead handles sending/follow-ups/tracking.
 * config: { api_key, campaign_id, base_url? }
 */
async function push(cfg, msg) {
  if (!cfg.api_key || !cfg.campaign_id) throw new Error("Smartlead needs api_key and campaign_id");
  const base = (cfg.base_url || "https://server.smartlead.ai/api/v1").replace(/\/+$/, "");
  const url = `${base}/campaigns/${encodeURIComponent(cfg.campaign_id)}/leads?api_key=${encodeURIComponent(cfg.api_key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_list: [{
        email: msg.to,
        first_name: msg.firstName || "",
        company_name: msg.company || "",
        custom_fields: { email_subject: msg.subject, email_body: msg.text },
      }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Smartlead: " + (d.message || JSON.stringify(d).slice(0, 200)));
  return { messageId: (d.data && d.data.lead_id) || "smartlead-pushed" };
}

async function verify(cfg) {
  if (!cfg.api_key || !cfg.campaign_id) throw new Error("missing api_key/campaign_id");
  const base = (cfg.base_url || "https://server.smartlead.ai/api/v1").replace(/\/+$/, "");
  const r = await fetch(`${base}/campaigns/${encodeURIComponent(cfg.campaign_id)}?api_key=${encodeURIComponent(cfg.api_key)}`);
  if (!r.ok) throw new Error("Smartlead auth failed (" + r.status + ")");
  return true;
}

module.exports = { push, verify };
