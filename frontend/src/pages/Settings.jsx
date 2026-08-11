import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiBase, toast, TIMEZONES } from "../api.js";
import { useMe } from "../main.jsx";
import Modal from "../components/Modal.jsx";

const PROVIDERS = [
  ["groq", "Groq", "Fast, low-cost AI for drafting & the inline editor.", "https://console.groq.com/keys"],
  ["openai", "OpenAI (ChatGPT)", "GPT models for drafting & editing.", "https://platform.openai.com/api-keys"],
  ["anthropic", "Anthropic (Claude)", "Claude models for drafting & editing.", "https://console.anthropic.com/settings/keys"],
  ["google_places", "Google Places", "Sources local business leads (with websites).", "https://console.cloud.google.com/apis/credentials"],
  ["yelp", "Yelp Fusion", "Sources local businesses by category + location.", "https://docs.developer.yelp.com/docs/fusion-authentication"],
  ["foursquare", "Foursquare Places", "Sources local businesses, often with a website.", "https://foursquare.com/developers/apps"],
  ["google_pagespeed", "Google PageSpeed", "Real Lighthouse performance scores (mobile + desktop).", "https://console.cloud.google.com/apis/credentials"],
  ["hunter", "Hunter.io", "Finds owner / decision-maker email addresses.", "https://hunter.io/api-keys"],
  ["hubspot", "HubSpot", "Pushes contacts to HubSpot on reply / meeting / interested (Private App token).", "https://developers.hubspot.com/docs/api/private-apps"],
  ["pipedrive", "Pipedrive", "Pushes persons to Pipedrive on reply / meeting / interested (API token).", "https://pipedrive.readme.io/docs/how-to-find-the-api-token"],
];
const METHOD_FIELDS = {
  smtp: [["host", "SMTP host"], ["port", "Port"], ["user", "Username"], ["pass", "Password / app password"], ["imap_host", "IMAP host (replies, optional)"], ["imap_port", "IMAP port"]],
  gmail_api: [["client_id", "OAuth client ID"], ["client_secret", "OAuth client secret"], ["refresh_token", "Refresh token"], ["imap_pass", "IMAP app password (optional)"]],
  instantly: [["api_key", "Instantly API key"], ["campaign_id", "Instantly campaign id"], ["base_url", "API base URL (optional)"]],
  smartlead: [["api_key", "Smartlead API key"], ["campaign_id", "Smartlead campaign id"], ["base_url", "API base URL (optional)"]],
};

export default function Settings() {
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const [sp, setSp] = useSearchParams();
  const section = sp.get("section") || "profile";
  const go = (s) => setSp({ section: s });

  const SECTIONS = [
    ["Account", [["profile", "Profile"], ["password", "Password"]]],
    ["Workspace", [["general", "General"], ["branding", "Branding"], ["members", "Members"], ["integrations", "Integrations"], ["sending", "Sending"], ["templates", "Email designs"], ["deliverability", "Deliverability"], ["reportai", "Report AI"], ["automation", "Automation"]]],
  ];

  return (
    <div className="settings-layout">
      <aside className="settings-nav">
        {SECTIONS.map(([group, items]) => (
          <React.Fragment key={group}>
            <div className="settings-group">{group}</div>
            {items.map(([k, l]) => ((group === "Workspace" && !isAdmin) ? null : <a key={k} className={section === k ? "active" : ""} onClick={() => go(k)}>{l}</a>))}
          </React.Fragment>
        ))}
      </aside>
      <div className="settings-panel">
        {section === "profile" && <Profile me={me} />}
        {section === "password" && <Password />}
        {section === "general" && isAdmin && <General />}
        {section === "branding" && isAdmin && <Branding />}
        {section === "members" && isAdmin && <Members meId={me?.id} />}
        {section === "integrations" && isAdmin && <Integrations />}
        {section === "sending" && isAdmin && <Sending />}
        {section === "templates" && isAdmin && <Templates />}
        {section === "deliverability" && isAdmin && <Deliverability />}
        {section === "reportai" && isAdmin && <ReportAi />}
        {section === "automation" && isAdmin && <Automation />}
      </div>
    </div>
  );
}

function Head({ t, s }) { return <><h2 className="section-title">{t}</h2><div className="section-sub">{s}</div></>; }

