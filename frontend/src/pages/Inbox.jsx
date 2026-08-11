import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, toast, fmtDateTime } from "../api.js";
import { Pager } from "../icons.jsx";

export default function Inbox() {
  const [status, setStatus] = useState("unread");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [replyTo, setReplyTo] = useState(null); // message id being replied to
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = async (p = page, st = status) => {
    setPage(p);
    try { setData(await api(`/api/inbox?page=${p}&per=25&status=${st}`)); } catch (e) { setData({ error: e.message }); }
  };
  useEffect(() => { load(1, status); }, [status]);

  const act = async (id, action) => { try { await api(`/api/inbox/${id}/action`, { method: "POST", body: { action } }); toast("Done"); load(); } catch (e) { toast(e.message); } };
  const openReply = (m) => { setReplyTo(m.id); setReplyBody(""); };
  const sendReply = async (m) => {
    if (!replyBody.trim()) { toast("Write a reply first"); return; }
    setSending(true);
    try { await api(`/api/inbox/${m.id}/reply`, { method: "POST", body: { body: replyBody } }); toast("Reply sent"); setReplyTo(null); setReplyBody(""); load(); }
    catch (e) { toast(e.message); } finally { setSending(false); }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="tabs">
          {["unread", "read", "archived"].map((s) => <button key={s} className={status === s ? "active" : ""} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
        </div>
      </div>
      {!data ? <div className="empty">Loading…</div> : data.error ? <div className="err">{data.error}</div> : !data.total ? (
        <div className="empty">No {status} replies. Replies from leads land here automatically.</div>
      ) : (
        <>
          <div className="list">
            {data.items.map((m) => {
              const archived = m.status === "archived";
              return (
                <div className="list-row" key={m.id} style={{ flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div className="title">{m.from_email} {m.company_id && <Link to={`/company?id=${m.company_id}`} className="tag">{m.company_name || "company"}</Link>}</div>
                    <div className="meta"><b>{m.subject || "(no subject)"}</b> — {m.snippet || ""}</div>
                    <div className="hint mono">{fmtDateTime(m.received_at)}</div>
                  </div>
                  {archived ? (
                    <button className="sm" onClick={() => act(m.id, "unarchive")}>Unarchive</button>
                  ) : (
                    <>
                      <button className="sm primary" onClick={() => openReply(m)}>Reply</button>
                      <button className="sm" onClick={() => act(m.id, "interested")}>Interested</button>
                      <button className="sm" onClick={() => act(m.id, "not_interested")}>Not interested</button>
                      <button className="sm ghost" onClick={() => act(m.id, "archive")}>Archive</button>
                    </>
                  )}
                  {replyTo === m.id && !archived && (
                    <div style={{ flexBasis: "100%", marginTop: 10 }}>
                      <div className="hint" style={{ marginBottom: 6 }}>Replying to {m.from_email} — sends from the inbox that received it.</div>
                      <textarea rows={4} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Type your reply…" autoFocus />
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="primary sm" disabled={sending} onClick={() => sendReply(m)}>{sending ? "Sending…" : "Send reply"}</button>
                        <button className="ghost sm" onClick={() => setReplyTo(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pager pages={data.pages} page={data.page} total={data.total} onGo={load} />
        </>
      )}
    </>
  );
}
