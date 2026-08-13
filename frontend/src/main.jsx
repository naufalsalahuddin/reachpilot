import React, { useEffect, useState, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { api, FLOW_ENABLED } from "./api.js";
import { loadBranding } from "./branding.js";
import Shell from "./components/Shell.jsx";
import "./app.css";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Campaign from "./pages/Campaign.jsx";
import Review from "./pages/Review.jsx";
import Companies from "./pages/Companies.jsx";
import Company from "./pages/Company.jsx";
import Analytics from "./pages/Analytics.jsx";
import Inbox from "./pages/Inbox.jsx";
import Suppression from "./pages/Suppression.jsx";
import Archive from "./pages/Archive.jsx";
import Report from "./pages/Report.jsx";
import Pagespeed from "./pages/Pagespeed.jsx";
import Status from "./pages/Status.jsx";
import Settings from "./pages/Settings.jsx";
import FlowBuilder from "./pages/FlowBuilder.jsx";

const MeContext = createContext(null);
export const useMe = () => useContext(MeContext);

function Protected() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = unauthed
  useEffect(() => { api("/api/me").then(setMe).catch(() => setMe(null)); }, []);
  if (me === undefined) return <div className="empty">Loading…</div>;
  if (me === null) return <Navigate to="/login" replace />;
  return (
    <MeContext.Provider value={me}>
      <Shell><Outlet /></Shell>
    </MeContext.Provider>
  );
}

// Same auth gate as Protected, but WITHOUT the Shell (sidebar/topbar) — for
// full-screen pages like the flow builder that need the entire viewport.
function ProtectedBare() {
  const [me, setMe] = useState(undefined);
  useEffect(() => { api("/api/me").then(setMe).catch(() => setMe(null)); }, []);
  if (me === undefined) return <div className="empty">Loading…</div>;
  if (me === null) return <Navigate to="/login" replace />;
  return <MeContext.Provider value={me}><Outlet /></MeContext.Provider>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/campaign" element={<Campaign />} />
          <Route path="/review" element={<Review />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/company" element={<Company />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/suppression" element={<Suppression />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/report" element={<Report />} />
          <Route path="/pagespeed" element={<Pagespeed />} />
          <Route path="/status" element={<Status />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        {FLOW_ENABLED && (
          <Route element={<ProtectedBare />}>
            <Route path="/flow" element={<FlowBuilder />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const rootEl = document.getElementById("root");
window.__root = window.__root || createRoot(rootEl);
loadBranding().finally(() => window.__root.render(<App />));
