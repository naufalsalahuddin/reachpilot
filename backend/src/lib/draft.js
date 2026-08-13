"use strict";
/**
 * Email drafting, tightly constrained. Port of draft.py.
 *
 * The model receives exactly one verified finding plus the business name, and
 * its only job is to phrase that finding in one short email. After drafting, a
 * validator checks the text back against the finding data and flags anything
 * that looks invented. The validator is a safety net — the human approval step
 * in the review screen is what actually prevents a bad send.
 */
const { chat } = require("./ai/providers");

const SYSTEM = `You write one short cold email for a web design agency.

HARD RULES — breaking any of these makes the output unusable:
- You may only reference the ONE finding given to you. No other problems.
- You may not invent numbers, statistics, percentages, competitor names, or claims
  about the business's revenue, traffic, or customers.
- You may not state what the finding is "costing" them in figures. You may say you
  don't know how many people it affects — that is honest and it works better.
- Do not exaggerate. If the finding is small, the email is low-key.
- No links, no attachments, no calendar link, no signature block, no logo.
- Plain text that reads like one person typed it to another.

Return EXACTLY this format and nothing else:

SUBJECT: <2-4 words, lowercase, specific, boring>
PREVIEW: <8-14 words, the inbox preview text shown right after the subject — a second hook that makes someone open it, not a repeat of the subject>
BODY:
<the email, 50-90 words>`;

/** Replace {token} with a value ONLY for tokens actually present in `vars` —
 * unknown tokens (including the send-time {first_name}/{name}/etc ones) are
 * left untouched, same convention as renderVars() in jobs/handlers.js. */
function substituteVars(text, vars = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  ));
}

/** Variables available to pitch rules from the audit/pagespeed blocks that ran
 * before this draft — the "insert variable" menu in the UI mirrors this list. */
function draftVars(hook, pagespeed) {
  const v = { hook_label: hook.label || "", hook_detail: hook.detail || "", hook_evidence: hook.evidence || "" };
  if (pagespeed?.mobile?.score != null) v.pagespeed_mobile_score = pagespeed.mobile.score;
  if (pagespeed?.desktop?.score != null) v.pagespeed_desktop_score = pagespeed.desktop.score;
  return v;
}

/** A short, deterministic preview line for the template fallback path (no AI call). */
function derivePreview(hook) {
  const detail = (hook.detail || hook.label || "").trim();
  if (!detail) return "";
  const lower = detail[0].toLowerCase() + detail.slice(1);
  return lower.length > 90 ? lower.slice(0, 87).replace(/\s+\S*$/, "") + "…" : lower;
}

function pagespeedLine(pagespeed) {
  if (!pagespeed) return "";
  const m = pagespeed.mobile, d = pagespeed.desktop;
  const parts = [];
  if (m && m.score != null) parts.push(`mobile ${m.score}/100`);
  if (d && d.score != null) parts.push(`desktop ${d.score}/100`);
  if (!parts.length) return "";
  return `\nVerified performance data (Google Lighthouse — you MAY reference the mobile score only if it is poor, i.e. under 50, and keep it factual):\n  ${parts.join(", ")}\n`;
}

function userPrompt(lead, hook, sender, rules, pagespeed) {
  return `Business: ${lead.name || ""}
Industry: ${lead.industry || ""}
City: ${lead.city || ""}
Contact first name: ${lead.first_name || "there"}
Sender name: ${sender}

THE ONE VERIFIED FINDING:
  What: ${hook.label}
  Plain description: ${hook.detail}
  Raw evidence: ${hook.evidence}
${pagespeedLine(pagespeed)}
House rules for this pitch:
${rules && rules.trim() ? rules.trim() : "(none set)"}

Write the email.`;
}

// ------------------------------------------------------------- templates
const FALLBACK = {
  no_https: ["your site security",
    "Hi {fn},\n\nOpened {name} on my phone this morning and the browser flagged it as “not secure” before the page loaded — the site is still running on plain HTTP.\n\nNo idea how many people back out when they see that warning, but some will.\n\nIt's a quick fix. Want me to send a 90-second video showing what visitors see?\n\n{sender}"],
  form_missing: ["your contact form",
    "Hi {fn},\n\nWent looking for a way to send {name} an enquiry from the homepage and couldn't find one — the only route is the phone, during opening hours.\n\nAnyone browsing at 9pm has to remember to call you tomorrow. Most won't.\n\nWant me to send a 90-second video showing what I'd change?\n\n{sender}"],
  no_viewport: ["{name} on mobile",
    "Hi {fn},\n\nPulled up {name} on my phone and got the full desktop layout shrunk down — had to pinch and zoom to read anything.\n\nMost people looking for you are on a phone, and that's a lot of friction before they've even found your number.\n\nWant me to send a 90-second video of what it looks like?\n\n{sender}"],
  tel_not_clickable: ["your phone number",
    "Hi {fn},\n\nTried tapping the phone number on {name} from my phone and nothing happened — it's plain text rather than a tap-to-call link.\n\nSmall thing, but it means memorising the number and switching apps, and some people just don't.\n\nWant me to send a 90-second video showing the fix?\n\n{sender}"],
  stale_copyright: ["{name} footer",
    "Hi {fn},\n\nSmall thing on {name} — the footer still says {year}. To someone comparing a few options it reads as “maybe closed”, which isn't the impression you want.\n\nThere are a couple of other things I noticed while I was there.\n\nWant me to send a 90-second video?\n\n{sender}"],
};
const GENERIC = ["quick thing — {name}",
  "Hi {fn},\n\nWas looking at {name} this morning and noticed one thing: {detail_lc}\n\nNot sure how much traffic it affects, but it's fixable.\n\nWant me to send a 90-second video showing exactly what's happening?\n\n{sender}"];