function Profile({ me }) {
  const [email, setEmail] = useState(me?.email || "");
  const [cur, setCur] = useState(""); const [msg, setMsg] = useState("");
  const save = async () => { setMsg("Saving…"); try { await api("/api/profile", { method: "PUT", body: { email, current_password: cur } }); setMsg("Saved."); toast("Profile updated"); } catch (e) { setMsg(e.message); } };
  return <><Head t="Profile" s="Your sign-in email. Changing it needs your current password." />
    <div className="card">
      <div className="field"><label className="fld">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label className="fld">Current password</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="required to change email" /></div>
      <div className="row"><button className="primary" onClick={save}>Save</button><span className="hint">{msg}</span></div>
    </div></>;
}

function Password() {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [msg, setMsg] = useState("");
  const save = async () => { if (!cur || !nw) { toast("Fill both fields"); return; } setMsg("Saving…"); try { await api("/api/profile", { method: "PUT", body: { current_password: cur, new_password: nw } }); setCur(""); setNw(""); setMsg("Password updated."); toast("Password updated"); } catch (e) { setMsg(e.message); } };
  return <><Head t="Password" s="Choose a strong password you don't use elsewhere." />
    <div className="card">
      <div className="field"><label className="fld">Current password</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div className="field"><label className="fld">New password</label><input type="password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="at least 6 characters" /></div>
      <div className="row"><button className="primary" onClick={save}>Update password</button><span className="hint">{msg}</span></div>
    </div></>;
}

function Branding() {
  const [s, setS] = useState({ brand_name: "", brand_primary: "#1c97e6", brand_secondary: "#0b6fb8", brand_logo: "/logo.svg" });
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/branding").then((b) => setS({ brand_name: b.name, brand_primary: b.primary, brand_secondary: b.secondary, brand_logo: b.logo })).catch(() => {}); }, []);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => { setMsg("Saving…"); try { await api("/api/appsettings", { method: "PUT", body: s }); setMsg("Saved — reloading…"); toast("Branding saved"); setTimeout(() => location.reload(), 700); } catch (e) { setMsg(e.message); } };
  const color = (k, label) => (
    <div className="field"><label className="fld">{label}</label>
      <div className="row"><input type="color" style={{ width: 44, height: 38, padding: 2 }} value={s[k]} onChange={(e) => set(k, e.target.value)} /><input className="mono" style={{ maxWidth: 140 }} value={s[k]} onChange={(e) => set(k, e.target.value)} /></div>
    </div>
  );
  return <><Head t="Branding" s="Your workspace's name, colors and logo. Stored per-workspace, so this is multi-tenant-ready." />
    <div className="card">
      <div className="field"><label className="fld">Workspace / company name</label><input value={s.brand_name} onChange={(e) => set("brand_name", e.target.value)} placeholder="Acme Web Studio" /></div>
      <div className="grid two">{color("brand_primary", "Primary color")}{color("brand_secondary", "Secondary color")}</div>
      <div className="field"><label className="fld">Logo URL</label><input value={s.brand_logo} onChange={(e) => set("brand_logo", e.target.value)} placeholder="/logo.svg" /><div className="hint" style={{ marginTop: 4 }}>Drop your file in <span className="mono">frontend/public/</span> (e.g. <span className="mono">/logo.svg</span>) or paste a full URL. Used in the sidebar, login and favicon.</div></div>
      <div className="row" style={{ marginTop: 4, alignItems: "center" }}><img src={s.brand_logo} alt="logo preview" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "contain", border: "1px solid var(--rule)" }} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} /><span className="hint">Preview</span></div>
      <div className="row" style={{ marginTop: 12 }}><button className="primary" onClick={save}>Save branding</button><span className="hint">{msg}</span></div>
    </div></>;
}

