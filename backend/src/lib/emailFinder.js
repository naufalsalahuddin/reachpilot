"use strict";
/**
 * Find the best contact email for a lead.
 *
 * Strategy, best-effort and free-first:
 *   1. Scrape the site's contact/about/team pages for real addresses + a person name.
 *   2. If a HUNTER_API_KEY is set, ask Hunter for the domain's emails.
 *   3. Generate name-based permutations (first.last@domain, flast@domain, …) as guesses.
 *   4. Optionally SMTP-verify candidates (off by default — port 25 is often blocked).
 *
 * Ranking: verified personal > hunter personal (high confidence) > scraped personal
 *          > role address > guessed. Never returns noreply/postmaster/etc.
 */
const dns = require("dns").promises;
const net = require("net");
const cheerio = require("cheerio");
const config = require("../config");
const { UA } = require("./audit");

const ROLE = new Set([
  "info", "contact", "hello", "admin", "office", "sales", "support", "enquiries",
  "enquiry", "inquiries", "inquiry", "bookings", "booking", "reception", "team",
  "mail", "marketing", "accounts", "billing", "hr", "jobs", "careers", "help",
  "service", "services", "frontdesk",
]);
const NEVER = ["noreply", "no-reply", "postmaster", "abuse", "privacy", "webmaster", "mailer-daemon", "donotreply"];
const CONTACT_PATHS = ["", "contact", "contact-us", "about", "about-us", "team", "our-team", "staff", "meet-the-team"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function classify(addr) {
  const local = addr.split("@")[0].toLowerCase();
  if (ROLE.has(local)) return "role";
  if (/^[a-z]+([._-][a-z]+)?$/.test(local)) return "personal";
  return "generic";
}
function isNever(addr) { return NEVER.some((p) => addr.toLowerCase().startsWith(p)); }
function firstNameFromEmail(addr) {
  const first = addr.split("@")[0].split(/[._-]/)[0];
  return first && first.length > 1 ? first[0].toUpperCase() + first.slice(1) : null;
}

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(t); }
}

const NAME_RE = /(?:Dr\.?\s+)?([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,20})(?=,?\s+(?:DDS|DMD|MD|owner|founder|principal|proprietor|director|dentist|realtor|attorney|esq))/g;

function extractNames(text) {
  const names = [];
  let m;
  while ((m = NAME_RE.exec(text)) && names.length < 5) names.push({ first: m[1], last: m[2] });
  return names;
}

/** Scrape a handful of pages for emails + candidate person names. */
async function scrapeSite(website) {
  const emails = new Set();
  const names = [];
  let base;
  try { base = new URL(website.startsWith("http") ? website : "https://" + website); } catch { return { emails: [], names: [] }; }

  for (const p of CONTACT_PATHS) {
    const url = new URL(p, base).toString();
    const html = await fetchText(url);
    if (!html) continue;
    for (const e of html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) {
      const low = e.toLowerCase();
      if (!/\.(png|jpe?g|gif|webp|svg)$/.test(low)) emails.add(low);
    }
    const $ = cheerio.load(html);
    extractNames($("body").text().replace(/\s+/g, " ")).forEach((n) => names.push(n));
    await sleep(300);
    if (emails.size >= 8) break;
  }
  return { emails: [...emails], names };
}

async function hunterFind(domain) {
  if (!domain) return [];
  const keystore = require("./keystore");
  const k = await keystore.getKey("hunter");
  if (!k || !k.key) return [];
  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${k.key}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.data && data.data.emails || []).map((e) => ({
      email: e.value, confidence: e.confidence || 0,
      first_name: e.first_name, last_name: e.last_name, position: e.position,
    }));
  } catch { return []; }
}

function permutations(first, last, domain) {
  if (!domain) return [];
  const f = (first || "").toLowerCase().replace(/[^a-z]/g, "");
  const l = (last || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!f) return [];
  const locals = new Set([f]);
  if (l) {
    locals.add(`${f}.${l}`); locals.add(`${f}${l}`); locals.add(`${f[0]}${l}`);
    locals.add(`${f}${l[0]}`); locals.add(`${f}_${l}`); locals.add(`${f}-${l}`); locals.add(l);
  }
  return [...locals].map((lp) => `${lp}@${domain}`);
}

