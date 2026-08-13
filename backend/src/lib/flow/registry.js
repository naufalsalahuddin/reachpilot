"use strict";
/** Fixed block palette for the flow engine — type -> adapter module. */
const config = require("../../config");

const BLOCKS = {
  lead_source: require("./blocks/leadSource"),
  website_audit: require("./blocks/websiteAudit"),
  pagespeed: require("./blocks/pagespeed"),
  email_finder: require("./blocks/emailFinder"),
  ai_draft: require("./blocks/aiDraft"),
  pdf_report: require("./blocks/pdfReport"),
  review_gate: require("./blocks/reviewGate"),
  send: require("./blocks/send"),
  branch: require("./blocks/branch"),
};

const LABELS = {
  lead_source: "Lead source",
  website_audit: "Website audit",
  pagespeed: "PageSpeed check",
  email_finder: "Email finder",
  ai_draft: "AI draft",
  pdf_report: "PDF report (cache warm)",
  review_gate: "Human review",
  send: "Send email",
  branch: "If / else",
};

// Reuse the closest matching legacy batch-size env var; blocks with no legacy
// equivalent default to a small hardcoded batch. Overridable per-node via
// node.config.batch_size.
const DEFAULT_BATCH = {
  website_audit: config.batch.audit,
  ai_draft: config.batch.draft,
  email_finder: config.batch.enrich,
  send: config.batch.send,
  pagespeed: 5,
  pdf_report: 5,
  lead_source: 5,
  review_gate: 5,
};

function defaultBatchSize(type) {
  return DEFAULT_BATCH[type] || 5;
}

// Only these block types may be a graph's entry point — the single "initiator"
// rule. lead_source covers both provider search and CSV import (a mode on the
// same block), so it's the only one for now.
const INITIATOR_TYPES = new Set(["lead_source"]);
function isInitiator(type) {
  return INITIATOR_TYPES.has(type);
}

function palette() {
  return Object.keys(BLOCKS).map((type) => ({
    type,
    label: LABELS[type] || type,
    runnable: typeof BLOCKS[type].run === "function",
    branch: type === "branch",
    initiator: isInitiator(type),
  }));
}

module.exports = { BLOCKS, LABELS, defaultBatchSize, palette, isInitiator, INITIATOR_TYPES };