function General() {
  const [s, setS] = useState({ default_timezone: "", default_sender: "", include_unsubscribe: "1" });
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/appsettings").then((d) => setS({ default_timezone: d.default_timezone || "", default_sender: d.default_sender || "", include_unsubscribe: d.include_unsubscribe ?? "1" })).catch(() => {}); }, []);
  const save = async () => { setMsg("Saving…"); try { await api("/api/appsettings", { method: "PUT", body: s }); setMsg("Saved."); toast("Saved"); } catch (e) { setMsg(e.message); } };
  return <><Head t="General" s="Defaults applied to new campaigns." />
    <div className="card">
      <div className="field"><label className="fld">Default timezone</label><select value={s.default_timezone} onChange={(e) => setS({ ...s, default_timezone: e.target.value })}><option value="">(none)</option>{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
      <div className="field"><label className="fld">Default sender name</label><input value={s.default_sender} onChange={(e) => setS({ ...s, default_sender: e.target.value })} placeholder="e.g. Your name" /></div>
    </div>
    <Head t="Compliance" s="Applies to emails from your own inboxes (SMTP/Gmail). Instantly/Smartlead add their own opt-out." />
    <div className="card">
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
        <input type="checkbox" style={{ marginTop: 3 }} checked={s.include_unsubscribe !== "0"} onChange={(e) => setS({ ...s, include_unsubscribe: e.target.checked ? "1" : "0" })} />
        <span><b>Include an unsubscribe link in every email</b>
          <div className="hint" style={{ marginTop: 4 }}>Recommended, on by default. Removing it can violate <b>CAN-SPAM</b> (US) and <b>GDPR/PECR</b> (EU) for cold email. A campaign can override this.</div></span>
      </label>
      <div className="row" style={{ marginTop: 12 }}><button className="primary" onClick={save}>Save</button><span className="hint">{msg}</span></div>
    </div></>;
}

function Members({ meId }) {
  const [users, setUsers] = useState(null);
  const [nu, setNu] = useState({ email: "", role: "member", password: "" });
  const [adding, setAdding] = useState(false);
  const load = () => api("/api/users").then(setUsers).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);
  const add = async () => { try { await api("/api/users", { method: "POST", body: nu }); toast("Member added"); setNu({ email: "", role: "member", password: "" }); setAdding(false); load(); } catch (e) { toast(e.message); } };
  const setRole = async (id, role) => { try { await api(`/api/users/${id}`, { method: "PUT", body: { role } }); load(); } catch (e) { toast(e.message); } };
  const toggle = async (id, status) => { try { await api(`/api/users/${id}`, { method: "PUT", body: { status } }); load(); } catch (e) { toast(e.message); } };
  const del = async (id) => { if (!confirm("Delete this user?")) return; try { await api(`/api/users/${id}`, { method: "DELETE" }); load(); } catch (e) { toast(e.message); } };
  return <><div className="row" style={{ alignItems: "flex-start" }}><div style={{ flex: 1 }}><Head t="Members" s="Admins manage everything; members can source, review and run campaigns." /></div><button className="primary" onClick={() => { setNu({ email: "", role: "member", password: "" }); setAdding(true); }}>Add member</button></div>
    {adding && <Modal title="Add member" onClose={() => setAdding(false)} footer={<><button className="primary" onClick={add}>Add member</button><button className="ghost" onClick={() => setAdding(false)}>Cancel</button></>}>
      <div className="field"><label className="fld">Email</label><input autoFocus value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></div>
      <div className="grid two"><div className="field"><label className="fld">Role</label><select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="member">Member</option><option value="admin">Admin</option></select></div>
        <div className="field"><label className="fld">Temporary password</label><input value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="at least 6 characters" /></div></div>
    </Modal>}
    <div className="list">{(users || []).map((u) => (
      <div className="list-row" key={u.id}><div style={{ flex: 1 }}><div className="title">{u.email} {u.is_you && <span className="tag">you</span>} {u.status === "disabled" && <span className="badge fail">disabled</span>}</div><div className="meta">{u.last_login ? "last login " + new Date(u.last_login).toLocaleString() : "never signed in"}</div></div>
        <select style={{ width: "auto" }} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}><option value="member">member</option><option value="admin">admin</option></select>
        <button className="sm" onClick={() => toggle(u.id, u.status === "disabled" ? "active" : "disabled")}>{u.status === "disabled" ? "Enable" : "Disable"}</button>
        <button className="sm danger" disabled={u.id === meId} onClick={() => del(u.id)}>Delete</button></div>
    ))}</div></>;
}

