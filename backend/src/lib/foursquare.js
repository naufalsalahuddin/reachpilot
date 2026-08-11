"use strict";
/**
 * Lead sourcing via the Foursquare Places API v3 (official, key-authenticated).
 * https://docs.foursquare.com/developer/reference/place-search
 *
 * Returns the same lead shape as lib/places.js. Foursquare DOES return the
 * merchant website + tel for many places, so these leads can be audited.
 */
const SEARCH_URL = "https://api.foursquare.com/v3/places/search";
const FIELDS = "fsq_id,name,location,tel,website,rating,stats";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function domainOf(url) {
  if (!url) return null;
  try {
    const host = new URL(/^https?:\/\//.test(url) ? url : "https://" + url).hostname || "";
    return host.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

async function search(apiKey, industry, city, { want = 60, minReviews = 0, requireWebsite = false } = {}) {
  const out = [];
  const seen = new Set();
  const headers = { Authorization: apiKey, Accept: "application/json" };
  let cursor = null;
  // Foursquare returns up to 50 per page; paginate via the `link` cursor header.
  for (let page = 0; out.length < want && page < 20; page++) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", industry);
    url.searchParams.set("near", city);
    url.searchParams.set("limit", "50");
    url.searchParams.set("fields", FIELDS);
    if (cursor) url.searchParams.set("cursor", cursor);
    const r = await fetch(url.toString(), { headers });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Foursquare API ${r.status}: ${text.slice(0, 300)}`);
    }
    const data = await r.json();
    const results = data.results || [];
    if (!results.length) break;
    for (const p of results) {
      if (seen.has(p.fsq_id)) continue;
      seen.add(p.fsq_id);
      const site = p.website || null;
      if (requireWebsite && !site) continue;
      const reviews = (p.stats && p.stats.total_ratings) || 0;
      if (reviews < minReviews) continue;
      const loc = p.location || {};
      out.push({
        place_id: `fsq:${p.fsq_id}`,
        name: (p.name || "").trim(),
        website: site,
        domain: domainOf(site),
        phone: p.tel || null,
        address: loc.formatted_address || [loc.address, loc.locality, loc.region].filter(Boolean).join(", ") || null,
        city: loc.locality || city,
        industry,
        rating: p.rating != null ? p.rating / 2 : null, // Foursquare rates 0–10; normalize to 5
        review_count: reviews,
      });
    }
    // pagination cursor lives in the Link header
    const link = r.headers.get("link") || "";
    const m = link.match(/cursor=([^&>]+)/);
    cursor = m ? decodeURIComponent(m[1]) : null;
    if (!cursor) break;
    await sleep(300);
  }
  return out.slice(0, want);
}

module.exports = { search, domainOf };
