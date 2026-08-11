import React, { useEffect } from "react";

export default function Modal({ title, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target.classList.contains("modal-bg")) onClose(); }}>
      <div className="modal" style={{ width: `min(${width}px, 96vw)` }}>
        <div className="content">
          <div className="row" style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 18 }}>{title}</h2><span className="spacer" />
            <button className="ghost" onClick={onClose} aria-label="Close" style={{ fontSize: 22, lineHeight: 1, padding: "2px 8px" }}>×</button>
          </div>
          {children}
          {footer && <div className="row" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--rule-soft)" }}>{footer}</div>}
        </div>
      </div>
    </div>
  );
}