function Integrations() {
  const [keys, setKeys] = useState(null);
  const [inputs, setInputs] = useState({});
  const load = () => api("/api/keys").then(setKeys).catch(() => setKeys([]));
  useEffect(() => { load(); }, []);
  const addKey = async (p) => { const key = (inputs[p] || "").trim(); if (!key) { toast("Paste a key"); return; } try { await api("/api/keys", { method: "POST", body: { provider: p, key } }); toast("Key added"); setInputs({ ...inputs, [p]: "" }); load(); } catch (e) { toast(e.message); } };
  const testRaw = async (p) => { const key = (inputs[p] || "").trim(); if (!key) { toast("Paste a key to test"); return; } try { const r = await api("/api/keys/test", { method: "POST", body: { provider: p, key } }); toast(r.message); } catch (e) { toast("Failed: " + e.message); } };
  const testKey = async (id) => { try { const r = await api(`/api/keys/${id}/test`, { method: "POST" }); toast(r.message); load(); } catch (e) { toast("Failed: " + e.message); } };
  const toggle = async (id, status) => { try { await api(`/api/keys/${id}`, { method: "PUT", body: { status } }); load(); } catch (e) { toast(e.message); } };
  const del = async (id) => { if (!confirm("Delete this key?")) return; try { await api(`/api/keys/${id}`, { method: "DELETE" }); load(); } catch (e) { toast(e.message); } };
  const byP = {}; for (const k of keys || []) (byP[k.provider] = byP[k.provider] || []).push(k);
  const status = (k) => k.status === "disabled" ? <span className="badge gray">paused</span> : (k.cooldown_until && new Date(k.cooldown_until) > new Date()) ? <span className="badge warn">cooling down</span> : <span className="badge ok">active</span>;
  return <><Head t="Integrations" s="Connect the services the app uses. Keys are encrypted at rest — add several per provider and it rotates automatically." />
    {keys === null ? <div className="empty">Loading…</div> : PROVIDERS.map(([p, name, desc, url]) => {
      const ks = byP[p] || []; const active = ks.filter((k) => k.status !== "disabled").length;
      return <div className="card" key={p}>
        <div><h2 style={{ fontSize: 16 }}>{name} {active ? <span className="badge ok">{active} connected</span> : <span className="badge gray">not connected</span>}</h2>
          <div className="sub" style={{ margin: "2px 0 0" }}>{desc} · <a href={url} target="_blank" rel="noopener noreferrer">Get a key ↗</a></div></div>
        {ks.length > 0 && <div className="list" style={{ margin: "12px 0 4px" }}>{ks.map((k) => (
          <div className="list-row" key={k.id}><div style={{ flex: 1 }}><div className="title" style={{ fontSize: 14 }}>{k.label || name} <span className="mono muted">••••{k.key_hint || ""}</span> {status(k)}</div>{k.last_error && <div className="meta" style={{ color: "var(--fail)" }}>{k.last_error.slice(0, 60)}</div>}</div>
            <button className="sm" onClick={() => testKey(k.id)}>Test</button><button className="sm" onClick={() => toggle(k.id, k.status === "disabled" ? "active" : "disabled")}>{k.status === "disabled" ? "Enable" : "Pause"}</button><button className="sm danger" onClick={() => del(k.id)}>Delete</button></div>
        ))}</div>}
        <div className="row" style={{ marginTop: 12 }}><input style={{ flex: 1 }} placeholder="paste an API key" value={inputs[p] || ""} onChange={(e) => setInputs({ ...inputs, [p]: e.target.value })} /><button className="primary sm" onClick={() => addKey(p)}>Add</button><button className="sm" onClick={() => testRaw(p)}>Test</button></div>
      </div>;
    })}</>;
}

