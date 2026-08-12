import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, toast } from "../api.js";
import { Icon } from "../icons.jsx";

export default function Dashboard() {
  const [list, setList] = useState(null);
  const [guide, setGuide] = useState(null);
  const [guideHidden, setGuideHidden] = useState(localStorage.getItem("guideHidden") === "1");

  const load = async () => { try { setList(await api("/api/campaigns")); } catch { setList([]); } };
  const loadGuide = async () => { try { setGuide(await api("/api/guide")); } catch { /* ignore */ } };

  useEffect(() => { load(); loadGuide(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);

  const run = async (id) => {
    try { await api(`/api/campaigns/${id}/run`, { method: "POST", body: { stage: "source" } }); toast("Queued: sourcing → audit → draft"); await api("/api/tick", { method: "POST", body: { max: 3 } }); setTimeout(load, 600); }
    catch (e) { toast(e.message); }
  };
  const tickAll = async () => { toast("Processing…"); try { const o = await api("/api/tick", { method: "POST", body: { max: 12 } }); toast(`Ran ${o.claimed} job(s)`); } catch (e) { toast(e.message); } load(); };

  const totals = (list || []).reduce((a, c) => {
    a.leads += Object.values(c.counts || {}).reduce((x, y) => x + y, 0);
    a.pending += c.pending_review || 0; a.sent += c.sends?.sent || 0; a.replied += c.sends?.replied || 0;
    return a;
  }, { leads: 0, pending: 0, sent: 0, replied: 0 });

  return (
    <>
      {guide && !guide.complete && !guideHidden && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Getting started</h2>
            <span className="hint" style={{ marginLeft: 10 }}>{guide.done}/{guide.total} done</span>
            <span className="spacer" />
            <button className="sm ghost" onClick={() => { localStorage.setItem("guideHidden", "1"); setGuideHidden(true); }}>Dismiss</button>
          </div>
          {guide.steps.map((s, i) => {
            const isNext = s.key === guide.next;
            return (
              <div key={s.key} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "9px 0" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "0 0 26px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, ...(s.done ? { background: "var(--ok)", color: "#fff" } : { border: `2px solid ${isNext ? "var(--brand)" : "var(--rule)"}`, color: isNext ? "var(--brand)" : "var(--muted)" }) }}>
                  {s.done ? Icon.check : i + 1}
                </span>
                <div style={{ flex: 1, opacity: s.done ? 0.6 : 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}{isNext && <span className="badge brand" style={{ marginLeft: 6 }}>next</span>}</div>
                  {isNext && <div className="hint" style={{ marginTop: 2 }}>{s.desc}</div>}
                </div>
                {isNext ? <Link className="btn primary sm" to={s.href}>{s.cta}</Link> : (!s.done && <Link className="btn sm ghost" to={s.href}>{s.cta}</Link>)}
              </div>
            );
          })}
        </div>
      )}

      <div className="row" style={{ marginBottom: 18 }}>
        <div className="grid kpi" style={{ flex: 1 }}>
          {[["Leads sourced", totals.leads], ["Waiting for review", totals.pending], ["Emails sent", totals.sent], ["Replies", totals.replied]].map(([l, n]) => (
            <div className="kpi-card" key={l}><div className="n">{n}</div><div className="l">{l}</div></div>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 17 }}>Campaigns</h2><span className="spacer" />
        <button className="sm" onClick={tickAll}>Process jobs now</button>
        <Link className="btn primary sm" to="/campaign">{Icon.plus} New campaign</Link>
      </div>

      {!list ? <div className="empty">Loading…</div> : list.length === 0 ? (
        <div className="empty">No campaigns yet. Create one to start sourcing leads.</div>
      ) : list.map((c) => (
        <div className="card" key={c.id}>
          <div className="row">
            <div>
              <h2>{c.name}</h2>
              <div className="sub" style={{ margin: 0 }}>{c.industry} · {c.city} · {c.emails_per_day}/day · AI: {c.ai_provider === "template" ? "templates" : c.ai_provider} · source: {c.source_provider}{c.active_jobs ? " · running…" : ""}</div>
            </div>
            <span className="spacer" />
            <Link className="btn sm" to={`/campaign?id=${c.id}`}>Edit</Link>
            {c.pending_review ? <Link className="btn sm" to={`/review?campaign=${c.id}`}>Review ({c.pending_review})</Link> : null}
            <button className="sm primary" onClick={() => run(c.id)}>Run</button>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {c.pending_review ? <span className="badge warn">{c.pending_review} pending review</span> : null}
            {(c.stages || []).map((s) => <span className="tag" key={s.key}>{s.n} {s.label}</span>)}
            {!c.stages?.length && <span className="hint">no leads yet</span>}
          </div>
          {c.sends?.total ? (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="tag">{c.sends.queued} queued</span><span className="badge ok">{c.sends.sent} sent</span>
              <span className="badge brand">{c.sends.replied} replied</span>{c.sends.failed ? <span className="badge fail">{c.sends.failed} failed</span> : null}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}
