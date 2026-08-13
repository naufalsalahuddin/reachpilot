import React, { useRef, useState } from "react";
import { Icon } from "../icons.jsx";

// Drag-and-drop CSV picker + paste-fallback textarea, shared by the classic
// campaign form and the flow builder's Lead Source (CSV mode) drawer.
export default function CsvDropzone({ csv, onCsvChange, compact }) {
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  const handleFiles = (files) => {
    const f = files && files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { onCsvChange(rd.result); setFileName(f.name); };
    rd.readAsText(f);
  };

  const clear = (e) => { e.stopPropagation(); onCsvChange(""); setFileName(""); if (inputRef.current) inputRef.current.value = ""; };

  return (
    <div>
      <div
        className={`csv-dropzone${dragOver ? " drag" : ""}${fileName ? " has-file" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current.click()}
      >
        <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
        {fileName ? (
          <div className="csv-dropzone-file">
            <span className="csv-dropzone-icon">{Icon.file}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
            <button type="button" className="sm ghost" onClick={clear}>{Icon.close}</button>
          </div>
        ) : (
          <>
            <span className="csv-dropzone-icon">{Icon.upload}</span>
            <div><b>Drop a CSV here</b> or click to choose a file</div>
            {!compact && <div className="hint">name, website, email, phone, city, reviews</div>}
          </>
        )}
      </div>
      {!compact && (
        <div className="field" style={{ marginTop: 10 }}>
          <label className="fld">…or paste CSV</label>
          <textarea rows={4} value={csv} onChange={(e) => { onCsvChange(e.target.value); setFileName(""); }} placeholder={"name,website,email,city\nAcme Dental,acmedental.com,info@acmedental.com,Austin"} />
        </div>
      )}
    </div>
  );
}