function Sending() {
  const [accounts, setAccounts] = useState(null);
  const [f, setF] = useState(null); // null = modal closed
  const [editId, setEditId] = useState(null);
  const [dns, setDns] = useState({ domain: "", selector: "", result: null });
  const load = () => api("/api/accounts").then(setAccounts).catch(() => setAccounts([]));
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditId(null); setF({ name: "", method: "smtp", from_name: "", from_email: "", daily_cap: 30, warmup: false, config: {} }); };
  const close = () => { setF(null); setEditId(null); };
  const save = async () => {
    try { if (editId) await api(`/api/accounts/${editId}`, { method: "PUT", body: f }); else await api("/api/accounts", { method: "POST", body: f }); toast("Saved"); close(); load(); }
    catch (e) { toast(e.message); }
  };
  const edit = (a) => { setEditId(a.id); setF({ name: a.name, method: a.method, from_name: a.from_name || "", from_email: a.from_email || "", daily_cap: a.daily_cap, warmup: !!a.warmup, config: {} }); };
  const test = async (id) => { toast("Testing…"); try { const r = await api(`/api/accounts/${id}/test`, { method: "POST" }); toast(r.message); } catch (e) { toast("Failed: " + e.message); } };
  const toggle = async (a) => { try { await api(`/api/accounts/${a.id}`, { method: "PUT", body: { status: a.status === "active" ? "paused" : "active" } }); load(); } catch (e) { toast(e.message); } };
  const del = async (id) => { if (!confirm("Delete this account?")) return; try { await api(`/api/accounts/${id}`, { method: "DELETE" }); load(); } catch (e) { toast(e.message); } };
  const checkDns = async () => { if (!dns.domain) { toast("Enter a domain"); return; } try { const d = await api(`/api/dns?domain=${encodeURIComponent(dns.domain)}${dns.selector ? `&selector=${encodeURIComponent(dns.selector)}` : ""}`); setDns({ ...dns, result: d }); } catch (e) { toast(e.message); } };
  const setCfg = (k, v) => setF((s) => ({ ...s, config: { ...s.config, [k]: v } }));
  return <><div className="row" style={{ alignItems: "flex-start" }}><div style={{ flex: 1 }}><Head t="Sending" s="The inboxes emails go out from — SMTP, Gmail, or push to Instantly/Smartlead. Rotated with per-inbox daily caps." /></div><button className="primary" onClick={openNew}>Add inbox</button></div>
    {f && <Modal title={editId ? "Edit sending inbox" : "Add sending inbox"} width={620} onClose={close} footer={<><button className="primary" onClick={save}>Save inbox</button><button className="ghost" onClick={close}>Cancel</button></>}>
      <div className="grid two"><div className="field"><label className="fld">Label</label><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label className="fld">Method</label><select value={f.method} disabled={!!editId} onChange={(e) => setF({ ...f, method: e.target.value, config: {} })}><option value="smtp">SMTP</option><option value="gmail_api">Gmail API (OAuth)</option><option value="instantly">Instantly (push)</option><option value="smartlead">Smartlead (push)</option></select></div></div>
      <div className="grid two"><div className="field"><label className="fld">From name</label><input value={f.from_name} onChange={(e) => setF({ ...f, from_name: e.target.value })} /></div>
        <div className="field"><label className="fld">From email</label><input value={f.from_email} onChange={(e) => setF({ ...f, from_email: e.target.value })} /></div></div>
      <div className="grid two"><div className="field"><label className="fld">Daily cap</label><input type="number" value={f.daily_cap} onChange={(e) => setF({ ...f, daily_cap: parseInt(e.target.value, 10) || 30 })} /></div>
        <div className="field" style={{ display: "flex", alignItems: "flex-end" }}><label style={{ fontSize: 14 }}><input type="checkbox" checked={f.warmup} onChange={(e) => setF({ ...f, warmup: e.target.checked })} /> Already warmed up</label></div></div>
      <div className="grid two">{(METHOD_FIELDS[f.method] || []).map(([k, label]) => <div className="field" key={k}><label className="fld">{label}</label><input placeholder={editId ? "leave blank to keep" : ""} value={f.config[k] || ""} onChange={(e) => setCfg(k, e.target.value)} /></div>)}</div>
    </Modal>}
    <div className="card"><h2>Your inboxes</h2>
      {accounts === null ? <div className="hint">Loading…</div> : accounts.length === 0 ? <div className="empty">No sending accounts yet.</div> : <div className="list">{accounts.map((a) => {
        const pct = a.daily_cap ? Math.min(100, Math.round(a.sent_today / a.daily_cap * 100)) : 0;
        return <div className="list-row" key={a.id}><div style={{ flex: 1 }}><div className="title">{a.name} <span className="tag">{a.method}</span> {a.status !== "active" && <span className="badge gray">paused</span>} {a.owned ? <span className="badge brand">tracking</span> : <span className="badge gray">platform</span>}</div><div className="meta">{a.from_email || "—"} · {a.sent_today}/{a.daily_cap} today · keys: {a.config_keys.join(", ") || "none"}</div></div>
          <div className="capbar"><i style={{ width: pct + "%" }} /></div>
          <button className="sm" onClick={() => test(a.id)}>Test</button><button className="sm" onClick={() => toggle(a)}>{a.status === "active" ? "Pause" : "Enable"}</button><button className="sm" onClick={() => edit(a)}>Edit</button><button className="sm danger" onClick={() => del(a.id)}>Delete</button></div>;
      })}</div>}
    </div>
    <div className="card"><h2>Domain deliverability check</h2><div className="sub">Check SPF, DMARC and MX for a sending domain.</div>
      <div className="row"><input style={{ maxWidth: 260 }} placeholder="yourdomain.com" value={dns.domain} onChange={(e) => setDns({ ...dns, domain: e.target.value })} /><input style={{ maxWidth: 200 }} placeholder="DKIM selector (optional)" value={dns.selector} onChange={(e) => setDns({ ...dns, selector: e.target.value })} /><button className="primary" onClick={checkDns}>Check</button></div>
      {dns.result && <div className="list" style={{ marginTop: 12 }}>{["spf", "dmarc", "mx", "dkim"].filter((k) => dns.result[k]).map((k) => { const r = dns.result[k]; return <div className="list-row" key={k}><div style={{ flex: 1 }}><div className="title">{k.toUpperCase()} {r.found ? <span className="badge ok">found</span> : <span className="badge fail">missing</span>}</div>{r.value && <div className="meta mono" style={{ wordBreak: "break-all" }}>{r.value}</div>}{r.records && <div className="meta mono">{r.records.join(", ")}</div>}</div></div>; })}</div>}
    </div></>;
}

