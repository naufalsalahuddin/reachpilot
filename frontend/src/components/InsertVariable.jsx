import React, { useState } from "react";

// A small "insert token at cursor" dropdown for free-text fields (pitch rules,
// etc.) — Zapier's "insert data from previous step" pattern, scoped to whatever
// `options` the caller decides are actually available (e.g. only offer pagespeed
// tokens when a PageSpeed block actually precedes this one in the graph).
export default function InsertVariable({ options, textareaRef, value, onChange }) {
  const [open, setOpen] = useState(false);
  if (!options.length) return null;

  const insert = (key) => {
    const token = `{${key}}`;
    const el = textareaRef.current;
    if (el && el.selectionStart != null) {
      const start = el.selectionStart, end = el.selectionEnd;
      const next = value.slice(0, start) + token + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; });
    } else {
      onChange((value || "") + token);
    }
    setOpen(false);
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="sm ghost" onClick={() => setOpen((o) => !o)}>Insert variable ▾</button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div className="card" style={{ position: "absolute", zIndex: 10, top: "calc(100% + 4px)", right: 0, padding: 6, minWidth: 240, boxShadow: "var(--shadow-lg)", margin: 0 }}>
            {options.map(([key, label]) => (
              <button type="button" key={key} className="sm ghost" style={{ display: "block", width: "100%", textAlign: "left" }} onClick={() => insert(key)}>
                <span className="mono" style={{ fontSize: 11 }}>{`{${key}}`}</span> — {label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
