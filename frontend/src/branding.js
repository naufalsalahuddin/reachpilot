// Branding: fetch the workspace's brand config and apply it as CSS variables +
// document title + favicon. Multi-tenant-ready — everything comes from /api/branding.
const API = import.meta.env.VITE_API_BASE || "";

const hexToRgb = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (a) => "#" + a.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const mix = (hex, target, t) => { try { const a = hexToRgb(hex), b = hexToRgb(target); return toHex(a.map((x, i) => x + (b[i] - x) * t)); } catch { return hex; } };
const lighten = (h, t) => mix(h, "#ffffff", t);
const darken = (h, t) => mix(h, "#000000", t);

const DEFAULTS = { name: "Outreach", primary: "#1c97e6", secondary: "#0b6fb8", logo: "/logo.svg" };

export async function loadBranding() {
  let b = { ...DEFAULTS };
  try { const r = await fetch(API + "/api/branding", { credentials: "include" }); if (r.ok) b = { ...b, ...(await r.json()) }; } catch { /* defaults */ }
  const s = document.documentElement.style;
  s.setProperty("--brand", b.primary);
  s.setProperty("--brand-600", darken(b.primary, 0.12));
  s.setProperty("--brand-700", b.secondary);
  s.setProperty("--brand-secondary", b.secondary);
  s.setProperty("--brand-50", lighten(b.primary, 0.9));
  s.setProperty("--brand-100", lighten(b.primary, 0.8));
  window.__brand = b;
  const fav = document.querySelector("link[rel='icon']");
  if (fav && b.logo && b.logo !== DEFAULTS.logo) fav.href = b.logo;
  return b;
}

export function brand() { return window.__brand || DEFAULTS; }

/** Set the page title as "<title> · <brand name>". */
export function pageTitle(title) {
  const name = brand().name || "Outreach";
  document.title = title ? `${title} · ${name}` : name;
}