function Deliverability() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/appsettings").then(setS).catch(() => {}); }, []);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => { setMsg("Saving…"); try { await api("/api/appsettings", { method: "PUT", body: s }); setMsg("Saved."); toast("Saved"); } catch (e) { setMsg(e.message); } };
  if (!s) return <div className="empty">Loading…</div>;
  const numDef = (k, d) => (s[k] ?? d);
  return <><Head t="Deliverability" s="Protect your sender reputation. These apply to your own inboxes (SMTP/Gmail)." />
    <div className="card">
      <h2>Warmup</h2><div className="sub">New inboxes (flagged “Warmed up = off”) ramp their daily cap gradually instead of starting at full volume.</div>
      <div className="grid two">
        <div className="field"><label className="fld">Starting daily cap</label><input type="number" value={numDef("warmup_base", "8")} onChange={(e) => set("warmup_base", e.target.value)} /></div>
        <div className="field"><label className="fld">Increase per day</label><input type="number" value={numDef("warmup_step", "6")} onChange={(e) => set("warmup_step", e.target.value)} /></div>
      </div>
    </div>
    <div className="card">
      <h2>Volume &amp; bounces</h2>
      <div className="field"><label className="fld">Per-domain daily send cap (0 = off)</label><input type="number" value={numDef("per_domain_daily_cap", "0")} onChange={(e) => set("per_domain_daily_cap", e.target.value)} /><div className="hint" style={{ marginTop: 4 }}>Total across all inboxes on the same sending domain — mailbox providers throttle by domain, not just by inbox.</div></div>
      <div className="field"><label className="fld">Auto-pause an inbox at bounce rate</label><input type="number" step="0.01" min="0" max="1" value={numDef("bounce_pause_rate", "0.08")} onChange={(e) => set("bounce_pause_rate", e.target.value)} /><div className="hint" style={{ marginTop: 4 }}>e.g. 0.08 = pause once 8% of the day's sends bounce (after ≥20 sends). Bounces auto-suppress the address.</div></div>
    </div>
    <div className="card">
      <h2>Send guards</h2>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, marginBottom: 10 }}><input type="checkbox" style={{ marginTop: 3 }} checked={s.require_dmarc === "1"} onChange={(e) => set("require_dmarc", e.target.checked ? "1" : "0")} /><span><b>Don't send from a domain without a DMARC record</b><div className="hint">Blocks sends whose from-domain has no <span className="mono">_dmarc</span> TXT record.</div></span></label>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}><input type="checkbox" style={{ marginTop: 3 }} checked={s.block_spammy_sends === "1"} onChange={(e) => set("block_spammy_sends", e.target.checked ? "1" : "0")} /><span><b>Block spammy-looking emails</b><div className="hint">Runs the spam lint at send time and blocks anything scoring above the threshold.</div></span></label>
      <div className="field" style={{ marginTop: 10 }}><label className="fld">Spam block threshold (0–100)</label><input type="number" value={numDef("spam_block_threshold", "55")} onChange={(e) => set("spam_block_threshold", e.target.value)} style={{ maxWidth: 140 }} /></div>
    </div>
    <div className="card">
      <h2>Outbound webhook</h2><div className="sub">POSTed on reply, meeting, bounce and inbox-paused events — point it at Zapier/Make/n8n or your CRM.</div>
      <input placeholder="https://hooks.zapier.com/…" value={s.outbound_webhook_url || ""} onChange={(e) => set("outbound_webhook_url", e.target.value)} />
    </div>
    <div className="row"><button className="primary" onClick={save}>Save</button><span className="hint">{msg}</span></div></>;
}

