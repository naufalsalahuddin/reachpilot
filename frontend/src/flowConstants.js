// Shared constants between the classic campaign form and the flow builder canvas
// — kept in one place so both surfaces present the same options identically.

// Must match backend/src/lib/audit.js CHECK_GROUPS exactly (key -> label shown to the user).
export const AUDIT_CHECK_GROUPS = [
  ["https", "HTTPS & certificate"],
  ["speed", "Page load speed"],
  ["viewport", "Mobile viewport"],
  ["phone", "Click-to-call phone number"],
  ["form", "Contact form"],
  ["booking", "Online booking"],
  ["copyright", "Copyright year freshness"],
  ["broken_links", "Broken links"],
];

// Pitch-rule tokens ({hook_detail} etc.) — must match backend/src/lib/draft.js
// draftVars() exactly. Split by which upstream block produces them.
export const HOOK_VARIABLES = [
  ["hook_label", "Hook: short label"],
  ["hook_detail", "Hook: plain-language detail"],
  ["hook_evidence", "Hook: raw evidence"],
];
export const PAGESPEED_VARIABLES = [
  ["pagespeed_mobile_score", "PageSpeed: mobile score"],
  ["pagespeed_desktop_score", "PageSpeed: desktop score"],
];

// Email Finder strategies — must match backend/src/lib/emailFinder.js ALL_STRATEGIES.
// Data-driven so adding a 4th/5th strategy later is a one-line addition here.
export const EMAIL_FINDER_STRATEGIES = [
  ["scrape", "Scrape the website", "Checks contact/about/team pages for a real address."],
  ["hunter", "Hunter.io", "Looks up the domain in Hunter's database, if a key is configured."],
  ["permutations", "Generate name permutations", "Guesses first.last@domain-style addresses from a found name."],
];
export const EMAIL_FINDER_VERIFY = ["verify", "SMTP-verify guesses", "Slow — probes the mail server directly. Often blocked by hosts."];

// One-line descriptions for the searchable block picker.
export const BLOCK_DESCRIPTIONS = {
  lead_source: "Find new businesses by industry + city, or import a CSV. The graph's one required starting point.",
  website_audit: "Checks a lead's website for a pitchable finding — HTTPS, speed, forms, booking, and more.",
  pagespeed: "Adds real Google Lighthouse mobile/desktop scores, available to blocks after it.",
  email_finder: "Opportunistically upgrades a lead's email via site-scrape, Hunter.io, or name guessing.",
  ai_draft: "Writes the first-draft email from the audit's finding, with AI or templates.",
  pdf_report: "Pre-builds the audit report content so it's ready before send.",
  review_gate: "Pause for a human to approve or reject the draft before it can send.",
  send: "Delivers the email. Ends the flow by default, but you can wire another step after it.",
  branch: "Route leads down different paths based on a condition.",
};
