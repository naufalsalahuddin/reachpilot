"use strict";
/**
 * Instantly.ai — push a lead into a campaign. Instantly then sends + follows up +
 * tracks on its own warmed infrastructure (the recommended, deliverability-safe path).
 *
 * config: { api_key, campaign_id, base_url? }
 * The drafted copy is passed as custom variables so an Instantly step can use
 * {{email_subject}} / {{email_body}}. Field names may need tweaking to match your
 * Instantly account — they're isolated here on purpose.
 */
async function push(cfg, msg) {
  if (!cfg.api_key || !cfg.campaign_id) throw new Error("Instantly needs api_key and campaign_id");
  const base = (cfg.base_url || "https://api.instantly.ai/api/v2").replace(/\/+$/, "");
  const r = await fetch(`${base}/leads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      campaign: cfg.campaign_id,
      email: msg.to,
      first_name: msg.firstName || "",
      company_name: msg.company || "",
      custom_variables: { email_subject: msg.subject, email_body: msg.text },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Instantly: " + (d.message || JSON.stringify(d).slice(0, 200)));
  return { messageId: d.id || d.lead_id || "instantly-pushed" };
}

async function verify(cfg) {
  if (!cfg.api_key) throw new Error("missing api_key");
  const base = (cfg.base_url || "https://api.instantly.ai/api/v2").replace(/\/+$/, "");
  const r = await fetch(`${base}/campaigns?limit=1`, { headers: { Authorization: `Bearer ${cfg.api_key}` } });
  if (!r.ok) throw new Error("Instantly auth failed (" + r.status + ")");
  return true;
}

module.exports = { push, verify };
