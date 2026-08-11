import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const scoreColor = (s) => (s == null ? "var(--muted)" : s >= 90 ? "var(--ok)" : s >= 50 ? "var(--warn)" : "var(--fail)");

function Strategy({ label, r }) {
  if (!r) return null;
  return (
    <div className="card">
      <div className="row"><h2 style={{ margin: 0, textTransform: "capitalize" }}>{label}</h2><span className="spacer" />
        <div style={{ fontSize: 34, fontWeight: 800, color: scoreColor(r.score) }}>{r.score == null ? "?" : r.score}<span style={{ fontSize: 15, color: "var(--muted)" }}>/100</span></div>
      </div>
      {r.error && <div className="err" style={{ marginTop: 6 }}>{r.error}</div>}
      <div className="list" style={{ boxShadow: "none", marginTop: 12 }}>
        {Object.entries(r.metrics || {}).filter(([, v]) => v).map(([k, v]) => (
          <div className="list-row" key={k}><div style={{ flex: 1, fontSize: 13.5 }}>{k}</div><span className="mono">{v}</span></div>
        ))}
      </div>
      {r.opportunities?.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, margin: "16px 0 8px" }}>Top opportunities</h2>
          {r.opportunities.map((o, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule-soft)" }}>
              <div className="row"><b style={{ fontSize: 13.5 }}>{o.title}</b><span className="spacer" />{o.saving && <span className="badge warn">{o.saving}</span>}</div>
              {o.description && <div className="hint" style={{ marginTop: 3 }}>{o.description}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function Pagespeed() {
  const leadId = new URLSearchParams(location.search).get("lead");
  const [meta, setMeta] = useState(null);
  const [ps, setPs] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true); setErr("");
    try { setPs(await api(`/api/leads/${leadId}/pagespeed`, { method: "POST", body: { strategy: "both" } })); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  useEffect(() => { api(`/api/report/${leadId}`).then(setMeta).catch(() => {}); run(); }, [leadId]);

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <div><h2 style={{ fontSize: 18 }}>PageSpeed — {meta?.business || "…"}</h2><div className="hint">{meta?.website}</div></div>
        <span className="spacer" />
        <button className="sm" onClick={run} disabled={busy}>{busy ? "Measuring…" : "Re-run"}</button>
        {meta?.lead_id && <a className="btn sm" href={`/report?lead=${leadId}`}>Back to report</a>}
      </div>
      {busy && !ps ? <div className="empty">Running Lighthouse for mobile + desktop… this can take 10–30s.</div>
        : err ? <div className="err">{err}</div>
        : <div className="grid two" style={{ alignItems: "start" }}><Strategy label="Mobile" r={ps?.mobile} /><Strategy label="Desktop" r={ps?.desktop} /></div>}
    </>
  );
}
