"use strict";
/**
 * Pre-send spam/quality lint for an email. Higher score = spammier.
 * Pure function — reused in Review (warn) and at send time (optional hard block).
 */
const SPAM_WORDS = [
  "free", "100% free", "risk-free", "guarantee", "guaranteed", "act now", "limited time",
  "click here", "buy now", "order now", "cash", "cheap", "discount", "earn money", "extra income",
  "make money", "no cost", "no obligation", "special promotion", "urgent", "winner", "congratulations",
  "amazing", "incredible", "once in a lifetime", "why pay more", "double your", "best price",
];

function lintEmail({ subject = "", body = "" } = {}) {
  const flags = [];
  let score = 0;
  const text = `${subject} ${body}`;
  const low = text.toLowerCase();

  const hits = [...new Set(SPAM_WORDS.filter((w) => low.includes(w)))];
  if (hits.length) { score += hits.length * 7; flags.push(`Spam-trigger words: ${hits.slice(0, 6).join(", ")}`); }

  const caps = (text.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !["HTTPS", "HTML", "HTTP"].includes(w));
  if (caps.length >= 2) { score += 10; flags.push(`${caps.length} ALL-CAPS words`); }

  if (/[!?]{2,}/.test(text)) { score += 8; flags.push("Repeated !!/?? punctuation"); }
  const bangs = (body.match(/!/g) || []).length;
  if (bangs >= 3) { score += 6; flags.push(`${bangs} exclamation marks`); }

  const links = (body.match(/https?:\/\//g) || []).length;
  if (links >= 3) { score += 12; flags.push(`${links} links — cold emails should have 0–1`); }

  if (/\$\$|€€|£££|100%\s*free|risk[-\s]?free/i.test(text)) { score += 10; flags.push('Money / "free" spam signals'); }

  if (subject.length > 60) { score += 6; flags.push("Subject is long (>60 chars)"); }
  if (/^\s*(re|fwd)\s*:/i.test(subject)) { score += 14; flags.push("Fake Re:/Fwd: subject"); }
  if (!subject.trim()) { score += 12; flags.push("Empty subject"); }

  const words = body.split(/\s+/).filter(Boolean).length;
  if (!body.trim()) { score += 40; flags.push("Empty body"); }
  else if (words < 20) { score += 6; flags.push("Very short body"); }
  else if (words > 220) { score += 6; flags.push("Long body for a cold email"); }

  score = Math.min(100, score);
  const level = score >= 45 ? "high" : score >= 20 ? "medium" : "low";
  return { score, level, flags };
}

module.exports = { lintEmail, SPAM_WORDS };
