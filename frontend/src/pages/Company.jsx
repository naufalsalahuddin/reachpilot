import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiBase, toast, fmtDateTime } from "../api.js";
import TagInput from "../components/TagInput.jsx";

const TLLABEL = { audit: "Audit", draft: "Draft", approved: "Approved", rejected: "Rejected", sent: "Sent", open: "Open", reply: "Reply", note: "Note" };
const shot = (u) => u ? "https://s.wordpress.com/mshots/v1/" + encodeURIComponent(/^https?:\/\//.test(u) ? u : "https://" + u) + "?w=600" : "";

export default function Company() {
  const [sp] = useSearchParams();
  const id = sp.get("id");
  const [d, setD] = useState(null);
  const [form, setForm] = useState({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [tagOptions, setTagOptions] = useState([]);

  const load = async () => {
    try { const data = await api(`/api/companies/${id}`); setD(data); const c = data.company; setForm({ name: c.name || "", email: c.email || "", email_type: c.email_type || "", website: c.website || "", phone: c.phone || "", industry: c.industry || "", street: c.street || "", city: c.city || "", state: c.state || "", postal_code: c.postal_code || "", country: c.country || "", tags: c.tags || "", contract_value: c.contract_value || "", status: c.status }); }
    catch (e) { setD({ error: e.message }); }
  };
  useEffect(() => { load(); api("/api/companies/tags").then(setTagOptions).catch(() => {}); }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const saveStatus = async (v) => { set("status", v); try { await api(`/api/companies/${id}`, { method: "PUT", body: { status: v } }); toast("Status updated"); } catch (e) { toast(e.message); } };
  const saveDetails = async () => {
    if (!form.name.trim()) { setMsg("Business name can't be empty."); return; }
    setMsg("Saving…");
    try { await api(`/api/companies/${id}`, { method: "PUT", body: { ...form, contract_value: form.contract_value || null } }); setMsg("Saved."); toast("Saved"); load(); }
    catch (e) { setMsg(e.message); }
  };
  const addNote = async () => { if (!note.trim()) { toast("Write a note first"); return; } try { await api(`/api/companies/${id}/notes`, { method: "POST", body: { body: note } }); setNote(""); toast("Note added"); load(); } catch (e) { toast(e.message); } };
  const restore = async () => {
    try {
      const r = await api(`/api/companies/${id}/restore`, { method: "POST" });
      toast(`Restored — ${r.suppressionRemoved} suppression entr${r.suppressionRemoved === 1 ? "y" : "ies"} cleared, ${r.sendsRequeued} send${r.sendsRequeued === 1 ? "" : "s"} re-queued`);
      load();
    } catch (e) { toast(e.message); }
  };

  if (!d) return <div className="empty">Loading…</div>;
  if (d.error) return <div className="err">{d.error}</div>;
  const c = d.company;

  return (
    <>
      <Link className="btn sm ghost" to="/companies" style={{ marginBottom: 14 }}>‹ All customers</Link>
      <div className="grid two" style={{ alignItems: "start" }}>
        <div>
          <div className="card">
            <div className="row"><h2 style={{ fontSize: 19 }}>{c.name}</h2><span className="spacer" />
              <select style={{ width: "auto" }} value={form.status} onChange={(e) => saveStatus(e.target.value)}>{d.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div className="sub" style={{ margin: "6px 0 12px" }}>{c.website && <a href={c.website} target="_blank" rel="noopener noreferrer">{c.domain || c.website}</a>} {c.platform && <span className="tag">{c.platform}</span>}</div>
            {c.status === "dnc" && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--fail-bg)", border: "1px solid var(--fail)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                <span style={{ flex: 1, fontSize: 13 }}>
                  <b>Blocked from sending</b> — usually a bounce, unsubscribe, or manual block. If the email above was wrong, fix it in Details and save first, then restore.
                </span>
                <button className="sm" onClick={restore}>Restore &amp; resend</button>
              </div>
            )}
            {c.website && <img src={shot(c.website)} alt="homepage" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--rule)", marginBottom: 12, background: "var(--bg)" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            <div className="kv"><span className="k">Reviews</span><span>{c.review_count ? `${c.review_count} (${c.rating ? Number(c.rating).toFixed(1) : "?"}★)` : "—"}</span></div>
            <div className="kv"><span className="k">Email</span><span>{c.email || "—"} {c.email_type && <span className={`tag ${c.email_type}`}>{c.email_type}</span>}</span></div>
          </div>
          <div className="card">
            <h2>Details</h2>
            <div className="field"><label className="fld">Business name</label><input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid two" style={{ gap: 10 }}>
              <div className="field"><label className="fld">Email</label><input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div className="field"><label className="fld">Email type</label><select value={form.email_type} onChange={(e) => set("email_type", e.target.value)}><option value="">—</option>{["personal", "role", "generic"].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div className="grid two" style={{ gap: 10 }}>
              <div className="field"><label className="fld">Website</label><input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></div>
              <div className="field"><label className="fld">Phone</label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            </div>
            <div className="field"><label className="fld">Industry</label><input value={form.industry} onChange={(e) => set("industry", e.target.value)} /></div>
            <label className="fld" style={{ marginBottom: 6 }}>Address</label>
            <div className="field"><input value={form.street} onChange={(e) => set("street", e.target.value)} placeholder="Street" /></div>
            <div className="grid two" style={{ gap: 10 }}>
              <div className="field"><input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" /></div>
              <div className="field"><input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="State / Province" /></div>
            </div>
            <div className="grid two" style={{ gap: 10 }}>
              <div className="field"><input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="Postal / ZIP" /></div>
              <div className="field"><input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" /></div>
            </div>
            <div className="field"><label className="fld">Tags</label><TagInput value={form.tags} onChange={(v) => set("tags", v)} suggestions={tagOptions} /></div>
            <div className="field"><label className="fld">Contract value</label><input type="number" value={form.contract_value} onChange={(e) => set("contract_value", e.target.value)} style={{ maxWidth: 200 }} /></div>
            <button className="primary sm" onClick={saveDetails}>Save details</button> <span className="hint">{msg}</span>
          </div>
          <div className="card">
            <h2>Leads <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>across campaigns</span></h2>
            {d.leads.length ? <div className="list" style={{ boxShadow: "none" }}>{d.leads.map((l) => (
              <div className="list-row" key={l.id}>
                <div style={{ flex: 1 }}><div className="title">{l.campaign_name}</div><div className="meta">status: {l.status}{l.draft_decision ? ` · draft ${l.draft_decision}` : ""}</div></div>
                {l.draft_decision && <span className={`badge ${l.draft_decision === "approved" ? "ok" : l.draft_decision === "rejected" ? "fail" : "gray"}`}>{l.draft_decision}</span>}
                <a className="btn sm ghost" href={`/report?lead=${l.id}`} target="_blank" rel="noopener noreferrer">Report</a>
                {l.draft_id ? <Link className="btn sm" to={`/review?campaign=${l.campaign_id}&draft=${l.draft_id}`}>Open review</Link> : <span className="hint">no draft yet</span>}
              </div>
            ))}</div> : <div className="hint">No campaign leads.</div>}
          </div>
        </div>
        <div className="card">
          <h2>Activity &amp; notes</h2>
          <div className="field" style={{ marginTop: 10 }}><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" /></div>
          <button className="sm" onClick={addNote}>Add note</button>
          <div className="tl" style={{ marginTop: 18 }}>
            {d.timeline.length ? d.timeline.map((e, i) => (
              <div className={`tl-item ${e.type}`} key={i}>
                <div><b style={{ fontSize: 12 }}>{TLLABEL[e.type] || e.type}</b> {e.author && <span className="hint">{e.author}</span>}</div>
                <div style={{ fontSize: 13.5 }}>{e.text}</div>
                <div className="tl-when">{fmtDateTime(e.at)}</div>
              </div>
            )) : <div className="hint">No activity yet.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
