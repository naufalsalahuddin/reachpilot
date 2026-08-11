import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { brand } from "../branding.js";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/api/me").then(() => nav("/")).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await api("/api/login", { method: "POST", body: { email, password, remember } }); nav("/"); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form className="card" style={{ width: 380, maxWidth: "100%" }} onSubmit={submit}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
          <img src={brand().logo} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: "contain" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <h2 style={{ fontSize: 20 }}>Sign in to {brand().name}</h2>
        </div>
        <div className="field"><label className="fld">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div>
        <div className="field"><label className="fld">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in
        </label>
        {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
