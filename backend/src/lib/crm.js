"use strict";
/**
 * Push a contact into HubSpot and/or Pipedrive when a key event happens
 * (reply, meeting, interested). Token-based (encrypted in the keystore),
 * best-effort and non-blocking — a CRM hiccup must never affect sending.
 */
const keystore = require("./keystore");

const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };

async function hubspotUpsert(token, c) {
  const props = { email: c.email };
  if (c.name) props.firstname = c.name;
  if (c.phone) props.phone = c.phone;
  if (c.website) props.website = c.website;
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  // find existing by email
  const t1 = withTimeout(8000);
  const search = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST", headers: hdr, signal: t1.signal,
    body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: c.email }] }], properties: ["email"], limit: 1 }),
  }).then((r) => r.json()).catch(() => null);
  t1.done();
  const id = search?.results?.[0]?.id;
  const t2 = withTimeout(8000);
  const url = id ? `https://api.hubapi.com/crm/v3/objects/contacts/${id}` : "https://api.hubapi.com/crm/v3/objects/contacts";
  await fetch(url, { method: id ? "PATCH" : "POST", headers: hdr, signal: t2.signal, body: JSON.stringify({ properties: props }) });
  t2.done();
}

async function pipedriveUpsert(token, c) {
  const t1 = withTimeout(8000);
  const search = await fetch(`https://api.pipedrive.com/v1/persons/search?term=${encodeURIComponent(c.email)}&fields=email&exact_match=true&api_token=${encodeURIComponent(token)}`, { signal: t1.signal }).then((r) => r.json()).catch(() => null);
  t1.done();
  const existing = search?.data?.items?.[0]?.item;
  const body = { name: c.name || c.email, email: [c.email] };
  if (c.phone) body.phone = [c.phone];
  const t2 = withTimeout(8000);
  const url = existing ? `https://api.pipedrive.com/v1/persons/${existing.id}?api_token=${encodeURIComponent(token)}` : `https://api.pipedrive.com/v1/persons?api_token=${encodeURIComponent(token)}`;
  await fetch(url, { method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, signal: t2.signal, body: JSON.stringify(body) });
  t2.done();
}

async function pushContact(contact, event) {
  if (!contact || !contact.email) return { pushed: [] };
  const pushed = [];
  try { const k = await keystore.getKey("hubspot"); if (k && k.key) { await hubspotUpsert(k.key, contact); pushed.push("hubspot"); } } catch (e) { console.warn("[crm] hubspot:", e.message); }
  try { const k = await keystore.getKey("pipedrive"); if (k && k.key) { await pipedriveUpsert(k.key, contact); pushed.push("pipedrive"); } } catch (e) { console.warn("[crm] pipedrive:", e.message); }
  return { pushed, event };
}

module.exports = { pushContact };