/** SMTP RCPT check. Returns true/false/null(unknown). Best-effort, slow, often blocked. */
async function smtpVerify(email) {
  const domain = email.split("@")[1];
  let mx;
  try {
    const recs = await dns.resolveMx(domain);
    if (!recs.length) return false;
    mx = recs.sort((a, b) => a.priority - b.priority)[0].exchange;
  } catch { return null; }

  return new Promise((resolve) => {
    const socket = net.connect(25, mx);
    let stage = 0, result = null;
    const from = config.emailFinder.verifyFrom;
    const done = (v) => { try { socket.write("QUIT\r\n"); socket.end(); } catch {} resolve(v); };
    socket.setTimeout(8000);
    socket.on("timeout", () => { socket.destroy(); resolve(result); });
    socket.on("error", () => resolve(null));
    socket.on("data", (buf) => {
      const line = buf.toString();
      const code = parseInt(line.slice(0, 3), 10);
      if (stage === 0 && code === 220) { socket.write(`HELO ${from.split("@")[1]}\r\n`); stage = 1; }
      else if (stage === 1 && code === 250) { socket.write(`MAIL FROM:<${from}>\r\n`); stage = 2; }
      else if (stage === 2 && code === 250) { socket.write(`RCPT TO:<${email}>\r\n`); stage = 3; }
      else if (stage === 3) { done(code >= 200 && code < 300); }
      else if (code >= 500) { done(false); }
    });
  });
}

/**
 * @returns {Promise<{email,type,status,first_name,candidates}|null>}
 */
async function findBest(lead, { verify = config.emailFinder.smtpVerify } = {}) {
  const domain = lead.domain || (lead.website ? (() => { try { return new URL(lead.website).hostname.replace(/^www\./, ""); } catch { return null; } })() : null);
  const candidates = []; // {email, type, status, first_name, score}

  const push = (email, status, first_name) => {
    if (!email || isNever(email)) return;
    const type = classify(email);
    const base = { personal: 30, role: 12, generic: 6 }[type];
    const bonus = { verified: 40, hunter: 20, found: 15, guessed: 0 }[status] || 0;
    candidates.push({ email: email.toLowerCase(), type, status, first_name: first_name || (type === "personal" ? firstNameFromEmail(email) : null), score: base + bonus });
  };

  // 1. scrape
  const scraped = lead.website ? await scrapeSite(lead.website) : { emails: [], names: [] };
  scraped.emails.forEach((e) => push(e, "found"));
  const name0 = scraped.names[0] || (lead.first_name ? { first: lead.first_name, last: "" } : null);

  // 2. hunter
  const hunter = await hunterFind(domain);
  hunter.forEach((h) => push(h.email, h.confidence >= 80 ? "verified" : "hunter", h.first_name));
  const hunterName = hunter.find((h) => h.first_name);

  // 3. permutations (only if we have a name + domain and no personal address yet)
  const havePersonal = candidates.some((c) => c.type === "personal");
  const nm = name0 || (hunterName ? { first: hunterName.first_name, last: hunterName.last_name } : null);
  if (!havePersonal && nm && domain) permutations(nm.first, nm.last, domain).forEach((e) => push(e, "guessed", nm.first));

  if (!candidates.length) return null;

  // 4. optional verification of the top personal guesses
  if (verify) {
    for (const c of candidates.filter((x) => x.status === "guessed").slice(0, 3)) {
      const ok = await smtpVerify(c.email);
      if (ok === true) { c.status = "verified"; c.score += 40; }
      else if (ok === false) c.score -= 100; // likely doesn't exist
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { email: best.email, type: best.type, status: best.status, first_name: best.first_name, candidates: candidates.slice(0, 6) };
}

module.exports = { findBest, classify, permutations, smtpVerify, scrapeSite, hunterFind };
