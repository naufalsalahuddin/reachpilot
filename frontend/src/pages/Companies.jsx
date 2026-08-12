import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiBase, fmtDate } from "../api.js";
import { Pager } from "../icons.jsx";

const STATUSES = ["new", "contacted", "opened", "replied", "interested", "meeting", "customer", "lost", "dnc"];
const CLS = { new: "gray", contacted: "brand", opened: "brand", replied: "ok", interested: "ok", meeting: "ok", customer: "ok", lost: "fail", dnc: "fail" };

export default function Companies() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("all");
  const [campaigns, setCampaigns] = useState([]);
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState([]);
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [kpis, setKpis] = useState(null);

  useEffect(() => { api("/api/campaigns").then(setCampaigns).catch(() => {}); api("/api/companies/stats").then(setKpis).catch(() => {}); api("/api/companies/tags").then(setTags).catch(() => {}); }, []);
  const load = async (p = page) => {
    setPage(p);
    const params = new URLSearchParams({ page: p, per: 25, q, status, campaign, tag, sort });
    try { setData(await api(`/api/companies?${params}`)); } catch (e) { setData({ error: e.message }); }
  };
  useEffect(() => { load(1); }, [tag, sort]);

  const exportCsv = () => {
    const params = new URLSearchParams({ q, status, campaign, tag, sort });
    window.location = `${apiBase}/api/companies/export?${params}`;
  };

  return (
    <>
      {kpis && (
        <div className="grid kpi" style={{ marginBottom: 16 }}>
          {[["Total", kpis.total], ["Contacted", kpis.counts.contacted || 0], ["Replied", kpis.counts.replied || 0], ["Customers", kpis.counts.customer || 0]].map(([l, n]) => (
            <div className="kpi-card" key={l}><div className="n">{n}</div><div className="l">{l}</div></div>
          ))}
        </div>
      )}
      <div className="row" style={{ marginBottom: 16 }}>
        <input style={{ width: "auto", minWidth: 220 }} placeholder="Search name, domain, email, city…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(1)} />
        <select style={{ width: "auto" }} value={status} onChange={(e) => { setStatus(e.target.value); }}>
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ width: "auto" }} value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="all">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {tags.length > 0 && <select style={{ width: "auto" }} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>}
        <select style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="">Sort: recent activity</option>
          <option value="no_email">Sort: missing email first</option>
        </select>
        <button className="sm" onClick={() => load(1)}>Search</button>
        <span className="spacer" />
        <button className="sm" onClick={exportCsv}>Export CSV</button>
      </div>

      {!data ? <div className="empty">Loading…</div> : data.error ? <div className="err">{data.error}</div> : !data.total ? (
        <div className="empty">No businesses match. They appear here automatically as campaigns source leads.</div>
      ) : (
        <>
          <div className="list">
            {data.items.map((c) => (
              <div className="list-row" key={c.id} style={{ cursor: "pointer" }} onClick={() => nav(`/company?id=${c.id}`)}>
                <div style={{ flex: 1 }}>
                  <div className="title">{c.name} {c.platform && <span className="tag">{c.platform}</span>} {(c.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4).map((t) => <span className="chip-tag" key={t} style={{ padding: "1px 7px", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setTag(t); }}>{t}</span>)}</div>
                  <div className="meta">{c.domain || c.website || ""}{c.city ? " · " + c.city : ""} · {c.email ? c.email : <span className="badge warn">no email</span>} · {c.campaigns} campaign{c.campaigns !== 1 ? "s" : ""}</div>
                </div>
                <span className={`badge ${CLS[c.status] || "gray"}`} style={{ textTransform: "capitalize" }}>{c.status}</span>
                <span className="hint mono">{fmtDate(c.last_activity)}</span>
              </div>
            ))}
          </div>
          <Pager pages={data.pages} page={data.page} total={data.total} onGo={load} />
        </>
      )}
    </>
  );
}
