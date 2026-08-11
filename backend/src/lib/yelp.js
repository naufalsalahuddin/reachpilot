"use strict";
/**
 * Lead sourcing via the Yelp Fusion API (official, key-authenticated).
 * https://docs.developer.yelp.com/reference/v3_business_search
 *
 * Returns the same lead shape as lib/places.js so the pipeline is source-agnostic.
 * Note: Yelp's business search does NOT expose the merchant's own website — only
 * the Yelp listing URL — so `website` is null and those leads won't be audited
 * unless a website is added later. Phone + address + rating still make them useful.
 */
const SEARCH_URL = "https://api.yelp.com/v3/businesses/search";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(apiKey, industry, city, { want = 60, minReviews = 0 } = {}) {
  const out = [];
  const seen = new Set();
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  // Yelp caps limit at 50 per call and offset up to ~1000.
  for (let offset = 0; out.length < want && offset < 1000; offset += 50) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("term", industry);
    url.searchParams.set("location", city);
    url.searchParams.set("limit", String(Math.min(50, want - out.length + 10)));
    url.searchParams.set("offset", String(offset));
    const r = await fetch(url.toString(), { headers });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Yelp API ${r.status}: ${text.slice(0, 300)}`);
    }
    const data = await r.json();
    const businesses = data.businesses || [];
    if (!businesses.length) break;
    for (const b of businesses) {
      if (b.is_closed) continue;
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const reviews = b.review_count || 0;
      if (reviews < minReviews) continue;
      const loc = b.location || {};
      out.push({
        place_id: `yelp:${b.id}`,
        name: (b.name || "").trim(),
        website: null, // Yelp does not return the merchant's own site
        domain: null,
        phone: b.display_phone || b.phone || null,
        address: (loc.display_address || []).join(", ") || null,
        city: loc.city || city,
        industry,
        rating: b.rating ?? null,
        review_count: reviews,
      });
    }
    if (businesses.length < 50) break;
    await sleep(300);
  }
  return out.slice(0, want);
}

module.exports = { search };
