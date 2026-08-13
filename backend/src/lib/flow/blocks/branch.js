"use strict";
/** Flow block: if/else branch. Never dispatched as a job and never a lead's resting
 * place — resolved synchronously (DB lookups only, no queue hop) during edge
 * traversal in jobs/flowEngine.js. `evaluate` returns the matching edge's `when`. */
const data = require("../../data");
const suppress = require("../../suppress");

async function evaluate(lead, node) {
  const cond = (node.config && node.config.condition) || "";
  const threshold = node.config && node.config.threshold;

  switch (cond) {
    case "has_email": return lead.email ? "true" : "false";
    case "no_email": return !lead.email ? "true" : "false";
    case "hook_found": return lead.status === "audited" ? "true" : "false";
    case "no_hook": return lead.status === "audited" ? "false" : "true";
    case "is_suppressed": return (await suppress.isSuppressed(lead.email)) ? "true" : "false";
    case "pagespeed_mobile_below": {
      const audit = await data.latestAudit(lead.id);
      let meta = {};
      try { meta = JSON.parse(audit?.meta_json || "{}"); } catch { meta = {}; }
      const score = meta?.pagespeed?.mobile?.score;
      return score != null && score < (threshold ?? 50) ? "true" : "false";
    }
    case "lint_score_below":
      return lead.lint_score != null && lead.lint_score < (threshold ?? 45) ? "true" : "false";
    default:
      return "false";
  }
}

module.exports = { type: "branch", evaluate };
