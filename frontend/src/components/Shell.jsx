import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api.js";
import { brand, pageTitle } from "../branding.js";
import { Icon } from "../icons.jsx";
import { useMe } from "../main.jsx";

const GROUPS = [
  { label: null, items: [["/", "Dashboard", "dashboard"], ["/review", "Review", "review"], ["/inbox", "Inbox", "inbox"]] },
  { label: "Data", items: [["/companies", "Customers", "companies"], ["/analytics", "Analytics", "analytics"], ["/archive", "Archive", "archive"]] },
  { label: "Configure", items: [["/suppression", "Suppression", "ban"], ["/status", "System", "status"], ["/settings", "Settings", "settings"]] },
];
const TITLES = { "/": "Dashboard", "/review": "Review", "/inbox": "Inbox", "/companies": "Customers", "/company": "Customer", "/analytics": "Analytics", "/archive": "Archive", "/suppression": "Suppression", "/status": "System", "/settings": "Settings", "/campaign": "Campaign" };

export default function Shell({ children }) {
  const me = useMe();
  const nav = useNavigate();
  const loc = useLocation();
  const b = brand();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState({ review: 0, inbox: 0 });

  useEffect(() => { pageTitle(TITLES[loc.pathname]); }, [loc.pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const [drafts, inbox] = await Promise.all([
          api("/api/drafts?decision=pending&per=1").catch(() => ({ total: 0 })),
          api("/api/inbox/unread_count").catch(() => ({ count: 0 })),
        ]);
        setBadges({ review: drafts.total || 0, inbox: inbox.count || 0 });
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const logout = async () => { try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ } nav("/login"); };
  const initials = (me?.email || "?").slice(0, 2).toUpperCase();
  const badgeFor = (key) => (key === "review" ? badges.review : key === "inbox" ? badges.inbox : 0);

  return (
    <div className="layout">
      <aside className={"sidebar" + (open ? " open" : "")}>
        <div className="brand"><img className="logo-img" src={b.logo} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /> {b.name}</div>
        <nav className="nav">
          {GROUPS.map((g, i) => (
            <React.Fragment key={i}>
              {g.label && <div className="navlabel">{g.label}</div>}
              {g.items.map(([to, label, icon]) => {
                const b = to === "/review" ? badgeFor("review") : to === "/inbox" ? badgeFor("inbox") : 0;
                return (
                  <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}>
                    {Icon[icon]}<span>{label}</span>{b > 0 && <span className="navbadge">{b}</span>}
                  </NavLink>
                );
              })}
            </React.Fragment>
          ))}
        </nav>
        <div className="sidefoot">
          <button className="logout" onClick={logout}>{Icon.logout}<span>Log out</span></button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setOpen((o) => !o)}>{Icon.menu}</button>
          <div className="spacer" />
          <div className="profile-chip"><span className="avatar">{initials}</span><span className="hint">{me?.email}</span></div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
