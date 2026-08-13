import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, toast } from "../api.js";
import { Icon } from "../icons.jsx";
import Modal from "../components/Modal.jsx";
import DeliverySettings from "../components/DeliverySettings.jsx";
import FlowCanvas, { classicStarterGraph, useBlockPalette } from "./FlowCanvas.jsx";

// Full-screen flow builder — deliberately rendered OUTSIDE the app Shell (no
// sidebar, no dashboard chrome). A flow campaign lives entirely on this page;
// the classic campaign form never shows flow UI and this page never shows
// classic UI — the two are completely separate experiences.
export default function FlowBuilder() {
  const [sp] = useSearchParams();
  const id = sp.get("id");
  if (!id) return <NewFlowForm />;
  return <FlowBuilderEditor id={id} />;
}

function NewFlowForm() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    if (!name.trim() || !industry.trim() || !city.trim()) { setErr("Name, industry and city are required"); return; }
    setBusy(true); setErr("");
    try {
      const flowRow = await api("/api/flows", { method: "POST", body: { name: `${name} — flow`, graph: classicStarterGraph() } });
      const camp = await api("/api/campaigns", { method: "POST", body: { name, industry, city, flow_id: flowRow.id } });
      nav(`/flow?id=${camp.id}`, { replace: true });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="flow-page">
      <div className="flow-topbar">
        <button className="back-btn" onClick={() => nav("/")} aria-label="Back">{Icon.back}</button>
        <b>New flow campaign</b>
      </div>
      <div className="flow-center">
        <div className="card flow-center-card">
          <h2>Build a custom flow</h2>
          <div className="sub" style={{ marginBottom: 18 }}>Wire your own source → audit → draft → send sequence, with branches. This is a separate experience from the classic pipeline and can't be switched back after creating it.</div>
          <div className="field"><label className="fld">Campaign name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Austin dentists — Q3" autoFocus /></div>
          <div className="grid two">
            <div className="field"><label className="fld">Industry</label><input value={industry} onChange={(e) => setIndustry(e.target.value)} /></div>
            <div className="field"><label className="fld">City</label><input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          </div>
          {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="primary" disabled={busy} onClick={create} style={{ width: "100%", justifyContent: "center" }}>{busy ? "Creating…" : "Create & open builder"}</button>
        </div>
      </div>
    </div>
  );
}

function FlowBuilderEditor({ id }) {
  const cid = Number(id);
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [flowGraph, setFlowGraph] = useState(null);
  const [liveGraph, setLiveGraph] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [accounts, setAccounts] = useState({ all: [], assigned: new Set() });
  const palette = useBlockPalette();

  useEffect(() => { api("/api/ai/providers").then((p) => setProviders(["template", ...p.available])).catch(() => setProviders(["template"])); }, []);
  useEffect(() => { api("/api/templates").then(setDesigns).catch(() => setDesigns([])); }, []);
  useEffect(() => { api(`/api/campaigns/${cid}/accounts`).then((a) => setAccounts({ all: a.all, assigned: new Set(a.assigned) })).catch(() => {}); }, [cid]);
  const toggleAccount = (aid) => setAccounts((a) => { const s = new Set(a.assigned); s.has(aid) ? s.delete(aid) : s.add(aid); return { ...a, assigned: s }; });

  useEffect(() => {
    (async () => {
      const d = await api(`/api/campaigns/${cid}`);
      if (!d.flow_id) { nav(`/campaign?id=${cid}`, { replace: true }); return; }
      setC(d); setName(d.name);
      const flowRow = await api(`/api/flows/${d.flow_id}`);
      setFlowGraph(flowRow.graph);
    })().catch((e) => toast(e.message));
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCampaignField = (k, v) => setC((s) => ({ ...s, [k]: v }));

  const saveName = async () => {
    if (!name.trim()) { setName(c.name); return; }
    if (name === c.name) return;
    try { await api(`/api/campaigns/${cid}`, { method: "PUT", body: { name } }); setC((s) => ({ ...s, name })); }
    catch (e) { toast(e.message); setName(c.name); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/campaigns/${cid}`, {
        method: "PUT",
        body: {
          industry: c.industry, city: c.city, source_provider: c.source_provider,
          min_reviews: +c.min_reviews || 0, leads_per_run: +c.leads_per_run || 0,
          ai_provider: c.ai_provider, ai_model: c.ai_model, sender_name: c.sender_name, pitch_rules: c.pitch_rules,
          sending_enabled: c.sending_enabled, track_opens: c.track_opens, track_clicks: c.track_clicks, attach_report_pdf: c.attach_report_pdf,
          include_unsubscribe: c.include_unsubscribe, email_template_id: c.email_template_id, timezone: c.timezone,
          send_start_hour: +c.send_start_hour || 0, send_end_hour: +c.send_end_hour || 24, send_weekdays_only: c.send_weekdays_only,
          send_gap_min_sec: +c.send_gap_min_sec || 120, send_gap_max_sec: +c.send_gap_max_sec || 600,
        },
      });
      await api(`/api/campaigns/${cid}/accounts`, { method: "PUT", body: { account_ids: [...accounts.assigned] } });
      if (liveGraph) await api(`/api/flows/${c.flow_id}`, { method: "PUT", body: { graph: liveGraph } });
      toast("Saved");
    } catch (e) { toast(e.message); }
    setSaving(false);
  };

  const run = async () => {
    try { await api(`/api/campaigns/${cid}/run`, { method: "POST" }); toast("Queued — running the flow"); await api("/api/tick", { method: "POST", body: { max: 5 } }); }
    catch (e) { toast(e.message); }
  };

  if (!c || !flowGraph) return <div className="flow-page"><div className="empty">Loading…</div></div>;

  return (
    <div className="flow-page">
      <div className="flow-topbar">
        <button className="back-btn" onClick={() => nav("/")} aria-label="Back">{Icon.back}</button>
        <input className="flow-title-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
        <span className="badge brand">Flow</span>
        <span className="spacer" />
        <button className="sm" onClick={() => setSettingsOpen(true)}>{Icon.settings} Settings</button>
        <button className="sm" onClick={run}>{Icon.play} Run</button>
        <button className="primary sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
      <div className="flow-body">
        <FlowCanvas initialGraph={flowGraph} palette={palette} campaign={c} setCampaignField={setCampaignField} providers={providers} onChange={setLiveGraph} campaignId={cid} designs={designs} accounts={accounts} onToggleAccount={toggleAccount} />
      </div>
      {settingsOpen && (
        <Modal title="Campaign settings" onClose={() => setSettingsOpen(false)} width={680}>
          <DeliverySettings campaignId={cid} emailsPerDay={c.emails_per_day} onEmailsPerDayChange={(v) => setCampaignField("emails_per_day", v)} />
        </Modal>
      )}
    </div>
  );
}
