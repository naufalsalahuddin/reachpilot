import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiBase, toast } from "../api.js";
import { Pager } from "../icons.jsx";

export default function Review() {
  const [sp, setSp] = useSearchParams();
  const [campaign, setCampaign] = useState(sp.get("campaign") || "all");
  const [campaigns, setCampaigns] = useState([]);
  const [decision, setDecision] = useState(sp.get("decision") || "pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(sp.get("draft") ? Number(sp.get("draft")) : null);
  const [providers, setProviders] = useState([]);
  const [presets, setPresets] = useState([]);

  useEffect(() => { api("/api/campaigns").then(setCampaigns).catch(() => {}); api("/api/ai/providers").then((p) => { setProviders(p.available); setPresets(p.presets); }).catch(() => {}); }, []);
  // deep-link: /review?draft=<id> opens that draft's editor directly (survives refresh)
  useEffect(() => { const dp = sp.get("draft"); if (dp) setOpenId(Number(dp)); }, [sp]);
  const openDraft = (id) => { const p = new URLSearchParams(sp); p.set("draft", id); setSp(p, { replace: false }); setOpenId(id); };
  const closeDraft = () => { const p = new URLSearchParams(sp); p.delete("draft"); setSp(p, { replace: true }); setOpenId(null); };

  const load = useCallback(async (p = page) => {
    setPage(p);
    try { setData(await api(`/api/drafts?decision=${decision}&campaign=${campaign}&page=${p}&per=25`)); } catch (e) { setData({ error: e.message }); }
  }, [decision, campaign, page]);
  useEffect(() => { load(1); }, [decision, campaign]);

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <select style={{ width: "auto", minWidth: 200 }} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="all">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="tabs">{[["pending", "Pending"], ["approved", "Approved"], ["all", "All"]].map(([d, l]) => <button key={d} className={decision === d ? "active" : ""} onClick={() => setDecision(d)}>{l}</button>)}</div>
        {data && !data.error && <span className="badge brand">{data.total} {decision}</span>}
        <span className="spacer" />
        <span className="hint">Click a row to read the evidence and edit.</span>
      </div>

      {campaign !== "all" && <AbEditor campaignId={campaign} />}

      {!data ? <div className="empty">Loading…</div> : data.error ? <div className="err">{data.error}</div> : !data.total ? (
        <div className="empty">Nothing to review here.</div>
      ) : (
        <>
          <div className="list">
            {data.items.map((d) => (
              <div className="list-row" key={d.draft_id} style={{ cursor: "pointer" }} onClick={() => openDraft(d.draft_id)}>
                {d.score != null && <span className="badge" title="Lead priority score" style={{ background: d.score >= 80 ? "var(--ok-bg)" : d.score >= 60 ? "var(--warn-bg)" : "var(--rule-soft)", color: d.score >= 80 ? "var(--ok)" : d.score >= 60 ? "var(--warn)" : "var(--muted)", minWidth: 30, justifyContent: "center" }}>{d.score}</span>}
                <div style={{ flex: 1 }}>
                  <div className="title">{d.name} {d.hook_key && <span className="tag">{d.hook_key}</span>} {d.flags_count ? <span className="badge warn">{d.flags_count} flag</span> : null} {d.lint_score >= 45 && <span className="badge fail" title="Email looks spammy">spammy</span>}</div>
                  <div className="meta">{d.subject} · {d.email || "no email"} · {d.city || ""}</div>
                </div>
                {decision !== "pending" && <span className={`badge ${d.decision === "approved" ? "ok" : d.decision === "rejected" ? "fail" : "gray"}`}>{d.decision}</span>}
                {d.send_status && <span className="tag">{d.send_status}</span>}
              </div>
            ))}
          </div>
          <Pager pages={data.pages} page={data.page} total={data.total} onGo={load} />
        </>
      )}

      {openId && <Editor draftId={openId} providers={providers} presets={presets} onClose={closeDraft} onDone={() => { closeDraft(); load(); }} />}
    </>
  );
}

