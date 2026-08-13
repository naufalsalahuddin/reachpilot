"use strict";
/**
 * HTTP-only website auditor. Port of audit.py.
 *
 * Design rules, in order of importance:
 *   1. Every check has THREE states: PASS, FAIL, UNKNOWN. "Unknown" is not
 *      "failing". If we could not verify something, we say so and never pitch it.
 *   2. Every FAIL carries evidence (URL, status code, snippet, number) a human
 *      can check in the review screen before approving.
 *   3. If bot protection is detected, the whole audit is UNKNOWN. We do not guess
 *      and we do not try to defeat the protection.
 *   4. One polite request per domain. Identifiable user agent. robots.txt respected.
 *
 * No browser. No AI. Just HTTP and HTML parsing.
 */
const tls = require("tls");
const cheerio = require("cheerio");
const robotsParser = require("robots-parser");
const { cleanUrl } = require("./url");

const UA =
  "Mozilla/5.0 (compatible; SiteAuditBot/1.0; +contact via website) site-quality-check";

const PASS = "PASS", FAIL = "FAIL", UNKNOWN = "UNKNOWN";
const TIER_1 = 1, TIER_2 = 2, TIER_3 = 3;

const HOOK_WEIGHTS = {
  site_down: 100, no_https: 95, cert_expired: 94, cert_expiring: 70,
  form_missing: 88, very_slow: 86, no_viewport: 84, slow: 78,
  tel_not_clickable: 76, no_booking: 74, stale_copyright: 72,
  broken_links: 68, mixed_content: 60,
};

// Toggleable groups — a campaign/flow-node can disable any of these when they
// don't apply to the industry being audited (e.g. "no online booking" isn't a
// real gap for a retail store). Every group bundles its PASS and FAIL variants
// together so disabling one turns the whole check off, not just one state.
const CHECK_GROUPS = {
  https: ["no_https", "cert_expired", "cert_expiring", "cert", "no_https_redirect"],
  speed: ["speed", "slow", "very_slow"],
  viewport: ["viewport", "no_viewport"],
  phone: ["tel", "tel_not_clickable"],
  form: ["form", "form_missing", "form_long"],
  booking: ["booking", "no_booking"],
  copyright: ["copyright", "stale_copyright"],
  broken_links: ["links", "broken_links"],
};

const BOT_WALL_MARKERS = [
  "just a moment", "checking your browser", "cf-browser-verification",
  "enable javascript and cookies to continue", "ddos protection by",
  "attention required! | cloudflare", "_incapsula_", "px-captcha",
  "access denied", "request unsuccessful. incapsula",
];

const BOOKING_WORDS = [
  "book online", "book now", "book an appointment", "schedule online",
  "request appointment", "make an appointment", "book a consultation",
  "schedule a visit", "booking", "appointment request",
];
const FORM_ISH = ["contact", "enquir", "inquir", "message", "request", "quote", "appointment"];

// Website platform signatures — a strong pitch signal for a web-design agency.
const PLATFORM_SIGNS = [
  ["WordPress", ["/wp-content/", "/wp-includes/", "wp-json", "wp-emoji"]],
  ["Wix", ["wix.com", "wixstatic.com", "_wixcss", "wixsite"]],
  ["Squarespace", ["squarespace.com", "static1.squarespace", "squarespace-cdn"]],
  ["Shopify", ["cdn.shopify.com", "myshopify", "shopify.com"]],
  ["Webflow", ["assets.website-files.com", "webflow.com", "wf-domain"]],
  ["GoDaddy", ["img1.wsimg.com", "godaddy", "websitebuilder"]],
  ["Weebly", ["weebly.com", "editmysite"]],
  ["Duda", ["dudamobile", "irp.cdn-website.com", "duda.co"]],
  ["Joomla", ["/media/jui/", "com_content", "joomla"]],
  ["Drupal", ["/sites/default/files", "drupal.js", "drupal-settings"]],
  ["HubSpot", ["hs-scripts.com", "hubspotusercontent"]],
  ["Framer", ["framerusercontent", "framer.com"]],
];

