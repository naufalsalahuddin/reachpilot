import React, { useState } from "react";

// value is a comma-separated string; onChange returns the same. suggestions = string[].
export default function TagInput({ value, onChange, suggestions = [], placeholder = "add tag…" }) {
  const tags = (value || "").split(",").map((t) => t.trim()).filter(Boolean);
  const [input, setInput] = useState("");
  const add = (t) => { t = t.trim().replace(/,/g, ""); if (t && !tags.includes(t)) onChange([...tags, t].join(", ")); setInput(""); };
  const remove = (t) => onChange(tags.filter((x) => x !== t).join(", "));
  const sugg = suggestions.filter((s) => !tags.includes(s) && (!input || s.toLowerCase().includes(input.toLowerCase()))).slice(0, 6);
  return (
    <div>
      <div className="taginput">
        {tags.map((t) => <span className="chip-tag" key={t}>{t}<button type="button" onClick={() => remove(t)} aria-label={`Remove ${t}`}>×</button></span>)}
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
            else if (e.key === "Backspace" && !input && tags.length) remove(tags[tags.length - 1]);
          }}
          onBlur={() => input && add(input)} placeholder={tags.length ? "" : placeholder} />
      </div>
      {input && sugg.length > 0 && <div className="tag-suggest">{sugg.map((s) => <button type="button" key={s} onMouseDown={(e) => { e.preventDefault(); add(s); }}>{s}</button>)}</div>}
    </div>
  );
}
