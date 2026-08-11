import React, { useEffect, useState } from "react";
import { api, fmtDateTime } from "../api.js";

export default function Status() {
  const [s, setS] = useState(null);
  const load = () => api("/api/status").then(setS).catch((e) => setS({ error: e.message }));
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  if (!s) return <div className="empty">Loading…</div>;
  if (s.error) return <div className="err">{s.error}</div>;

  const tickOk = s.tick_healthy;
  return (
    <>
      <div className="grid kpi" style={{ marginBottom: 18 }}>
        <div className="kpi-card"><div className="n" style={{ color: s.scheduler_on ? "var(--ok)" : "var(--warn)" }}>{s.scheduler_on ? "On" : "Off"}</div><div className="l">Scheduler</div></div>
        <div className="kpi-card"><div className="n" style={{ color: tickOk ? "var(--ok)" : "var(--fail)" }}>{s.last_tick_minutes_ago == null ? "—" : s.last_tick_minutes_ago + "m"}</div><div className="l">Since last tick</div></div>
        <div className="kpi-card"><div className="n">{s.sends_due}</div><div className="l">Sends due now</div></div>
        <div className="kpi-card"><div className="n">{s.sends_queued}</div><div className="l">Sends queued</div></div>
        <div className="kpi-card"><div className="n">{s.pending_review}</div><div className="l">Pending review</div></div>
        <div className="kpi-card"><div className="n">{s.suppression}</div><div className="l">Suppressed</div></div>
      </div>

      {!tickOk && <div className="card" style={{ borderColor: "var(--fail)", background: "var(--fail-bg)" }}><b style={{ color: "var(--fail)" }}>The pipeline isn't ticking.</b> <span className="hint">Nothing has run in {s.last_tick_minutes_ago ?? "∞"} minutes — approvals won't send and replies won't be detected. The API's built-in scheduler should handle this; if it's off, point cron at <span className="mono">/cron/tick</span> or run <span className="mono">npm run tick</span>.</span></div>}

      <div className="card">
        <h2>Sending inboxes</h2>
        {s.accounts.length ? <div className="list" style={{ boxShadow: "none" }}>{s.accounts.map((a) => {
          const pct = a.effective_cap ? Math.min(100, Math.round(a.sent_today / a.effective_cap * 100)) : 0;
          return <div className="list-row" key={a.id}>
            <div style={{ flex: 1 }}><div className="title">{a.name} <span className="tag">{a.method}</span> {a.status !== "active" && <span className="badge fail">{a.status}</span>} {a.warmup && <span className="badge warn">warming</span>}</div>
              <div className="meta">{a.from_email} · {a.sent_today}/{a.effective_cap} today{a.effective_cap !== a.daily_cap ? ` (ramping to ${a.daily_cap})` : ""}{a.bounces_today ? ` · ${a.bounces_today} bounced` : ""}</div></div>
            <div className="capbar" title={`${a.sent_today}/${a.effective_cap}`}><i style={{ width: pct + "%", background: a.bounces_today ? "var(--fail)" : "var(--brand)" }} /></div>
          </div>;
        })}</div> : <div className="hint">No sending inboxes.</div>}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Jobs</h2>
          {Object.keys(s.jobs).length ? Object.entries(s.jobs).map(([k, v]) => (
            <div className="row" key={k} style={{ padding: "4px 0" }}><span style={{ flex: 1, textTransform: "capitalize" }}>{k}</span><span className={`badge ${k === "error" ? "fail" : k === "done" ? "ok" : "gray"}`}>{v}</span></div>
          )) : <div className="hint">No jobs yet.</div>}
        </div>
        <div className="card">
          <h2>Recent job errors</h2>
          {s.failed_jobs.length ? s.failed_jobs.map((j) => (
            <div key={j.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--rule-soft)" }}><div className="title" style={{ fontSize: 13 }}>#{j.id} {j.type}</div><div className="hint" style={{ color: "var(--fail)" }}>{(j.last_error || "").slice(0, 120)}</div><div className="tl-when">{fmtDateTime(j.updated_at)}</div></div>
          )) : <div className="hint">No job errors.</div>}
        </div>
      </div>
    </>
  );
}