// Sample content for previewing a design template client-side (server fills these per-lead at send time).
const DESIGN_SAMPLE = {
  content: `<p style="margin:0 0 14px;">Hi Sarah,</p><p style="margin:0 0 14px;">Pulled up Bright Dental on my phone this morning and it took a while to load and needed pinching to read.</p><p style="margin:0 0 14px;">Want a quick 90-second video of what I'd change?</p><p style="margin:0 0 14px;">— Alex</p>`,
  subject: "your website on mobile",
  preheader: "A quick note about your site",
  brand_name: (window.__brand && window.__brand.name) || "Your workspace",
  brand_primary: (window.__brand && window.__brand.primary) || "#1c97e6",
  brand_secondary: (window.__brand && window.__brand.secondary) || "#0b6fb8",
  logo_url: "/logo.svg",
  booking_link: "#",
  unsubscribe_url: "#",
  unsubscribe_block: ' · <a href="#" style="color:#8993a4;">Unsubscribe</a>',
  year: String(new Date().getFullYear()),
};
function renderDesignPreview(html) {
  return String(html || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in DESIGN_SAMPLE ? DESIGN_SAMPLE[k] : m));
}
function Templates() {
  const [list, setList] = useState(null);
  const [ed, setEd] = useState(null); // {id?, name, html}
  const load = () => api("/api/templates").then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!ed.name.trim()) { toast("Name required"); return; }
    if (!/\{\{\s*content\s*\}\}/.test(ed.html || "")) { toast("Design must include a {{content}} placeholder"); return; }
    try { if (ed.id) await api(`/api/templates/${ed.id}`, { method: "PUT", body: ed }); else await api("/api/templates", { method: "POST", body: ed }); toast("Saved"); setEd(null); load(); }
    catch (e) { toast(e.message); }
  };
  const del = async (id) => { if (!confirm("Delete this design? Campaigns using it revert to plain text.")) return; try { await api(`/api/templates/${id}`, { method: "DELETE" }); load(); } catch (e) { toast(e.message); } };
  const starter = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #dfe1e6;border-radius:8px;">
      <tr><td style="padding:28px;font-family:Arial,sans-serif;font-size:15px;color:#172b4d;">
        {{content}}
      </td></tr>
      <tr><td style="padding:16px 28px;font-size:12px;color:#8993a4;border-top:1px solid #dfe1e6;">{{brand_name}}{{unsubscribe_block}}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  return <><div className="row" style={{ alignItems: "flex-start" }}><div style={{ flex: 1 }}><Head t="Email designs" s="Emails send as plain text by default (best for deliverability). Add an HTML design here to give an email a branded look — a campaign can opt into one under Sending. The design must contain a {{content}} placeholder where the body is inserted; you can also use {{subject}}, {{preheader}}, {{brand_name}}, {{brand_primary}}, {{booking_link}} and {{unsubscribe_block}}." /></div><button className="primary" onClick={() => setEd({ name: "", html: starter })}>Add design</button></div>
    {ed && <Modal title={ed.id ? "Edit design" : "New design"} width={980} onClose={() => setEd(null)} footer={<><button className="primary" onClick={save}>Save design</button><button className="ghost" onClick={() => setEd(null)}>Cancel</button></>}>
      <div className="field"><label className="fld">Name</label><input autoFocus value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} placeholder="e.g. Branded header" /></div>
      <div className="row" style={{ alignItems: "stretch", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="fld">HTML</label>
          <textarea rows={20} style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre", overflowWrap: "normal" }} value={ed.html || ""} onChange={(e) => setEd({ ...ed, html: e.target.value })} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="fld">Live preview</label>
          <iframe title="preview" style={{ width: "100%", height: 428, border: "1px solid var(--rule)", borderRadius: 6, background: "#fff" }} srcDoc={renderDesignPreview(ed.html)} />
        </div>
      </div>
    </Modal>}
    {list === null ? <div className="empty">Loading…</div> : !list.length ? <div className="empty">No designs yet. Emails send as plain text.</div> : <div className="dgrid">{list.map((t) => (
      <div className="dcard" key={t.id}>
        <div className="dcard-preview"><iframe title={t.name} tabIndex={-1} scrolling="no" srcDoc={renderDesignPreview(t.html)} /></div>
        <div className="dcard-foot"><div className="title" style={{ flex: 1 }}>{t.name}</div>
          <button className="sm" onClick={() => setEd({ id: t.id, name: t.name, html: t.html || "" })}>Edit</button>
          <button className="sm danger" onClick={() => del(t.id)}>Delete</button></div>
      </div>
    ))}</div>}</>;
}

