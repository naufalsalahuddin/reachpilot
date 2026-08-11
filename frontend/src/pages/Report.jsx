import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { api, apiBase, toast } from "../api.js";

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] }; },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontSize: { default: null, parseHTML: (e) => e.style.fontSize || null, renderHTML: (a) => (a.fontSize ? { style: `font-size:${a.fontSize}` } : {}) } } }];
  },
  addCommands() { return { setFontSize: (s) => ({ chain }) => chain().setMark("textStyle", { fontSize: s }).run() }; },
});

const SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "30px"];
const psColor = (s) => (s == null ? "var(--muted)" : s >= 90 ? "var(--ok)" : s >= 50 ? "var(--warn)" : "var(--fail)");

function Toolbar({ editor }) {
  if (!editor) return null;
  const B = (active, on, label) => <button type="button" className={"tbtn" + (active ? " on" : "")} onMouseDown={(e) => { e.preventDefault(); on(); }}>{label}</button>;
  const sep = <span className="tbsep" />;
  return (
    <div className="tbar no-print">
      {B(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <b>B</b>)}
      {B(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <i>I</i>)}
      {B(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
      {sep}
      {B(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), "H1")}
      {B(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2")}
      {B(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3")}
      {B(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "•")}
      {B(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "1.")}
      {sep}
      {B(editor.isActive({ textAlign: "left" }), () => editor.chain().focus().setTextAlign("left").run(), "⯇")}
      {B(editor.isActive({ textAlign: "center" }), () => editor.chain().focus().setTextAlign("center").run(), "≡")}
      {B(editor.isActive({ textAlign: "right" }), () => editor.chain().focus().setTextAlign("right").run(), "⯈")}
      {sep}
      <select className="tsel" defaultValue="" onChange={(e) => e.target.value && editor.chain().focus().setFontSize(e.target.value).run()}>
        <option value="">Size</option>{SIZES.map((s) => <option key={s} value={s}>{parseInt(s, 10)}</option>)}
      </select>
      <label className="tbtn" style={{ gap: 5 }}>A<input type="color" style={{ width: 20, height: 18, padding: 0, border: "none", background: "none" }} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} /></label>
    </div>
  );
}

export default function Report() {
  const leadId = new URLSearchParams(location.search).get("lead");
  const [d, setD] = useState(null);
  const [ps, setPs] = useState(null);
  const [err, setErr] = useState("");
  const [promptTypes, setPromptTypes] = useState([]);
  const [promptId, setPromptId] = useState("");
  const [aiInstr, setAiInstr] = useState("");
  const [busy, setBusy] = useState({});
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const set = (k, v) => setBusy((b) => ({ ...b, [k]: v }));
  const readyRef = useRef(false);

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle, Color, FontSize, TextAlign.configure({ types: ["heading", "paragraph"] })],
    content: "<p>Loading…</p>",
  });

  useEffect(() => {
    if (!editor) return;
    api(`/api/report/${leadId}`).then((data) => {
      setD(data); setPs(data.pagespeed || null); document.title = `Audit — ${data.business}`;
      editor.commands.setContent(data.content);
      setTimeout(() => { readyRef.current = true; }, 400); // arm autosave after the initial load
    }).catch((e) => setErr(e.message));
    api("/api/appsettings").then((s) => { const list = s.report_ai_prompts || []; setPromptTypes(list); if (list[0]) setPromptId(list[0].id); }).catch(() => {});
  }, [editor]);

  // Autosave: every edit persists ~1s after you stop typing (no need to hit Save).
  useEffect(() => {
    if (!editor) return;
    let t;
    const onUpdate = () => { if (!readyRef.current) return; setSaveState("saving"); clearTimeout(t); t = setTimeout(() => save(true), 1000); };
    editor.on("update", onUpdate);
    return () => { editor.off("update", onUpdate); clearTimeout(t); };
  }, [editor]);

  const save = async (silent) => {
    setSaveState("saving");
    try { await api(`/api/report/${leadId}`, { method: "PUT", body: { content: editor.getJSON() } }); setSaveState("saved"); if (!silent) toast("Report saved"); }
    catch (e) { setSaveState("idle"); toast(e.message); }
  };
  const aiRewrite = async () => { set("ai", true); try { const r = await api(`/api/report/${leadId}/ai`, { method: "POST", body: { promptId, instruction: aiInstr } }); editor.commands.setContent(r.content); toast("Rewritten — review & it autosaves"); } catch (e) { toast(e.message); } finally { set("ai", false); } };
  const runPagespeed = async () => { set("ps", true); try { const r = await api(`/api/report/${leadId}/pagespeed`, { method: "POST", body: {} }); setPs(r.pagespeed); editor.chain().focus("end").insertContent(r.nodes).run(); toast("PageSpeed added — “Rewrite with AI” will fold it in"); } catch (e) { toast("PageSpeed failed: " + e.message); } finally { set("ps", false); } };
  const download = async () => {
    set("pdf", true);
    try {
      const res = await fetch(`${apiBase}/api/report/${leadId}/pdf`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editor.getJSON() }) });
      if (!res.ok) throw new Error("PDF failed (" + res.status + ")");
      const blob = await res.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `audit-${(d?.business || "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast(e.message); } finally { set("pdf", false); }
  };

  if (err) return <div style={{ padding: 40, color: "var(--fail)" }}>{err}</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <style>{`
        .tbar{display:flex;gap:3px;align-items:center;flex-wrap:wrap;padding:6px;background:var(--rule-soft);border-radius:9px;margin:14px 0 12px}
        .tbtn{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border:none;background:transparent;border-radius:7px;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer}
        .tbtn:hover{background:#fff;color:var(--ink)} .tbtn.on{background:#fff;color:var(--brand);box-shadow:var(--shadow)}
        .tbsep{width:1px;height:18px;background:var(--rule);margin:0 4px} .tsel{width:auto;height:30px;padding:0 8px;font-size:12.5px;border-radius:7px}
        .doc .ProseMirror{outline:none;min-height:240px;font-size:14.5px;line-height:1.7;color:#2b2b3a}
        .doc .ProseMirror h1{font-size:20px;font-weight:800;margin:26px 0 10px}
        .doc .ProseMirror h2{font-size:16.5px;font-weight:700;margin:28px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--rule)}
        .doc .ProseMirror h3{font-size:14px;font-weight:700;margin:18px 0 6px}
        .doc .ProseMirror p{margin:9px 0} .doc .ProseMirror ol{padding-left:22px;margin:8px 0}
        .doc .ProseMirror ul{list-style:none;padding-left:0;margin:8px 0}
        .doc .ProseMirror ul li{position:relative;padding-left:22px;margin:8px 0}
        .doc .ProseMirror ul li::before{content:"";position:absolute;left:5px;top:9px;width:6px;height:6px;border-radius:50%;background:var(--brand)}
        .scorepill{display:inline-flex;flex-direction:column;align-items:center;min-width:74px;padding:8px 14px;border:1px solid var(--rule);border-radius:10px;background:#fff}
        .scorepill .v{font-size:20px;font-weight:800;line-height:1} .scorepill .k{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:3px}
      `}</style>

      <div className="card" style={{ padding: "14px 16px", marginBottom: 16 }}>
        <div className="row">
          <button className="primary" onClick={download} disabled={busy.pdf}>{busy.pdf ? "Building PDF…" : "Download PDF"}</button>
          <button onClick={() => save(false)}>Save</button>
          <span className="hint" style={{ color: saveState === "saved" ? "var(--ok)" : "var(--muted)" }}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved (autosaves as you edit)" : "Autosaves as you edit"}</span>
          <button onClick={runPagespeed} disabled={busy.ps}>{busy.ps ? "Measuring…" : ps ? "Re-run PageSpeed" : "Add PageSpeed"}</button>
          <span className="spacer" />
          {d?.company_id && <a className="btn ghost" href={`/company?id=${d.company_id}`}>Open customer</a>}
        </div>
        <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--rule-soft)" }}>
          <span className="fld" style={{ margin: 0 }}>Rewrite with AI</span>
          <select style={{ width: "auto" }} value={promptId} onChange={(e) => setPromptId(e.target.value)} title="Report type (manage these in Settings → Report AI)">
            {promptTypes.length ? promptTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>) : <option value="">Standard</option>}
          </select>
          <input style={{ flex: 1, minWidth: 160 }} placeholder="extra comments for the AI (e.g. 'lead with the mobile speed')" value={aiInstr} onChange={(e) => setAiInstr(e.target.value)} />
          <button className="primary" onClick={aiRewrite} disabled={busy.ai}>{busy.ai ? "Writing…" : "Rewrite"}</button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>“Rewrite” turns the findings <b>and</b> the PageSpeed scores into one cohesive report. Edits save to the database; Download PDF is a real selectable-text file (also what's attached to emails when enabled).</div>
      </div>

      <div className="doc" style={{ background: "#fff", border: "1px solid var(--rule)", borderRadius: 14, boxShadow: "var(--shadow)", padding: "44px 52px" }}>
        {!d ? <p className="hint">Loading…</p> : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--brand)", fontWeight: 700 }}>Website Audit</div>
                <h1 style={{ fontSize: 28, margin: "5px 0 3px", fontWeight: 800, letterSpacing: "-.02em" }}>{d.business}</h1>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>{d.website || ""}{d.city ? "  ·  " + d.city : ""}</div>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12.5, textAlign: "right", whiteSpace: "nowrap" }}>{new Date().toLocaleDateString()}<br />{d.platform ? "Built on " + d.platform : ""}</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0" }}>
              <div className="scorepill"><span className="v" style={{ color: "var(--fail)" }}>{d.counts.fail}</span><span className="k">Issues</span></div>
              <div className="scorepill"><span className="v" style={{ color: "var(--warn)" }}>{d.counts.unknown}</span><span className="k">Unknown</span></div>
              <div className="scorepill"><span className="v" style={{ color: "var(--ok)" }}>{d.counts.pass}</span><span className="k">Passing</span></div>
              {ps?.mobile?.score != null && <div className="scorepill"><span className="v" style={{ color: psColor(ps.mobile.score) }}>{ps.mobile.score}</span><span className="k">Mobile</span></div>}
              {ps?.desktop?.score != null && <div className="scorepill"><span className="v" style={{ color: psColor(ps.desktop.score) }}>{ps.desktop.score}</span><span className="k">Desktop</span></div>}
            </div>

            {d.screenshot && <img src={`${apiBase}/api/report/${leadId}/screenshot`} alt="Homepage screenshot" style={{ width: "100%", border: "1px solid var(--rule)", borderRadius: 10, marginBottom: 8, background: "var(--bg)", boxShadow: "0 2px 10px rgba(27,27,46,.06)" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--muted)", margin: "6px 0" }}>
              {d.industry && <span>Industry: {d.industry}</span>}{d.phone && <span>Phone: {d.phone}</span>}
              {d.review_count ? <span>Reviews: {d.review_count}{d.rating ? ` (${Number(d.rating).toFixed(1)}★)` : ""}</span> : null}
              {d.meta?.load_seconds != null && <span>Homepage load: {d.meta.load_seconds}s</span>}
            </div>

            <div style={{ height: 1, background: "var(--brand)", opacity: 0.9, margin: "10px 0 0" }} />
            <Toolbar editor={editor} />
            <EditorContent editor={editor} />
          </>
        )}
      </div>
    </div>
  );
}
