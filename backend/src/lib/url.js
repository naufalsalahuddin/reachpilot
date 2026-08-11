"use strict";
/**
 * URL hygiene. Business website URLs from Places/Yelp/Foursquare/CSV frequently
 * carry tracking query strings (utm_source, gclid, fbclid, session ids…). Those
 * are noise for auditing, deduping and display, so we strip the query + fragment
 * everywhere a website URL enters the system, keeping scheme + host + path.
 */
function cleanUrl(input) {
  if (!input) return null;
  let w = String(input).trim();
  if (!w) return null;
  if (!/^https?:\/\//i.test(w)) w = "https://" + w;
  try {
    const u = new URL(w);
    if (!u.host) return null;
    u.search = "";
    u.hash = "";
    let out = u.toString();
    // drop a bare trailing slash on the root for tidier storage/dedup
    out = out.replace(/\/$/, u.pathname === "/" ? "" : "/");
    return out;
  } catch {
    return null;
  }
}

/** Registrable-ish hostname (www. stripped), lowercased — used for company dedup. */
function domainOf(input) {
  const cleaned = cleanUrl(input);
  if (!cleaned) return null;
  try {
    const host = new URL(cleaned).hostname || "";
    return host.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

module.exports = { cleanUrl, domainOf };
