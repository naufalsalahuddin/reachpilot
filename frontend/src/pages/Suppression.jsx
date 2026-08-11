import React, { useEffect, useState } from "react";
import { api, toast, fmtDate } from "../api.js";
import { Pager } from "../icons.jsx";

export default function Suppression() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [text, setText] = useState("");

  const load = async (p = page) => { setPage(p); try { setData(await api(`/api/suppression?page=${p}&per=50&q=${encodeURIComponent(q)}`)); } catch (e) { setData({ error: e.message }); } };
  useEffect(() => { load(1); }, []);

  const add = async () => {
    if (!text.trim()) { toast("Enter emails or domains"); return; }
    try { const r = await api("/api/suppression", { method: "POST", body: { text } }); toast(`Added ${r.added}`); setText(""); load(1); } catch (e) { toast(e.message); }
  };
  const del = async (id) => { try { await api(`/api/suppression/${id}`, { method: "DELETE" }); load(); } catch (e) { toast(e.message); } };

  return (
    <>
      <div className="card">
        <h2>Add to suppression list</h2>
        <div className="sub">One per line — email addresses or whole domains. These are never contacted.</div>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={"a@example.com\nexample.com"} />
        <div className="row" style={{ marginTop: 10 }}><button className="primary sm" onClick={add}>Add</button></div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <input style={{ width: "auto", minWidth: 220 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(1)} />
        <button className="sm" onClick={() => load(1)}>Search</button>
      </div>
      {!data ? <div className="empty">Loading…</div> : data.error ? <div className="err">{data.error}</div> : !data.total ? (
        <div className="empty">Suppression list is empty.</div>
      ) : (
        <>
          <div className="list">
            {data.items.map((s) => (
              <div className="list-row" key={s.id}>
                <div style={{ flex: 1 }}><div className="title mono">{s.value}</div><div className="meta">{s.kind} · {s.reason || ""} · {fmtDate(s.created_at)}</div></div>
                <button className="sm danger" onClick={() => del(s.id)}>Remove</button>
              </div>
            ))}
          </div>
          <Pager pages={data.pages} page={data.page} total={data.total} onGo={load} />
        </>
      )}
    </>
  );
}
