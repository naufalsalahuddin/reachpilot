"use strict";
/**
 * Minimal RFC-4180-ish CSV parser + column mapping for lead imports.
 * Handles quoted fields, embedded commas/newlines, and doubled quotes.
 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = String(text || "").replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (ch === "\r") {
      // ignore; handled by \n
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // drop trailing empty rows
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// Accepts many common header spellings and maps them to lead columns.
const HEADER_ALIASES = {
  name: ["name", "business", "business name", "company", "company name", "title"],
  website: ["website", "url", "site", "web", "domain url"],
  domain: ["domain"],
  email: ["email", "e-mail", "email address", "contact email"],
  phone: ["phone", "telephone", "tel", "phone number", "mobile"],
  address: ["address", "full address", "location"],
  street: ["street", "street address", "address line 1", "address1"],
  city: ["city", "town"],
  state: ["state", "province", "region", "county"],
  postal_code: ["postal code", "postal_code", "zip", "zip code", "zipcode", "postcode"],
  country: ["country"],
  industry: ["industry", "category", "type", "niche"],
  rating: ["rating", "stars", "score"],
  review_count: ["reviews", "review count", "review_count", "num reviews", "ratings"],
  first_name: ["first name", "first_name", "firstname", "contact", "contact name"],
};

function normalizeHeader(h) {
  const key = String(h || "").trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

function domainOf(url) {
  if (!url) return null;
  try {
    const host = new URL(/^https?:\/\//.test(url) ? url : "https://" + url).hostname || "";
    return host.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Turn CSV text into lead objects. Returns { leads, skipped, columns }.
 * Rows with no name are skipped.
 */
function csvToLeads(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { leads: [], skipped: 0, columns: [] };
  const header = rows[0].map(normalizeHeader);
  const columns = rows[0].map((h, i) => ({ raw: h, mapped: header[i] }));
  const leads = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const rec = {};
    header.forEach((field, i) => { if (field) rec[field] = (rows[r][i] || "").trim(); });
    if (!rec.name) { skipped++; continue; }
    const website = rec.website || null;
    const domain = rec.domain || domainOf(website);
    leads.push({
      place_id: domain ? `csv:${domain}` : (rec.email ? `csv:${rec.email.toLowerCase()}` : null),
      name: rec.name,
      website: website && /^https?:\/\//.test(website) ? website : (website ? "https://" + website : null),
      domain,
      email: rec.email || null,
      phone: rec.phone || null,
      address: rec.address || null,
      street: rec.street || null,
      city: rec.city || null,
      state: rec.state || null,
      postal_code: rec.postal_code || null,
      country: rec.country || null,
      industry: rec.industry || null,
      rating: rec.rating ? parseFloat(rec.rating) || null : null,
      review_count: rec.review_count ? parseInt(rec.review_count, 10) || null : null,
      first_name: rec.first_name || null,
    });
  }
  return { leads, skipped, columns };
}

module.exports = { parseCsv, csvToLeads };
