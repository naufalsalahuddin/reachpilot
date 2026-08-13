// API client. In dev, Vite proxies these paths to the Express API (same-origin,
// so the session cookie just works). In prod, set VITE_API_BASE to the API's URL.
const BASE = import.meta.env.VITE_API_BASE || "";

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (res.status === 401 && !path.endsWith("/api/me") && !path.endsWith("/api/login")) {
    if (location.pathname !== "/login") location.href = "/login";
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const apiBase = BASE;

// Dark launch switch for the visual flow builder — baked in at build time.
// Must match the backend's FLOW_BUILDER_ENABLED for the API calls to work.
export const FLOW_ENABLED = import.meta.env.VITE_FLOW_BUILDER_ENABLED === "true";

let toastTimer = null;
export function toast(msg, ms = 2200) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; }, ms);
}

export function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : ""; }
export function fmtDateTime(d) { return d ? new Date(d).toLocaleString() : ""; }

export const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Toronto", "America/Sao_Paulo", "Europe/London", "Europe/Dublin",
  "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam",
  "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
];
