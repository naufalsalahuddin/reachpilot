import React, { useEffect, useState } from "react";
import { api, toast } from "../api.js";

// Everything about a campaign that ISN'T "which blocks run in what order" and
// isn't sending-mechanics (that lives on the flow builder's Send block now) —
// used by the flow builder's Settings modal.
export default function DeliverySettings({ campaignId, emailsPerDay, onEmailsPerDayChange }) {
  const [subjects, setSubjects] = useState([]);
  const [steps, setSteps] = useState([]);
  const [booking, setBooking] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const d = await api(`/api/campaigns/${campaignId}`);
      setBooking(d.booking_link || "");
      api(`/api/campaigns/${campaignId}/subjects`).then(setSubjects);
      api(`/api/campaigns/${campaignId}/sequence`).then(setSteps);
      api(`/api/campaigns/${campaignId}/stats`).then(setStats);
    })().catch((e) => toast(e.message));
  }, [campaignId]);

  const saveSubjects = async () => { try { await api(`/api/campaigns/${campaignId}/subjects`, { method: "PUT", body: { variants: subjects } }); toast("Subjects saved"); api(`/api/campaigns/${campaignId}/subjects`).then(setSubjects); } catch (e) { toast(e.message); } };
  const saveSequence = async () => { try { const s = steps.map((st, i) => ({ ...st, step_no: i + 2 })); await api(`/api/campaigns/${campaignId}/sequence`, { method: "PUT", body: { steps: s } }); toast("Sequence saved"); } catch (e) { toast(e.message); } };
  const saveBooking = async () => { try { await api(`/api/campaigns/${campaignId}`, { method: "PUT", body: { booking_link: booking } }); toast("Saved"); } catch (e) { toast(e.message); } };
  const saveGeneral = async () => { try { await api(`/api/campaigns/${campaignId}`, { method: "PUT", body: { emails_per_day: +emailsPerDay || 0 } }); toast("Saved"); } catch (e) { toast(e.message); } };

  return (
    <div>
      <div className="card">
        <h2>General</h2>
        <div className="field"><label className="fld">Target emails per day</label><input type="number" value={emailsPerDay} onChange={(e) => onEmailsPerDayChange(e.target.value)} style={{ maxWidth: 160 }} /></div>
        <button className="sm" onClick={saveGeneral}>Save</button>
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
    </div>
  );
}