function AbEditor({ campaignId }) {
  const [variants, setVariants] = useState([]);
  const [open, setOpen] = useState(false);
  const load = () => api(`/api/campaigns/${campaignId}/subjects`).then(setVariants).catch(() => setVariants([]));
  useEffect(() => { load(); }, [campaignId]);
  const save = async () => { try { await api(`/api/campaigns/${campaignId}/subjects`, { method: "PUT", body: { variants } }); toast("Variants saved"); load(); } catch (e) { toast(e.message); } };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <h2 style={{ fontSize: 15, margin: 0 }}>A/B subject lines</h2><span className="badge gray" style={{ marginLeft: 8 }}>{variants.length}</span>
        <span className="spacer" /><span className="hint">{open ? "▲ hide" : "▼ edit"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {variants.length === 0 && <div className="hint">No variants — the drafted subject is used. Add a couple and the app rotates them.</div>}
          {variants.map((s, i) => (
            <div className="row" key={i} style={{ marginBottom: 8 }}>
              <input style={{ flex: 1 }} value={s.subject || ""} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} placeholder="subject variant — use {first_name}, {name}, {city}" />
              <label className="hint"><input type="checkbox" checked={s.active !== 0} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, active: e.target.checked ? 1 : 0 } : x))} /> active</label>
              {(s.sent_count || s.replied_count) ? <span className="hint">{s.sent_count} sent · {s.replied_count} replied · {s.reply_rate || 0}%</span> : null}
              <button className="sm danger" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 10 }}><button className="sm" onClick={() => setVariants([...variants, { subject: "", active: 1 }])}>Add variant</button><button className="primary sm" onClick={save}>Save variants</button></div>
        </div>
      )}
    </div>
  );
}

const chip = (state) => <span className={`chip ${state}`}>{state}</span>;

