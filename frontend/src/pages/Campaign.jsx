import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, toast, TIMEZONES } from "../api.js";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function Campaign() {
  const [sp] = useSearchParams();
  const id = sp.get("id");
  const nav = useNavigate();
  const [c, setC] = useState({ name: "", industry: "", city: "", emails_per_day: 30, min_reviews: 15, leads_per_run: 60, sender_name: "", source_provider: "google_places", pagespeed_in_audit: 0, ai_provider: "template", ai_model: "", pitch_rules: "" });
  const [providers, setProviders] = useState([]);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(!id);

  // advanced state
  const [sending, setSending] = useState({ sending_enabled: false, track_opens: false, track_clicks: false, attach_report_pdf: false, include_unsubscribe: "", email_template_id: "", timezone: "", send_start_hour: 0, send_end_hour: 24, send_weekdays_only: false, send_gap_min_sec: 120, send_gap_max_sec: 600 });
  const [designs, setDesigns] = useState([]);
  const [accounts, setAccounts] = useState({ all: [], assigned: new Set() });
  const [subjects, setSubjects] = useState([]);
  const [steps, setSteps] = useState([]);
  const [booking, setBooking] = useState("");
  const [stats, setStats] = useState(null);
  const [csv, setCsv] = useState(""); const [importMsg, setImportMsg] = useState(""); const fileRef = useRef();

  useEffect(() => { api("/api/ai/providers").then((p) => setProviders(["template", ...p.available])).catch(() => setProviders(["template"])); }, []);
  useEffect(() => { api("/api/templates").then(setDesigns).catch(() => setDesigns([])); }, []);
  useEffect(() => {
    if (!id) return;
    (async () => {
      const d = await api(`/api/campaigns/${id}`);
      setC({ name: d.name, industry: d.industry, city: d.city, emails_per_day: d.emails_per_day, min_reviews: d.min_reviews, leads_per_run: d.leads_per_run, sender_name: d.sender_name || "", source_provider: d.source_provider || "google_places", pagespeed_in_audit: d.pagespeed_in_audit || 0, ai_provider: d.ai_provider || "template", ai_model: d.ai_model || "", pitch_rules: d.pitch_rules || "" });
      setSending({ sending_enabled: !!d.sending_enabled, track_opens: !!d.track_opens, track_clicks: !!d.track_clicks, attach_report_pdf: !!d.attach_report_pdf, include_unsubscribe: d.include_unsubscribe == null ? "" : (d.include_unsubscribe ? "on" : "off"), email_template_id: d.email_template_id || "", timezone: d.timezone || "", send_start_hour: d.send_start_hour ?? 0, send_end_hour: d.send_end_hour ?? 24, send_weekdays_only: !!d.send_weekdays_only, send_gap_min_sec: d.send_gap_min_sec ?? 120, send_gap_max_sec: d.send_gap_max_sec ?? 600 });
      setBooking(d.booking_link || "");
      api(`/api/campaigns/${id}/accounts`).then((a) => setAccounts({ all: a.all, assigned: new Set(a.assigned) }));
      api(`/api/campaigns/${id}/subjects`).then(setSubjects);
      api(`/api/campaigns/${id}/sequence`).then(setSteps);
      api(`/api/campaigns/${id}/stats`).then(setStats);
      setLoaded(true);
    })().catch((e) => { setMsg(e.message); setLoaded(true); });
  }, [id]);

  const set = (k, v) => setC((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setMsg("Saving…");
    const body = { ...c, emails_per_day: +c.emails_per_day || 0, min_reviews: +c.min_reviews || 0, leads_per_run: +c.leads_per_run || 0 };
    try { if (id) { await api(`/api/campaigns/${id}`, { method: "PUT", body }); setMsg("Saved."); toast("Saved"); } else { const r = await api("/api/campaigns", { method: "POST", body }); nav(`/campaign?id=${r.id}`); } }
    catch (e) { setMsg(e.message); }
  };

  const saveSending = async () => {
    try {
      await api(`/api/campaigns/${id}`, { method: "PUT", body: { ...sending } });
      await api(`/api/campaigns/${id}/accounts`, { method: "PUT", body: { account_ids: [...accounts.assigned] } });
      toast("Sending settings saved");
    } catch (e) { toast(e.message); }
  };
  const toggleAssign = (aid) => setAccounts((a) => { const s = new Set(a.assigned); s.has(aid) ? s.delete(aid) : s.add(aid); return { ...a, assigned: s }; });

  const saveSubjects = async () => { try { await api(`/api/campaigns/${id}/subjects`, { method: "PUT", body: { variants: subjects } }); toast("Subjects saved"); api(`/api/campaigns/${id}/subjects`).then(setSubjects); } catch (e) { toast(e.message); } };
  const saveSequence = async () => { const s = steps.map((st, i) => ({ ...st, step_no: i + 2 })); try { await api(`/api/campaigns/${id}/sequence`, { method: "PUT", body: { steps: s } }); toast("Sequence saved"); } catch (e) { toast(e.message); } };
  const saveBooking = async () => { try { await api(`/api/campaigns/${id}`, { method: "PUT", body: { booking_link: booking } }); toast("Saved"); } catch (e) { toast(e.message); } };

  const importCsv = async () => {
    if (!csv.trim()) { toast("Paste or choose a CSV first"); return; }
    setImportMsg("Importing…");
    try { const r = await api(`/api/campaigns/${id}/import`, { method: "POST", body: { csv } }); setImportMsg(`Queued ${r.parsed} lead(s)${r.skipped ? `, ${r.skipped} skipped` : ""} in ${r.chunks} batch(es).`); setCsv(""); if (fileRef.current) fileRef.current.value = ""; toast("Import queued"); }
    catch (e) { setImportMsg(e.message); }
  };
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setCsv(rd.result); rd.readAsText(f); };

  if (!loaded) return <div className="empty">Loading…</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="field"><label className="fld">Campaign name</label><input value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="Austin dentists — Q3" /></div>
        <div className="grid two"><div className="field"><label className="fld">Industry</label><input value={c.industry} onChange={(e) => set("industry", e.target.value)} /></div>
          <div className="field"><label className="fld">City</label><input value={c.city} onChange={(e) => set("city", e.target.value)} /></div></div>
        <div className="field"><label className="fld">Data source</label>
          <select value={c.source_provider} onChange={(e) => set("source_provider", e.target.value)}>
            <option value="google_places">Google Places — best coverage, includes websites</option>
            <option value="foursquare">Foursquare Places — includes websites</option>
            <option value="yelp">Yelp Fusion — no websites (phone/address only)</option>
          </select>
          <div className="hint" style={{ marginTop: 4 }}>Add the matching key under Integrations, or import a CSV below.</div>
        </div>
        <div className="grid two"><div className="field"><label className="fld">Emails per day</label><input type="number" value={c.emails_per_day} onChange={(e) => set("emails_per_day", e.target.value)} /></div>
          <div className="field"><label className="fld">Min reviews</label><input type="number" value={c.min_reviews} onChange={(e) => set("min_reviews", e.target.value)} /></div></div>
        <div className="grid two"><div className="field"><label className="fld">Leads per run</label><input type="number" value={c.leads_per_run} onChange={(e) => set("leads_per_run", e.target.value)} /></div>
          <div className="field"><label className="fld">Sender name</label><input value={c.sender_name} onChange={(e) => set("sender_name", e.target.value)} /></div></div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
          <input type="checkbox" style={{ marginTop: 3 }} checked={!!c.pagespeed_in_audit} onChange={(e) => set("pagespeed_in_audit", e.target.checked ? 1 : 0)} />
          <span><b>Run PageSpeed Insights during the audit</b><div className="hint" style={{ marginTop: 4 }}>Adds real Lighthouse scores (mobile + desktop) to each audit and feeds them to the AI writer. Slower — best for smaller, high-value runs.</div></span>
        </label>
      </div>

      <div className="card">
        <h2>AI writing</h2>
        <div className="sub">Which model writes the first draft. Falls back to templates if the provider has no key.</div>
        <div className="field"><label className="fld">Writer</label><div className="segmented">{providers.map((p) => <button key={p} type="button" className={c.ai_provider === p ? "active" : ""} onClick={() => set("ai_provider", p)}>{p === "template" ? "Templates" : p}</button>)}</div></div>
        <div className="field"><label className="fld">Model (optional)</label><input value={c.ai_model} onChange={(e) => set("ai_model", e.target.value)} placeholder="leave blank for default" /></div>
        <div className="field"><label className="fld">Pitch rules</label><textarea rows={4} value={c.pitch_rules} onChange={(e) => set("pitch_rules", e.target.value)} placeholder="- Never open with 'I noticed'" /></div>
      </div>
      <div className="row"><button className="primary" onClick={save}>Save campaign</button><span className="hint">{msg}</span></div>

      {id && (
        <>
          <div className="card" style={{ marginTop: 18 }}>
            <h2>Import leads (CSV)</h2>
            <div className="sub">Upload or paste a CSV. First row is a header: <span className="mono">name, website, email, phone, city, reviews</span>. Large files import in batches.</div>
            <div className="row" style={{ marginBottom: 10 }}><input type="file" ref={fileRef} accept=".csv,text/csv" onChange={onFile} /></div>
            <div className="field"><label className="fld">…or paste CSV</label><textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,website,email,city\nAcme Dental,acmedental.com,info@acmedental.com,Austin"} /></div>
            <div className="row"><button className="primary" onClick={importCsv}>Import</button><span className="hint">{importMsg}</span></div>
          </div>

          <div className="card">
            <h2>Sending</h2>
            <div className="sub">When enabled, approving a draft queues it to the assigned inboxes (rotated, capped).</div>
            <label style={{ display: "block", marginBottom: 8 }}><input type="checkbox" checked={sending.sending_enabled} onChange={(e) => setSending({ ...sending, sending_enabled: e.target.checked })} /> Enable sending for this campaign</label>
            <label style={{ display: "block", marginBottom: 8 }}><input type="checkbox" checked={sending.track_opens} onChange={(e) => setSending({ ...sending, track_opens: e.target.checked })} /> Track opens <span className="hint">(off is safer for cold email)</span></label>
            <label style={{ display: "block", marginBottom: 8 }}><input type="checkbox" checked={sending.track_clicks} onChange={(e) => setSending({ ...sending, track_clicks: e.target.checked })} /> Track clicks</label>
            <label style={{ display: "block", marginBottom: 14 }}><input type="checkbox" checked={sending.attach_report_pdf} onChange={(e) => setSending({ ...sending, attach_report_pdf: e.target.checked })} /> Attach the audit PDF to the first email <span className="hint">(generated per lead)</span></label>
            <div className="field"><label className="fld">Unsubscribe link</label>
              <select value={sending.include_unsubscribe} onChange={(e) => setSending({ ...sending, include_unsubscribe: e.target.value })}><option value="">Use workspace default</option><option value="on">Always include</option><option value="off">Remove from this campaign</option></select>
              <div className="hint" style={{ marginTop: 4 }}>Applies to your own inboxes. Removing opt-out can violate <b>CAN-SPAM</b>/<b>GDPR</b>.</div>
            </div>
            <div className="field"><label className="fld">Email design</label>
              <select value={sending.email_template_id} onChange={(e) => setSending({ ...sending, email_template_id: e.target.value })}><option value="">Plain text (recommended for cold email)</option>{designs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <div className="hint" style={{ marginTop: 4 }}>Wraps the body in a branded HTML layout. Manage designs under <b>Settings → Email designs</b>. Plain text usually lands better in cold outreach.</div>
            </div>
            <div className="grid two">
              <div className="field"><label className="fld">Timezone</label><select value={sending.timezone} onChange={(e) => setSending({ ...sending, timezone: e.target.value })}><option value="">(app default)</option>{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field" style={{ display: "flex", alignItems: "flex-end" }}><label style={{ fontSize: 14 }}><input type="checkbox" checked={sending.send_weekdays_only} onChange={(e) => setSending({ ...sending, send_weekdays_only: e.target.checked })} /> Weekdays only</label></div>
            </div>
            <div className="grid two">
              <div className="field"><label className="fld">Send from</label><select value={sending.send_start_hour} onChange={(e) => setSending({ ...sending, send_start_hour: +e.target.value })}>{HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></div>
              <div className="field"><label className="fld">Send until</label><select value={sending.send_end_hour} onChange={(e) => setSending({ ...sending, send_end_hour: +e.target.value })}>{HOURS.map((h) => <option key={h + 1} value={h + 1}>{String(h + 1).padStart(2, "0")}:00</option>)}</select></div>
            </div>
            <label className="fld" style={{ marginBottom: 6 }}>Delay between emails (anti-spam)</label>
            <div className="grid two">
              <div className="field"><label className="fld">Min minutes</label><input type="number" min="0" value={Math.round(sending.send_gap_min_sec / 60)} onChange={(e) => setSending({ ...sending, send_gap_min_sec: (parseInt(e.target.value, 10) || 0) * 60 })} /></div>
              <div className="field"><label className="fld">Max minutes</label><input type="number" min="0" value={Math.round(sending.send_gap_max_sec / 60)} onChange={(e) => setSending({ ...sending, send_gap_max_sec: (parseInt(e.target.value, 10) || 0) * 60 })} /></div>
            </div>
            <div className="hint" style={{ marginBottom: 14 }}>Approved emails aren't sent instantly — each is queued a random gap (min–max) after the previous one, so a batch of approvals trickles out instead of blasting at once.</div>
            <label className="fld">Inboxes to rotate across</label>
            {accounts.all.length ? accounts.all.map((a) => <label key={a.id} style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={accounts.assigned.has(a.id)} onChange={() => toggleAssign(a.id)} /> {a.name} <span className="hint">({a.method}, {a.sent_today}/{a.daily_cap})</span></label>) : <div className="hint">No accounts yet. Add one under Settings → Sending.</div>}
            <div className="row" style={{ marginTop: 12 }}><button className="primary" onClick={saveSending}>Save sending settings</button></div>
          </div>

          <div className="card">
            <h2>A/B subject lines</h2>
            <div className="sub">Rotated evenly on the first email; the app tracks which gets more replies. Use {"{first_name}"}, {"{name}"}, {"{city}"}.</div>
            {subjects.map((s, i) => (
              <div className="row" key={i} style={{ marginBottom: 8 }}>
                <input style={{ flex: 1 }} value={s.subject || ""} onChange={(e) => setSubjects(subjects.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} placeholder="subject variant" />
                <label className="hint"><input type="checkbox" checked={s.active !== 0} onChange={(e) => setSubjects(subjects.map((x, j) => j === i ? { ...x, active: e.target.checked ? 1 : 0 } : x))} /> active</label>
                {(s.sent_count || s.replied_count) ? <span className="hint">{s.sent_count} sent · {s.replied_count} replied</span> : null}
                <button className="sm danger" onClick={() => setSubjects(subjects.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}><button className="sm" onClick={() => setSubjects([...subjects, { subject: "", active: 1 }])}>Add variant</button><button className="primary sm" onClick={saveSubjects}>Save variants</button></div>
          </div>

          <div className="card">
            <h2>Follow-up sequence</h2>
            <div className="sub">Step 1 is the approved email. A reply cancels the rest. Use {"{first_name}"}, {"{name}"}, {"{city}"}.</div>
            {steps.map((st, i) => (
              <div className="card" key={i} style={{ background: "var(--bg)", boxShadow: "none" }}>
                <div className="row"><b>Follow-up {i + 1}</b><span className="spacer" /><label className="hint">days later: <input type="number" style={{ width: 70, display: "inline-block" }} value={st.day_offset || 3} onChange={(e) => setSteps(steps.map((x, j) => j === i ? { ...x, day_offset: +e.target.value || 0 } : x))} /></label><button className="sm danger" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>Remove</button></div>
                <div className="field" style={{ margin: "8px 0 0" }}><label className="fld">Subject</label><input value={st.subject || ""} onChange={(e) => setSteps(steps.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} /></div>
                <div className="field" style={{ marginBottom: 0 }}><label className="fld">Body</label><textarea rows={3} value={st.body || ""} onChange={(e) => setSteps(steps.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} /></div>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}><button className="sm" onClick={() => setSteps([...steps, { step_no: steps.length + 2, day_offset: 3, subject: "", body: "" }])}>Add follow-up</button><button className="primary sm" onClick={saveSequence}>Save sequence</button></div>
          </div>

          <div className="card">
            <h2>Meeting booking</h2>
            <div className="field"><label className="fld">Booking link</label><input value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="https://calendly.com/you/30min" /></div>
            <button className="primary sm" onClick={saveBooking}>Save</button>
          </div>

          {stats && (
            <div className="card"><h2>Sending stats</h2>
              <div className="grid kpi" style={{ marginTop: 10 }}>{[["queued", stats.stats.queued], ["sent", stats.stats.sent], ["opened", stats.stats.opened], ["clicked", stats.stats.clicked], ["replied", stats.stats.replied], ["failed", stats.stats.failed]].map(([k, v]) => <div className="kpi-card" key={k}><div className="n">{v}</div><div className="l">{k}</div></div>)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
