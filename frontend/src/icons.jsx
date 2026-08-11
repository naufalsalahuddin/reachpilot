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
