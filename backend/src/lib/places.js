"use strict";
/**
 * Lead sourcing via the Google Places API (New). Port of source_leads.py.
 *
 * Emails are NOT bought here — they are scraped from the business's own site
 * during the audit step, which for owner-operated SMBs is better data than any
 * database and costs nothing.
 */
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id", "places.displayName", "places.websiteUri",
  "places.nationalPhoneNumber", "places.internationalPhoneNumber",
  "places.formattedAddress", "places.rating", "places.userRatingCount",
  "places.businessStatus", "nextPageToken",
].join(",");

function domainOf(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname || "";
    return host.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Return up to `want` leads for one industry+city.
 * Google returns 20 per page and caps around 60 per query.
 */
async function search(apiKey, industry, city, { want = 60, minReviews = 0, requireWebsite = true } = {}) {
  const out = [];
  let token = null;
  const query = `${industry} in ${city}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": FIELDS,
  };

  while (out.length < want) {
    const payload = { textQuery: query, pageSize: 20 };
    if (token) payload.pageToken = token;

    const r = await fetch(SEARCH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Places API ${r.status}: ${text.slice(0, 300)}`);
    }
    const data = await r.json();

    for (const p of data.places || []) {
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      const site = p.websiteUri || null;
      if (requireWebsite && !site) continue;
      const reviews = p.userRatingCount || 0;
      if (reviews < minReviews) continue;
      out.push({
        place_id: p.id,
        name: ((p.displayName && p.displayName.text) || "").trim(),
        website: site,
        domain: domainOf(site),
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
        address: p.formattedAddress || null,
        city,
        industry,
        rating: p.rating ?? null,
        review_count: reviews,
      });
    }

    token = data.nextPageToken || null;
    if (!token) break;
    await sleep(2000); // Google needs a moment before the page token is live
  }

  return out.slice(0, want);
}

module.exports = { search, domainOf };
