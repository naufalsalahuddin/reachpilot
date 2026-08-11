import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function Bar({ label, n, max }) {
  const pct = max ? Math.round((n / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <div style={{ width: 200, fontSize: 13 }}>{label}</div>
      <div style={{ flex: 1, background: "var(--rule-soft)", borderRadius: 6, height: 22, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, minWidth: n ? 2 : 0, height: "100%", background: "var(--brand)" }} />
      </div>
      <div className="mono" style={{ width: 50, textAlign: "right", fontSize: 13 }}>{n}</div>
    </div>
  );
}

export default function Analytics() {
  const [campaign, setCampaign] = useState("all");
  const [campaigns, setCampaigns] = useState([]);
  const [d, setD] = useState(null);

  useEffect(() => { api("/api/campaigns").then(setCampaigns).catch(() => {}); }, []);
  useEffect(() => { setD(null); api(`/api/analytics?campaign=${campaign}`).then(setD).catch((e) => setD({ error: e.message })); }, [campaign]);

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <select style={{ width: "auto" }} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="all">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {!d ? <div className="empty">Loading…</div> : d.error ? <div className="err">{d.error}</div> : (
        <>
          <div className="grid kpi" style={{ marginBottom: 18 }}>
            {[["Reply rate", d.rates.reply_rate + "%"], ["Open rate", d.rates.open_rate + "%"], ["Approval rate", d.rates.approval_rate + "%"], ["Sent", d.sent], ["Replied", d.replied]].map(([l, n]) => (
              <div className="kpi-card" key={l}><div className="n">{n}</div><div className="l">{l}</div></div>
            ))}
          </div>
          <div className="card">
            <h2>Funnel</h2>
            <div style={{ marginTop: 8 }}>{d.funnel.map((f) => <Bar key={f.k} label={f.k} n={f.n} max={d.funnel[0].n} />)}</div>
          </div>

          <div className="card">
            <h2>Sends — last 14 days</h2>
            {d.sends_by_day?.length ? (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140, marginTop: 12, borderBottom: "1px solid var(--rule)", paddingBottom: 4 }}>
                {(() => { const max = Math.max(1, ...d.sends_by_day.map((x) => x.n)); return d.sends_by_day.map((x) => (
                  <div key={x.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }} title={`${x.day}: ${x.n}`}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{x.n || ""}</div>
                    <div style={{ width: "70%", background: "var(--brand)", borderRadius: "4px 4px 0 0", height: `${Math.round((x.n / max) * 100)}%`, minHeight: x.n ? 3 : 0 }} />
                    <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 4 }}>{String(x.day).slice(5)}</div>
                  </div>
                )); })()}
              </div>
            ) : <div className="hint">No sends in the last 14 days.</div>}
          </div>

          {(d.by_hour?.some((x) => x.sent) || d.by_weekday?.some((x) => x.sent)) && (
            <div className="card">
              <h2>Best send times</h2>
              <div className="sub">Reply rate by when the email went out — send more at the hours/days that reply best.</div>
              {(() => {
                const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                const rate = (x) => (x.sent ? Math.round((x.replied / x.sent) * 1000) / 10 : 0);
                const hours = (d.by_hour || []).filter((x) => x.sent);
                const days = (d.by_weekday || []).filter((x) => x.sent);
                const maxH = Math.max(1, ...hours.map(rate));
                const maxD = Math.max(1, ...days.map(rate));
                return <>
                  <div style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 4px" }}>By hour of day</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
                    {hours.map((x) => <div key={x.hour} title={`${x.hour}:00 — ${x.sent} sent, ${rate(x)}% reply`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      <div style={{ width: "70%", minHeight: 2, height: `${Math.round(rate(x) / maxH * 100)}%`, background: "var(--ok)", borderRadius: "3px 3px 0 0" }} />
                      <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 3 }}>{x.hour}</div>
                    </div>)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", margin: "14px 0 6px" }}>By weekday</div>
                  {days.map((x) => <div key={x.dow} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
                    <div style={{ width: 40, fontSize: 12.5 }}>{DOW[x.dow - 1]}</div>
                    <div style={{ flex: 1, background: "var(--rule-soft)", borderRadius: 5, height: 16, overflow: "hidden" }}><div style={{ width: `${Math.round(rate(x) / maxD * 100)}%`, height: "100%", background: "var(--brand)" }} /></div>
                    <div className="mono" style={{ width: 90, textAlign: "right", fontSize: 12 }}>{rate(x)}% · {x.sent} sent</div>
                  </div>)}
                </>;
              })()}
            </div>
          )}

          <div className="card">
            <h2>By campaign</h2>
            {d.by_campaign?.length ? (
              <div className="list" style={{ boxShadow: "none" }}>
                {d.by_campaign.map((c) => (
                  <div className="list-row" key={c.id}>
                    <div style={{ flex: 1 }}><div className="title" style={{ fontSize: 14 }}>{c.name}</div><div className="meta">{c.sent} sent · {c.opened} opened · {c.replied} replied</div></div>
                    <span className="badge brand">{c.sent ? Math.round((c.replied / c.sent) * 1000) / 10 : 0}% reply</span>
                  </div>
                ))}
              </div>
            ) : <div className="hint">No campaigns yet.</div>}
          </div>
          <div className="grid two">
            <div className="card">
              <h2>By hook</h2>
              {d.by_hook.length ? d.by_hook.map((h) => (
                <div className="list-row" key={h.hook_key} style={{ padding: "8px 0", borderColor: "var(--rule-soft)" }}>
                  <div style={{ flex: 1 }}><div className="title" style={{ fontSize: 13.5 }}>{h.hook_key}</div><div className="meta">{h.drafted} drafted · {h.sent} sent</div></div>
                  <span className="badge brand">{h.reply_rate}% reply</span>
                </div>
              )) : <div className="hint">No data yet.</div>}
            </div>
            <div className="card">
              <h2>By platform</h2>
              {d.by_platform.length ? d.by_platform.map((p) => <Bar key={p.platform} label={p.platform} n={p.n} max={d.by_platform[0].n} />) : <div className="hint">No platforms detected yet.</div>}
            </div>
          </div>
          <div className="card">
            <h2>Subject A/B performance</h2>
            {d.by_subject.length ? (
              <div className="list" style={{ boxShadow: "none" }}>
                {d.by_subject.map((s, i) => (
                  <div className="list-row" key={i}><div style={{ flex: 1 }}><div className="title" style={{ fontSize: 13.5 }}>{s.subject}</div><div className="meta">{s.campaign_name} · {s.sent} sent · {s.replied} replied</div></div><span className="badge ok">{s.reply_rate}%</span></div>
                ))}
              </div>
            ) : <div className="hint">Add subject variants on a campaign or in Review to compare them.</div>}
          </div>
        </>
      )}
    </>
  );
}