function detectPlatform(html, generator) {
  const low = html.toLowerCase();
  const gen = (generator || "").toLowerCase();
  for (const [name, signs] of PLATFORM_SIGNS) {
    if (gen.includes(name.toLowerCase())) return name;
    if (signs.some((s) => low.includes(s))) return name;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkCheck(key, state, label, detail, evidence, tier) {
  return { key, state, label, detail, evidence, tier };
}

function normUrl(website) {
  // strip UTM/query params before auditing so we check the real page, not a tracked URL
  return cleanUrl(website);
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function robotsAllows(base) {
  try {
    const robotsUrl = new URL("/robots.txt", base).toString();
    const r = await fetchWithTimeout(robotsUrl, { headers: { "User-Agent": UA } }, 8000);
    if (!r.ok) return null; // could not read -> treat as allowed
    const txt = await r.text();
    const robots = robotsParser(robotsUrl, txt);
    const allowed = robots.isAllowed(base, UA);
    return allowed === undefined ? true : allowed;
  } catch {
    return null;
  }
}

function certDaysLeft(host, port = 443) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const socket = tls.connect(
      { host, port, servername: host, timeout: 8000, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) return finish(null);
        const exp = new Date(cert.valid_to).getTime();
        if (Number.isNaN(exp)) return finish(null);
        finish(Math.floor((exp - Date.now()) / 86400000));
      }
    );
    socket.on("error", () => finish(null));
    socket.on("timeout", () => { socket.destroy(); finish(null); });
  });
}

function looksBlocked(status, html) {
  const low = html.toLowerCase();
  if ([403, 429, 503].includes(status) && html.length < 40000) {
    if (BOT_WALL_MARKERS.some((m) => low.includes(m))) return true;
    if (status === 403) return true;
  }
  return BOT_WALL_MARKERS.some((m) => low.includes(m));
}

/**
 * Run the full audit. Returns { reachable, blocked, checks, hook, fail_count, meta }.
 */