function ReportAi() {
  const [prompts, setPrompts] = useState([]);
  const [def, setDef] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/appsettings").then((s) => { setPrompts(s.report_ai_prompts || []); setDef(s.report_ai_prompt_default || ""); }).catch(() => {}); }, []);
  const upd = (i, k, v) => setPrompts(prompts.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const add = () => setPrompts([...prompts, { id: "p" + Date.now(), name: "New type", prompt: def }]);
  const del = (i) => setPrompts(prompts.filter((_, j) => j !== i));
  const save = async () => { setMsg("Saving…"); try { await api("/api/appsettings", { method: "PUT", body: { report_ai_prompts: prompts.filter((p) => (p.name || "").trim()) } }); setMsg("Saved."); toast("Saved"); } catch (e) { setMsg(e.message); } };
  return <><div className="row" style={{ alignItems: "flex-start" }}><div style={{ flex: 1 }}><Head t="Report AI" s="Define your own report “types”. Each is a prompt for how the AI should write an audit. In a report you pick a type (plus optional extra comments) and click Rewrite — the app injects the site findings + PageSpeed and enforces the output format automatically." /></div><button className="primary" onClick={add}>Add type</button></div>
    {prompts.length === 0 && <div className="empty">No types yet. Click “Add type”.</div>}
    {prompts.map((p, i) => (
      <div className="card" key={p.id}>
        <div className="row" style={{ marginBottom: 10 }}><input style={{ maxWidth: 300, fontWeight: 600 }} value={p.name} onChange={(e) => upd(i, "name", e.target.value)} placeholder="Type name (e.g. Professional, Hard sell)" /><span className="spacer" /><button className="sm ghost" onClick={() => upd(i, "prompt", def)}>Use default text</button><button className="sm danger" onClick={() => del(i)}>Delete</button></div>
        <textarea rows={10} style={{ fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.6 }} value={p.prompt} onChange={(e) => upd(i, "prompt", e.target.value)} placeholder="How should the AI write this report?" />
      </div>
    ))}
    <div className="row"><button className="primary" onClick={save}>Save types</button><span className="hint">{msg}</span></div></>;
}

function Automation() {
  const base = apiBase || location.origin;
  const urlRow = (label, url, hint) => (
    <div className="field"><label className="fld">{label}</label>
      <input readOnly className="mono" style={{ fontSize: 12 }} onFocus={(e) => e.target.select()} value={url} />
      {hint && <div className="hint" style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  );
  return <><Head t="Automation" s="The API runs the pipeline itself (built-in scheduler). These endpoints are for external cron and calendar/booking tools." />
    <div className="card">
      <h2>Scheduler</h2>
      <div className="sub">The API ticks the pipeline automatically. To use external cron instead, set <span className="mono">SCHEDULER=off</span> and hit the URL below every few minutes (or run <span className="mono">npm run tick</span>).</div>
      {urlRow("Cron tick URL", `${base}/cron/tick?token=YOUR_CRON_TOKEN`, <>Replace <span className="mono">YOUR_CRON_TOKEN</span> with the <span className="mono">CRON_TOKEN</span> from your API <span className="mono">.env</span>.</>)}
    </div>
    <div className="card">
      <h2>Calendar &amp; booking webhooks</h2>
      <div className="sub">Point your booking tool's webhook at the matching URL so booked meetings auto-mark the customer as “meeting”. Uses the same <span className="mono">CRON_TOKEN</span>.</div>
      {urlRow("Calendly (invitee.created)", `${base}/webhook/calendly?token=YOUR_CRON_TOKEN`)}
      {urlRow("Cal.com (BOOKING_CREATED)", `${base}/webhook/calcom?token=YOUR_CRON_TOKEN`)}
      {urlRow("Generic (any tool / Zapier — pass ?email=)", `${base}/webhook/meeting?token=YOUR_CRON_TOKEN&email=EMAIL`)}
    </div></>;
}
