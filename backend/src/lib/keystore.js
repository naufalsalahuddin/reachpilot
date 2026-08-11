"use strict";
/**
 * API key store + rotation (Prisma port). Keys are added from the UI, encrypted
 * at rest, pooled per provider. `withKey` runs a call with the least-recently-used
 * active key and, on a rate-limit/quota error, cools that key and retries with the
 * next — falling back to the .env key if the pool is empty.
 */
const prisma = require("./prisma");
const crypto = require("./crypto");
const config = require("../config");

const PROVIDERS = [
  "anthropic", "openai", "groq",
  "google_places", "google_pagespeed", "hunter",
  "yelp", "foursquare",
  "hubspot", "pipedrive",
];

function envKeyFor(provider) {
  switch (provider) {
    case "anthropic": return config.ai.anthropic.key;
    case "openai": return config.ai.openai.key;
    case "groq": return config.ai.groq.key;
    case "google_places": return config.googlePlacesKey;
    case "google_pagespeed": return process.env.PAGESPEED_API_KEY || "";
    case "hunter": return config.emailFinder.hunterKey;
    case "yelp": return config.yelpKey;
    case "foursquare": return config.foursquareKey;
    case "hubspot": return process.env.HUBSPOT_TOKEN || "";
    case "pipedrive": return process.env.PIPEDRIVE_TOKEN || "";
    default: return "";
  }
}

function isRateLimit(err) {
  if (!err) return false;
  if (err.status === 429 || err.statusCode === 429) return true;
  const m = `${err.code || ""} ${err.message || err}`.toLowerCase();
  return /rate.?limit|quota|too many requests|insufficient_quota|resource[_ ]exhausted|\b429\b/.test(m);
}

/** Least-recently-used active, non-cooling key for a provider (excluding tried ids). */
async function getKey(provider, exclude = new Set()) {
  const rows = await prisma.api_keys.findMany({
    where: {
      provider,
      status: "active",
      OR: [{ cooldown_until: null }, { cooldown_until: { lte: new Date() } }],
    },
    orderBy: [{ last_used: "asc" }, { id: "asc" }],
  });
  for (const r of rows) {
    if (exclude.has(r.id)) continue;
    try {
      return { id: r.id, key: crypto.decrypt(r.key_ciphertext) };
    } catch { /* skip bad ciphertext */ }
  }
  const envKey = envKeyFor(provider);
  if (envKey && !exclude.has("env")) return { id: "env", key: envKey };
  return null;
}

async function markUsed(id) {
  if (id && id !== "env") {
    await prisma.api_keys.update({ where: { id }, data: { last_used: new Date(), last_error: null } });
  }
}

async function markCooldown(id, minutes, message) {
  if (!id || id === "env") return;
  await prisma.api_keys.update({
    where: { id },
    data: { cooldown_until: new Date(Date.now() + minutes * 60000), last_error: String(message || "rate limited").slice(0, 500) },
  });
}

async function hasKey(provider) {
  return !!(await getKey(provider));
}

async function availableAiProviders() {
  const out = [];
  for (const p of ["anthropic", "openai", "groq"]) if (await hasKey(p)) out.push(p);
  return out;
}

async function withKey(provider, fn, { cooldownMin = 60, maxTries = 8 } = {}) {
  const tried = new Set();
  let lastErr = null;
  for (let i = 0; i < maxTries; i++) {
    const k = await getKey(provider, tried);
    if (!k || !k.key) break;
    try {
      const result = await fn(k.key);
      await markUsed(k.id);
      return result;
    } catch (e) {
      lastErr = e;
      if (isRateLimit(e)) {
        await markCooldown(k.id, cooldownMin, e.message);
        tried.add(k.id === "env" ? "env" : k.id);
        continue;
      }
      throw e;
    }
  }
  throw new Error(
    lastErr && isRateLimit(lastErr)
      ? `All ${provider} keys are rate-limited right now`
      : `No usable API key for ${provider}` + (lastErr ? `: ${lastErr.message}` : "")
  );
}

// ------------------------------------------------------------------ admin
async function listKeys() {
  return prisma.api_keys.findMany({
    select: { id: true, provider: true, label: true, key_hint: true, status: true, cooldown_until: true, last_used: true, last_error: true, created_at: true },
    orderBy: [{ provider: "asc" }, { id: "asc" }],
  });
}

async function addKey(provider, label, key) {
  if (!PROVIDERS.includes(provider)) throw new Error("unknown provider");
  if (!key) throw new Error("key is required");
  await prisma.api_keys.create({
    data: { provider, label: label || null, key_ciphertext: crypto.encrypt(key), key_hint: key.slice(-4), status: "active", created_at: new Date() },
  });
}

async function updateKey(id, fields) {
  const data = {};
  if (fields.label !== undefined) data.label = fields.label;
  if (fields.status !== undefined) data.status = fields.status;
  if (fields.status === "active") data.cooldown_until = null;
  if (fields.key) { data.key_ciphertext = crypto.encrypt(fields.key); data.key_hint = fields.key.slice(-4); }
  if (!Object.keys(data).length) return;
  await prisma.api_keys.update({ where: { id }, data });
}

async function deleteKey(id) {
  await prisma.api_keys.delete({ where: { id } });
}

/** Lightweight validity check for a raw key. Throws on failure. */
async function testKey(provider, key) {
  if (provider === "openai" || provider === "groq") {
    const base = provider === "groq" ? config.ai.groq.baseURL : "https://api.openai.com/v1";
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: config.ai.anthropic.model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    });
    if (r.status === 401 || r.status === 403) throw new Error("invalid key");
    if (!r.ok && r.status !== 400) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "hunter") {
    const r = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "google_places") {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
      body: JSON.stringify({ textQuery: "coffee", pageSize: 1 }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "yelp") {
    const r = await fetch("https://api.yelp.com/v3/businesses/search?term=coffee&location=NYC&limit=1", { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 401) throw new Error("invalid key");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "foursquare") {
    const r = await fetch("https://api.foursquare.com/v3/places/search?query=coffee&near=NYC&limit=1", { headers: { Authorization: key } });
    if (r.status === 401) throw new Error("invalid key");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "hubspot") {
    const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 401) throw new Error("invalid token");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "pipedrive") {
    const r = await fetch(`https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(key)}`);
    if (r.status === 401) throw new Error("invalid token");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  if (provider === "google_pagespeed") {
    const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    url.searchParams.set("url", "https://example.com");
    url.searchParams.set("strategy", "mobile");
    if (key) url.searchParams.set("key", key);
    const r = await fetch(url.toString());
    if (r.status === 400) {
      const body = await r.json().catch(() => ({}));
      const reason = body?.error?.message || "";
      if (/API key not valid|invalid/i.test(reason)) throw new Error("invalid key");
      throw new Error(body?.error?.message || "HTTP 400");
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  }
  throw new Error("unknown provider");
}

module.exports = {
  PROVIDERS, getKey, withKey, hasKey, availableAiProviders,
  markUsed, markCooldown, isRateLimit, listKeys, addKey, updateKey, deleteKey, testKey, envKeyFor,
};