function fill(tmpl, fields) {
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => (fields[k] !== undefined ? fields[k] : `{${k}}`));
}

function draftFromTemplate(lead, hook, sender) {
  const [subj, body] = FALLBACK[hook.key] || GENERIC;
  const yearMatch = /(20\d{2})/.exec(hook.evidence || "");
  const detail = hook.detail || "";
  const fields = {
    fn: lead.first_name || "there",
    name: lead.name || "your site",
    sender,
    year: yearMatch ? yearMatch[1] : "an old year",
    detail_lc: detail ? detail[0].toLowerCase() + detail.slice(1) : "",
  };
  return [fill(subj, fields), fill(body, fields), derivePreview(hook)];
}

async function draftWithLLM(lead, hook, sender, { provider, model, rules, pagespeed }) {
  const text = await chat({
    provider, model, system: SYSTEM, prompt: userPrompt(lead, hook, sender, rules, pagespeed),
    maxTokens: 600, temperature: 0.7,
  });
  const m = /SUBJECT:\s*(.+?)\s*\nPREVIEW:\s*(.+?)\s*\nBODY:\s*\n([\s\S]+)/.exec(text);
  if (!m) throw new Error(`Unexpected model output: ${text.slice(0, 200)}`);
  return [m[1].trim(), m[2].trim(), m[3].trim()];
}

// -------------------------------------------------------------- validator
const INVENTED_CLAIM_WORDS = [
  "revenue", "% of", "percent", "customers a month", "leads a month",
  "conversion rate", "bounce rate", "google ranks", "ranking above",
  "competitors", "we guarantee", "guaranteed",
];

function validate(body, subject, hook, lead) {
  const flags = [];
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > 110) flags.push(`Too long: ${words} words (target 50-90).`);
  if (words < 35) flags.push(`Very short: ${words} words.`);

  const haystack = [
    hook.evidence || "", hook.detail || "", hook.label || "",
    lead.name || "", lead.phone || "", String(lead.review_count || ""),
  ].join(" ");
  const known = new Set(haystack.match(/\d+/g) || []);
  const allowed = new Set(["90", "1", "2", "3"]);
  let scrubbed = body.replace(/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi, " ");
  scrubbed = scrubbed.replace(/\b\d+(st|nd|rd|th)\b/gi, " ");
  for (const n of new Set(scrubbed.match(/\d+/g) || [])) {
    if (!known.has(n) && !allowed.has(n)) flags.push(`Unverified number in email: '${n}'`);
  }

  const low = body.toLowerCase();
  for (const phrase of INVENTED_CLAIM_WORDS) {
    if (low.includes(phrase)) flags.push(`Possible invented claim: '${phrase}'`);
  }

  if (body.includes("http://") || body.includes("https://")) {
    flags.push("Contains a link. First emails should have none.");
  }
  if (!lead.first_name) flags.push("No first name known — greeting is generic.");
  if (subject.split(/\s+/).filter(Boolean).length > 5) {
    flags.push(`Subject is ${subject.split(/\s+/).filter(Boolean).length} words (target 2-4).`);
  }
  return flags;
}

/**
 * @returns {Promise<{subject, body, preview, flags, source}>}
 */
async function makeDraft(lead, hook, sender, { provider = "template", model = null, rules = "", pagespeed = null } = {}) {
  let subject, body, preview, source = "template";
  const useLlm = provider && provider !== "template";
  const resolvedRules = substituteVars(rules, draftVars(hook, pagespeed));

  if (useLlm) {
    try {
      [subject, preview, body] = await draftWithLLM(lead, hook, sender, { provider, model, rules: resolvedRules, pagespeed });
      source = provider;
    } catch (exc) {
      [subject, body, preview] = draftFromTemplate(lead, hook, sender);
      source = `template (${provider} failed: ${exc.message ? exc.message.slice(0, 60) : "error"})`;
    }
  } else {
    [subject, body, preview] = draftFromTemplate(lead, hook, sender);
  }

  return { subject, body, preview, flags: validate(body, subject, hook, lead), source };
}

module.exports = { makeDraft, validate, draftFromTemplate, substituteVars, draftVars, SYSTEM };
