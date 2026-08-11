import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api.js";
import { Pager } from "../icons.jsx";

export default function Archive() {
  const [decision, setDecision] = useState("decided");
  const [campaign, setCampaign] = useState("all");
  const [campaigns, setCampaigns] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => { api("/api/campaigns").then(setCampaigns).catch(() => {}); }, []);
  const load = async (p = page) => { setPage(p); try { setData(await api(`/api/drafts?decision=${decision}&campaign=${campaign}&page=${p}&per=25`)); } catch (e) { setData({ error: e.message }); } };
  useEffect(() => { load(1); }, [decision, campaign]);

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="tabs">
          {[["decided", "Decided"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]].map(([d, l]) => <button key={d} className={decision === d ? "active" : ""} onClick={() => setDecision(d)}>{l}</button>)}
        </div>
        <select style={{ width: "auto" }} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="all">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {!data ? <div className="empty">Loading…</div> : data.error ? <div className="err">{data.error}</div> : !data.total ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        <>
          <div className="list">
            {data.items.map((d) => (
              <div className="list-row" key={d.draft_id}>
                <div style={{ flex: 1 }}>
                  <div className="title">{d.name} <span className="hint">— {d.subject}</span></div>
                  <div className="meta">{d.campaign_name} · {d.email || "no email"} · {fmtDate(d.decided_at)}</div>
                </div>
                <span className={`badge ${d.decision === "approved" ? "ok" : d.decision === "rejected" ? "fail" : "gray"}`}>{d.decision}</span>
                {d.send_status && <span className="tag">{d.send_status}</span>}
                <Link className="btn sm" to={`/review?campaign=${d.campaign_id}&decision=all&draft=${d.draft_id}`}>Open</Link>
              </div>
            ))}
          </div>
          <Pager pages={data.pages} page={data.page} total={data.total} onGo={load} />
        </>
      )}
    </>
  );
}