async function auditSite(website, { timeout = 20000, checkLinks = 8, skipGroups = [] } = {}) {
  const skipGroupSet = new Set(skipGroups);
  const skipKeys = new Set();
  for (const g of skipGroupSet) for (const k of CHECK_GROUPS[g] || []) skipKeys.add(k);

  const url = normUrl(website);
  const checks = [];
  const meta = { input: website, resolved_url: url };

  if (!url) {
    checks.push(mkCheck("no_website", FAIL, "No website",
      "This business has no website on record.",
      `input value: ${JSON.stringify(website)}`, TIER_1));
    return finalise(checks, meta, false, false, skipKeys);
  }

  const host = new URL(url).host;
  const allowed = await robotsAllows(url);
  meta.robots_allows = allowed;
  if (allowed === false) {
    checks.push(mkCheck("robots_disallow", UNKNOWN, "robots.txt blocks us",
      "The site's robots.txt disallows automated fetching, so nothing was checked.",
      "robots.txt: Disallow", TIER_3));
    return finalise(checks, meta, false, true, skipKeys);
  }

  // ---- fetch ------------------------------------------------------------
  const started = performance.now();
  let r, html, finalUrl, status, redirected;
  try {
    r = await fetchWithTimeout(url, { redirect: "follow", headers: { "User-Agent": UA } }, timeout);
    html = await r.text();
    finalUrl = r.url || url;
    status = r.status;
    redirected = r.redirected;
  } catch (exc) {
    checks.push(mkCheck("site_down", FAIL, "Site unreachable",
      "The website did not load.",
      `${exc.name || "Error"}: ${exc.message || exc}`, TIER_1));
    return finalise(checks, meta, false, false, skipKeys);
  }

  const bytes = Buffer.byteLength(html, "utf8");
  const elapsed = (performance.now() - started) / 1000;
  Object.assign(meta, {
    final_url: finalUrl, status, load_seconds: Math.round(elapsed * 100) / 100,
    redirected, html_bytes: bytes,
  });

  if (looksBlocked(status, html)) {
    checks.push(mkCheck("bot_protection", UNKNOWN, "Bot protection",
      "The site is behind bot protection, so no checks were run. Audit this one by hand or skip it.",
      `HTTP ${status} at ${finalUrl}`, TIER_3));
    return finalise(checks, meta, true, true, skipKeys);
  }

  if (status >= 400) {
    checks.push(mkCheck("site_down", FAIL, `HTTP ${status}`,
      `The homepage returns HTTP ${status}.`,
      `GET ${finalUrl} -> ${status}`, TIER_1));
    return finalise(checks, meta, false, false, skipKeys);
  }

  const $ = cheerio.load(html);
  const isHttps = finalUrl.startsWith("https://");
  const fhost = (() => { try { return new URL(finalUrl).hostname || ""; } catch { return ""; } })();
  const isLocal =
    ["localhost", "127.0.0.1", "::1"].includes(fhost) ||
    /^(192\.168\.|10\.|172\.16\.)/.test(fhost) ||
    /(\.local|\.test|\.internal)$/.test(fhost);

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const textLow = bodyText.toLowerCase();
  const kb = Math.floor(bytes / 1024);

  // ---- transport security ----------------------------------------------
  if (isLocal) {
    checks.push(mkCheck("cert", UNKNOWN, "Local address",
      "This is a local or private address, so transport security was not checked.",
      `host: ${fhost}`, TIER_3));
  } else if (!isHttps) {
    checks.push(mkCheck("no_https", FAIL, "No HTTPS",
      "The site loads over plain HTTP, so browsers show a “Not secure” warning in the address bar.",
      `final URL after redirects: ${finalUrl}`, TIER_1));
  } else if (skipGroupSet.has("https")) {
    // https group disabled — skip the TLS handshake + redirect probe entirely
  } else {
    const days = await certDaysLeft(host);
    if (days === null) {
      checks.push(mkCheck("cert", UNKNOWN, "Certificate unknown",
        "Could not read the TLS certificate.",
        `TLS handshake to ${host} did not return a cert`, TIER_2));
    } else if (days < 0) {
      checks.push(mkCheck("cert_expired", FAIL, "Certificate expired",
        "The security certificate has expired; visitors get a full-page browser warning.",
        `${host} cert expired ${Math.abs(days)} days ago`, TIER_1));
    } else if (days < 21) {
      checks.push(mkCheck("cert_expiring", FAIL, "Certificate expiring",
        `The security certificate expires in ${days} days.`,
        `${host} cert valid for ${days} more days`, TIER_1));
    } else {
      checks.push(mkCheck("cert", PASS, "Certificate valid", "",
        `${days} days remaining`, TIER_2));
    }

    try {
      const hr = await fetchWithTimeout("http://" + host, { redirect: "manual", headers: { "User-Agent": UA } }, 8000);
      if (![301, 302, 307, 308].includes(hr.status)) {
        checks.push(mkCheck("no_https_redirect", FAIL, "HTTP not redirected",
          "The insecure version of the site does not redirect to the secure one.",
          `GET http://${host} -> ${hr.status}`, TIER_2));
      }
    } catch { /* ignore */ }
  }

  // ---- speed ------------------------------------------------------------
  if (elapsed > 6) {
    checks.push(mkCheck("very_slow", FAIL, `${elapsed.toFixed(1)}s to load`,
      `The homepage took ${elapsed.toFixed(1)} seconds to respond. On a phone on mobile data it will be slower still.`,
      `GET ${finalUrl} completed in ${elapsed.toFixed(2)}s, HTML ${kb}KB`, TIER_1));
  } else if (elapsed > 3) {
    checks.push(mkCheck("slow", FAIL, `${elapsed.toFixed(1)}s to load`,
      `The homepage took ${elapsed.toFixed(1)} seconds to respond.`,
      `GET ${finalUrl} completed in ${elapsed.toFixed(2)}s, HTML ${kb}KB`, TIER_1));
  } else {
    checks.push(mkCheck("speed", PASS, `${elapsed.toFixed(1)}s to load`, "",
      `${elapsed.toFixed(2)}s, HTML ${kb}KB`, TIER_2));
  }

  // ---- mobile -----------------------------------------------------------
  const vp = $('meta[name="viewport" i]').first();
  if (!vp.length) {
    checks.push(mkCheck("no_viewport", FAIL, "Not built for mobile",
      "The page has no mobile viewport tag, so phones render the desktop layout shrunk down and visitors have to pinch and zoom to read it.",
      'no <meta name="viewport"> in <head>', TIER_1));
  } else {
    checks.push(mkCheck("viewport", PASS, "Mobile viewport set", "",
      $.html(vp).slice(0, 160), TIER_2));
  }

  // ---- phone ------------------------------------------------------------
  const telLinks = $('a[href^="tel:"]');
  const phoneMatch = bodyText.match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (telLinks.length) {
    checks.push(mkCheck("tel", PASS, "Phone is click-to-call", "",
      `${telLinks.length} tel: link(s)`, TIER_2));
  } else if (phoneMatch) {
    checks.push(mkCheck("tel_not_clickable", FAIL, "Phone not tappable",
      "The phone number is printed as plain text, so tapping it on a phone does nothing. Visitors have to memorise it and switch apps.",
      `found ${JSON.stringify(phoneMatch[1].trim())} in page text, 0 tel: links`, TIER_1));
  } else {
    checks.push(mkCheck("tel", UNKNOWN, "No phone number found",
      "No phone number was found on the homepage.",
      "no tel: link and no phone-shaped text", TIER_2));
  }

  // ---- forms ------------------------------------------------------------
  const realForms = [];
  $("form").each((_, f) => {
    const $f = $(f);
    const blob = (
      ($f.attr("action") || "") + " " + ($f.attr("id") || "") + " " +
      ($f.attr("class") || "") + " " + $f.text()
    ).toLowerCase();
    const inputCount = $f.find("input, textarea").length;
    if (blob.includes("search") && inputCount <= 2) return;
    realForms.push($f);
  });

  const iframeForms = $(
    'iframe[src*="form"], iframe[src*="book"], iframe[src*="calendly"], ' +
    'iframe[src*="hubspot"], iframe[src*="typeform"], iframe[src*="jotform"]'
  );
  const bookingHit = BOOKING_WORDS.find((w) => textLow.includes(w)) || null;

  if (realForms.length) {
    const fields = Math.max(...realForms.map(($f) => $f.find("input, textarea, select").length));
    checks.push(mkCheck("form", PASS, `Form present (${fields} fields)`, "",
      `${realForms.length} non-search <form> element(s)`, TIER_2));
    if (fields >= 8) {
      checks.push(mkCheck("form_long", FAIL, `${fields}-field form`,
        `The enquiry form asks for ${fields} fields. Every extra field loses people.`,
        `largest form has ${fields} inputs`, TIER_2));
    }
  } else if (iframeForms.length) {
    checks.push(mkCheck("form", UNKNOWN, "Form is embedded",
      "The form is loaded from a third party, so it could not be checked from the HTML.",
      `${iframeForms.length} embedded form iframe(s)`, TIER_2));
  } else if (FORM_ISH.some((w) => textLow.includes(w)) || bookingHit) {
    checks.push(mkCheck("form", UNKNOWN, "Form may be JS-rendered",
      "The page mentions contact or booking but no form is in the HTML. It may load with JavaScript.",
      "contact/booking wording present, 0 <form> elements", TIER_2));
  } else {
    checks.push(mkCheck("form_missing", FAIL, "No enquiry form",
      "There is no way to send an enquiry from the homepage. The only route to you is the phone, during opening hours.",
      "0 <form> elements and no embedded form on the homepage", TIER_1));
  }

  if (bookingHit) {
    checks.push(mkCheck("booking", PASS, "Online booking mentioned", "",
      `matched phrase: ${JSON.stringify(bookingHit)}`, TIER_2));
  } else {
    checks.push(mkCheck("no_booking", FAIL, "No online booking",
      "There is no online booking option. Anyone who lands on the site outside opening hours has to remember to call back.",
      "no booking/appointment wording found on the homepage", TIER_1));
  }

  // ---- freshness --------------------------------------------------------
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^\d]{0,20}(20\d{2})/gi)].map((m) => parseInt(m[1], 10));
  const thisYear = new Date().getUTCFullYear();
  if (years.length) {
    const newest = Math.max(...years);
    if (newest <= thisYear - 2) {
      checks.push(mkCheck("stale_copyright", FAIL, `Copyright says ${newest}`,
        `The footer still says ${newest}. To a visitor comparing three businesses, that reads as “maybe closed”.`,
        `copyright year ${newest} found in page source (now ${thisYear})`, TIER_1));
    } else {
      checks.push(mkCheck("copyright", PASS, `Copyright ${newest}`, "", `year ${newest}`, TIER_3));
    }
  }

  // ---- head tags (supporting only) -------------------------------------
  const title = ($("title").first().text() || "").trim();
  if (!title) {
    checks.push(mkCheck("no_title", FAIL, "No page title",
      "The homepage has no title tag, so Google has nothing to show as the blue headline in search results.",
      "<title> missing or empty", TIER_2));
  } else if (title.length > 65) {
    checks.push(mkCheck("title_long", FAIL, `Title ${title.length} chars`,
      "The page title is long enough that Google will cut it off.",
      `title (${title.length} chars): ${JSON.stringify(title.slice(0, 90))}`, TIER_2));
  } else {
    checks.push(mkCheck("title", PASS, "Title present", "", JSON.stringify(title.slice(0, 90)), TIER_2));
  }

  const mdContent = ($('meta[name="description" i]').attr("content") || "").trim();
  if (!mdContent) {
    checks.push(mkCheck("no_meta_desc", FAIL, "No meta description",
      "There is no meta description, so Google writes its own snippet from whatever text it finds.",
      '<meta name="description"> missing or empty', TIER_2));
  } else {
    checks.push(mkCheck("meta_desc", PASS, "Meta description present", "",
      JSON.stringify(mdContent.slice(0, 110)), TIER_2));
  }

  if (!$("h1").length) {
    checks.push(mkCheck("no_h1", FAIL, "No H1 heading", "The page has no H1 heading.",
      "0 <h1> elements", TIER_2));
  }

  if (!$('link[rel*="icon" i]').length) {
    checks.push(mkCheck("no_favicon", PASS, "No favicon", "",
      "no <link rel=icon>  — recorded, never pitched", TIER_3));
  }

  // ---- extra supporting checks (Tier 2 — richer evidence, never the hook) ----
  // page language
  if (!($("html").attr("lang") || "").trim()) {
    checks.push(mkCheck("no_lang", FAIL, "No page language set",
      "The <html> tag has no lang attribute, which hurts accessibility and how search engines read the page.",
      "<html> has no lang attribute", TIER_2));
  }

  // multiple H1 headings
  const h1count = $("h1").length;
  if (h1count > 1) {
    checks.push(mkCheck("multiple_h1", FAIL, `${h1count} H1 headings`,
      `The page has ${h1count} H1 headings; there should be one, or Google gets a muddled signal about the page.`,
      `${h1count} <h1> elements`, TIER_2));
  }

  // images missing alt text
  const imgs = $("img");
  let noAlt = 0;
  imgs.each((_, im) => { const a = $(im).attr("alt"); if (a === undefined || a === null) noAlt++; });
  if (imgs.length >= 3 && noAlt >= 3 && noAlt / imgs.length > 0.3) {
    checks.push(mkCheck("images_no_alt", FAIL, `${noAlt} images without alt text`,
      `${noAlt} of ${imgs.length} images have no alt text, so they're invisible to screen readers and to Google Images.`,
      `${noAlt}/${imgs.length} <img> missing alt`, TIER_2));
  }

  // Open Graph tags (link previews)
  if (!$('meta[property^="og:" i]').length) {
    checks.push(mkCheck("no_og_tags", FAIL, "No social preview",
      "There are no Open Graph tags, so sharing the link on Facebook, WhatsApp or LinkedIn shows no title, description or image.",
      'no <meta property="og:*"> tags', TIER_2));
  }

  // structured data (LocalBusiness / JSON-LD)
  if (!$('script[type="application/ld+json" i]').length && !$("[itemtype]").length) {
    checks.push(mkCheck("no_schema", FAIL, "No structured data",
      "The page has no structured data (schema.org), which is what lets Google show business hours, rating and location in results.",
      "no JSON-LD or microdata found", TIER_2));
  }

  // thin / JavaScript-only content
  const scriptCount = $("script").length;
  if (bodyText.length < 250 && scriptCount >= 3) {
    checks.push(mkCheck("thin_content", FAIL, "Little content without JavaScript",
      "The homepage returns almost no text in its HTML and relies on JavaScript to render, which some crawlers and slow phones handle poorly.",
      `${bodyText.length} chars of visible text, ${scriptCount} <script> tags`, TIER_2));
  }

  // platform / tech (recorded, never auto-pitched — but a strong manual pitch angle)
  const generator = ($('meta[name="generator" i]').attr("content") || "").trim();
  const platform = detectPlatform(html, generator);
  if (platform) {
    meta.platform = platform;
    checks.push(mkCheck("platform", PASS, `Built on ${platform}`, "",
      `detected ${platform}${generator ? ` — generator: ${generator.slice(0, 60)}` : ""}`, TIER_3));
  }

  // ---- mixed content ----------------------------------------------------
  if (isHttps && !isLocal) {
    const insecure = [];
    $("script[src], img[src], iframe[src]").each((_, el) => {
      const v = $(el).attr("src") || "";
      if (v.startsWith("http://")) insecure.push(v);
    });
    $("link[href]").each((_, el) => {
      const v = $(el).attr("href") || "";
      if (v.startsWith("http://")) insecure.push(v);
    });
    if (insecure.length) {
      checks.push(mkCheck("mixed_content", FAIL, `${insecure.length} insecure resources`,
        "The secure page loads some files over an insecure connection, which can break the padlock.",
        `first: ${insecure[0].slice(0, 110)}`, TIER_2));
    }
  }

  // ---- broken internal links -------------------------------------------
  if (checkLinks && !skipGroupSet.has("broken_links")) {
    const seen = new Set();
    const finalNoTrail = finalUrl.replace(/\/+$/, "");
    $("a[href]").each((_, a) => {
      if (seen.size > checkLinks) return;
      let href;
      try { href = new URL($(a).attr("href").split("#")[0], finalUrl).toString(); } catch { return; }
      try {
        if (new URL(href).host !== new URL(finalUrl).host) return;
      } catch { return; }
      if (seen.has(href) || href.replace(/\/+$/, "") === finalNoTrail) return;
      seen.add(href);
    });

    const broken = [];
    for (const href of seen) {
      try {
        let hr = await fetchWithTimeout(href, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA } }, 10000);
        if (hr.status === 405) hr = await fetchWithTimeout(href, { redirect: "follow", headers: { "User-Agent": UA } }, 10000);
        if (hr.status >= 400) broken.push([href, hr.status]);
      } catch { /* ignore */ }
      await sleep(400); // stay polite
    }
    if (broken.length) {
      const ev = broken.slice(0, 3).map(([u, s]) => `${u} -> ${s}`).join("; ");
      checks.push(mkCheck("broken_links", FAIL, `${broken.length} broken links`,
        `${broken.length} of the links on the homepage lead to a page that no longer exists.`, ev, TIER_1));
    } else if (seen.size) {
      checks.push(mkCheck("links", PASS, `${seen.size} links OK`, "",
        `checked ${seen.size} internal links`, TIER_2));
    }
  }

  // ---- emails found on page (free, better than most databases) ----------
  const mails = new Set(
    (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((m) => m.toLowerCase())
  );
  const cleaned = [...mails].filter((m) => !/\.(png|jpg|gif|webp)$/.test(m));
  meta.emails_found = cleaned.sort().slice(0, 5);

  return finalise(checks, meta, true, false, skipKeys);
}

function finalise(checks, meta, reachable, blocked, skipKeys) {
  if (skipKeys && skipKeys.size) checks = checks.filter((c) => !skipKeys.has(c.key));
  let hook = null;
  if (!blocked) {
    const eligible = checks.filter(
      (c) => c.state === FAIL && c.tier === TIER_1 && HOOK_WEIGHTS[c.key] !== undefined
    );
    if (eligible.length) {
      hook = eligible.reduce((a, b) => (HOOK_WEIGHTS[b.key] > HOOK_WEIGHTS[a.key] ? b : a));
    }
  }
  const fails = checks.filter((c) => c.state === FAIL);
  return { reachable, blocked, checks, hook, fail_count: fails.length, meta };
}

module.exports = { auditSite, UA, HOOK_WEIGHTS, CHECK_GROUPS, PASS, FAIL, UNKNOWN };