function Editor({ draftId, providers, presets, onClose, onDone }) {
  const [d, setD] = useState(null);
  const [subject, setSubject] = useState("");
  const [preview, setPreview] = useState("");
  const [body, setBody] = useState("");
  const [provider, setProvider] = useState(providers[0] || "template");
  const [busy, setBusy] = useState(false);
  const [ps, setPs] = useState(null);
  const [attachPdf, setAttachPdf] = useState(false);

  useEffect(() => { setProvider(providers[0] || "template"); }, [providers]);
  const insertVar = (v) => setBody((b) => b + v);
  useEffect(() => {
    api(`/api/drafts/${draftId}`).then((data) => { setD(data); setSubject(data.subject); setPreview(data.preview_text || ""); setBody(data.body); setAttachPdf(data.attach_pdf != null ? !!data.attach_pdf : !!data.campaign_attach_default); }).catch((e) => toast(e.message));
  }, [draftId]);

  const decided = d && d.decision !== "pending";
  const aiEdit = async (op) => {
    if (!provider || provider === "template") { toast("Add an AI key to use edits"); return; }
    setBusy(true);
    try { const r = await api("/api/ai/edit", { method: "POST", body: { provider, op, text: body } }); setBody(r.text); toast("Applied"); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const regenerate = async () => { setBusy(true); try { const r = await api(`/api/ai/redraft/${draftId}`, { method: "POST", body: { provider } }); setSubject(r.subject); setBody(r.body); toast("Regenerated"); } catch (e) { toast(e.message); } setBusy(false); };
  const runPs = async () => { setBusy(true); try { const r = await api(`/api/report/${d.lead_id}/pagespeed`, { method: "POST", body: {} }); setPs(r.pagespeed); } catch (e) { toast(e.message); } setBusy(false); };
  const decide = async (dec) => {
    setBusy(true);
    try { const r = await api("/api/decide", { method: "POST", body: { draft_id: draftId, decision: dec, subject, body, preview_text: preview, attach_pdf: attachPdf } }); toast(dec === "approved" ? (r.send?.queued ? `Approved — ${r.send.queued} queued` : "Approved") : "Rejected"); onDone(); }
    catch (e) { toast(e.message); setBusy(false); }
  };
  const save = async () => { setBusy(true); try { await api("/api/decide", { method: "POST", body: { draft_id: draftId, decision: d.decision, subject, body, preview_text: preview, attach_pdf: attachPdf } }); toast("Saved"); onDone(); } catch (e) { toast(e.message); setBusy(false); } };

  const groups = {}; for (const p of presets) (groups[p.group] = groups[p.group] || []).push(p);

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target.classList.contains("modal-bg")) onClose(); }}>
      <div className="modal"><div className="content">
        {!d ? <div className="empty">Loading…</div> : (
          <>
            <div className="row"><h2 style={{ fontSize: 18 }}>{d.name}</h2>{decided && <span className={`badge ${d.decision === "approved" ? "ok" : "fail"}`}>{d.decision}</span>}<span className="spacer" /><button className="ghost" onClick={onClose}>×</button></div>
            <div className="hint" style={{ margin: "4px 0 14px" }}>{d.website && <a href={d.website} target="_blank" rel="noopener noreferrer">{d.website}</a>} · {d.email} {d.email_type && <span className={`tag ${d.email_type}`}>{d.email_type}</span>} · <a href={`/report?lead=${d.lead_id}`} target="_blank" rel="noopener noreferrer">Full report ↗</a>{d.company_id && <> · <a href={`/company?id=${d.company_id}`}>Open customer ↗</a></>}</div>

            <div className="grid two" style={{ alignItems: "start" }}>
              <div>
                <div className="field"><label className="fld">Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
                <div className="field"><label className="fld">Preview text (inbox preheader) {!preview.trim() && <span className="badge warn" style={{ marginLeft: 6 }}>recommended</span>}</label>
                  <input value={preview} onChange={(e) => setPreview(e.target.value)} placeholder="e.g. A quick idea for your booking form" />
                  <div className="hint" style={{ marginTop: 4 }}>{preview.trim() ? "This shows in the inbox right after the subject — a second hook before they open." : "Empty. This is the grey text shown after the subject in the inbox (Gmail/Outlook). Filling it lifts open rates — you can still approve without it."}</div>
                </div>
                <div className="card" style={{ background: "var(--rule-soft)", boxShadow: "none", padding: "10px 12px", marginBottom: 12 }}>
                  <div className="row"><select style={{ width: "auto" }} value={provider} onChange={(e) => setProvider(e.target.value)}><option value="template">no AI</option>{providers.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                    <button className="sm" disabled={busy} onClick={regenerate}>Regenerate</button>
                    <button className="sm" disabled={busy} onClick={runPs}>PageSpeed</button></div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="hint" style={{ marginLeft: 4 }}>Insert:</span>{["{first_name}", "{name}", "{city}", "{industry}"].map((v) => <button key={v} className="sm" onClick={() => insertVar(v)}>{v}</button>)}</div>
                  {Object.entries(groups).map(([g, items]) => (
                    <div className="row" key={g} style={{ marginTop: 8 }}><span className="hint" style={{ width: 70 }}>{g}</span>{items.map((p) => <button key={p.key} className="sm" disabled={busy} onClick={() => aiEdit(p.key)}>{p.label}</button>)}</div>
                  ))}
                </div>
                <div className="field"><label className="fld">Body</label><textarea style={{ minHeight: 230, fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: 16, lineHeight: 1.7 }} value={body} onChange={(e) => setBody(e.target.value)} /></div>
                {d.flags?.length > 0 && <div className="card" style={{ background: "var(--warn-bg)", boxShadow: "none" }}><b style={{ fontSize: 13 }}>Validator flags</b>{d.flags.map((f, i) => <div key={i} className="hint" style={{ color: "var(--warn)" }}>• {f}</div>)}</div>}
                {d.lint && d.lint.flags.length > 0 && <div className="card" style={{ background: d.lint.level === "high" ? "var(--fail-bg)" : "var(--warn-bg)", boxShadow: "none" }}><b style={{ fontSize: 13, color: d.lint.level === "high" ? "var(--fail)" : "var(--warn)" }}>Spam check — {d.lint.score}/100 ({d.lint.level})</b>{d.lint.flags.map((f, i) => <div key={i} className="hint">• {f}</div>)}</div>}
                {ps && <div className="card" style={{ boxShadow: "none" }}><b style={{ fontSize: 13 }}>PageSpeed</b>{["mobile", "desktop"].map((s) => ps[s] && <div key={s} className="hint">{s}: {ps[s].score == null ? (ps[s].error || "?") : ps[s].score + "/100"}</div>)}</div>}
              </div>

              <div>
                {d.lead_id && (
                  <img src={`${apiBase}/api/report/${d.lead_id}/screenshot`} alt="Homepage screenshot"
                    style={{ width: "100%", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 12, background: "var(--bg)" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}
                <div className="card" style={{ boxShadow: "none" }}>
                  <b style={{ fontSize: 13 }}>Evidence</b>
                  {(d.checks || []).map((c, i) => (
                    <div className={`check ${c.state === "PASS" ? "pass" : ""} ${c.key === d.hook_key ? "hook" : ""}`} key={i}>
                      <div>{c.key === d.hook_key && <span className="hooktag">the hook</span>}{chip(c.state)}</div>
                      <div><div className="clabel">{c.label}</div>{(c.detail || c.evidence) && <div className="cev">{c.detail || c.evidence}</div>}</div>
                    </div>
                  ))}
                  {!d.checks?.length && <div className="hint" style={{ marginTop: 6 }}>No stored evidence.</div>}
                </div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <label className="hint" style={{ display: "flex", alignItems: "center", gap: 7 }} title="Attach the lead's audit PDF to this email">
                <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} /> Attach audit PDF to this email
              </label>
              <span className="spacer" />
              {decided ? <button className="primary" disabled={busy} onClick={save}>Save changes</button> : <>
                <button className="primary" disabled={busy} onClick={() => decide("approved")}>Approve</button>
                <button className="danger" disabled={busy} onClick={() => decide("rejected")}>Reject</button>
              </>}
              <button className="ghost" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div></div>
    </div>
  );
}
