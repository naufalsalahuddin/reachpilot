// Inline SVG icons (never emoji). Stroke inherits currentColor.
const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export const Icon = {
  dashboard: <svg viewBox="0 0 24 24" {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  review: <svg viewBox="0 0 24 24" {...s}><path d="M4 4h16v13H7l-3 3z" /><path d="M8 9h8M8 13h5" /></svg>,
  companies: <svg viewBox="0 0 24 24" {...s}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" /></svg>,
  analytics: <svg viewBox="0 0 24 24" {...s}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  inbox: <svg viewBox="0 0 24 24" {...s}><path d="M4 4h16v16H4z" /><path d="M4 13h5l2 3h2l2-3h5" /></svg>,
  ban: <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></svg>,
  settings: <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 0 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9 2 2 0 0 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1A2 2 0 1 1 7 4.6l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5 2 2 0 0 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1 2 2 0 0 1 0 4 1.7 1.7 0 0 0-1.5 1z" /></svg>,
  archive: <svg viewBox="0 0 24 24" {...s}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>,
  plus: <svg viewBox="0 0 24 24" {...s}><path d="M12 5v14M5 12h14" /></svg>,
  logout: <svg viewBox="0 0 24 24" {...s}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>,
  menu: <svg viewBox="0 0 24 24" {...s}><path d="M3 6h18M3 12h18M3 18h18" /></svg>,
  status: <svg viewBox="0 0 24 24" {...s}><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>,
  check: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>,
  back: <svg viewBox="0 0 24 24" {...s}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>,
  close: <svg viewBox="0 0 24 24" {...s}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  play: <svg viewBox="0 0 24 24" {...s}><path d="M6 4l14 8-14 8V4z" /></svg>,
  grip: <svg viewBox="0 0 24 24" {...s} strokeWidth={2.4}><path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" /></svg>,
  // flow block icons
  blockSource: <svg viewBox="0 0 24 24" {...s}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  blockAudit: <svg viewBox="0 0 24 24" {...s}><rect x="6" y="4" width="12" height="17" rx="1.5" /><path d="M9 3h6v3H9zM9 12l2 2 4-4" /></svg>,
  blockPagespeed: <svg viewBox="0 0 24 24" {...s}><path d="M4 15a8 8 0 1 1 16 0" /><path d="M12 15l3.5-4.5" /><path d="M12 15h.01" /></svg>,
  blockEmail: <svg viewBox="0 0 24 24" {...s}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /><circle cx="17.5" cy="16.5" r="3" /><path d="M18.6 17.6L17.5 16.5" /></svg>,
  blockAi: <svg viewBox="0 0 24 24" {...s}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>,
  blockPdf: <svg viewBox="0 0 24 24" {...s}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></svg>,
  blockReview: <svg viewBox="0 0 24 24" {...s}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  blockSend: <svg viewBox="0 0 24 24" {...s}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  blockBranch: <svg viewBox="0 0 24 24" {...s}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8.2 7l7.5 3.8M8.2 17l7.5-3.8" /></svg>,
  upload: <svg viewBox="0 0 24 24" {...s}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>,
  file: <svg viewBox="0 0 24 24" {...s}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></svg>,
  search: <svg viewBox="0 0 24 24" {...s}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  copy: <svg viewBox="0 0 24 24" {...s}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>,
  trash: <svg viewBox="0 0 24 24" {...s}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>,
};

export function Pager({ pages, page, onGo, total }) {
  if (!pages || pages <= 1) return total ? <div className="pager"><span className="hint">{total} total</span></div> : null;
  return (
    <div className="pager">
      <button className="sm" disabled={page <= 1} onClick={() => onGo(page - 1)}>‹ Prev</button>
      <span className="hint mono">Page {page} / {pages}{total != null ? ` · ${total}` : ""}</span>
      <button className="sm" disabled={page >= pages} onClick={() => onGo(page + 1)}>Next ›</button>
    </div>
  );
}
