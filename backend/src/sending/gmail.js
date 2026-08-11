"use strict";
/**
 * Gmail API sender using an OAuth2 refresh token (no googleapis dependency).
 * config: { client_id, client_secret, refresh_token }
 *
 * To get a refresh token: create OAuth creds in Google Cloud, authorize the
 * https://www.googleapis.com/auth/gmail.send scope, exchange the code once.
 * (A guided connect flow can be added later; for now paste the token in.)
 */
async function accessToken(cfg) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: cfg.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Gmail token: " + (d.error_description || d.error || "no access_token"));
  return d.access_token;
}

function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bodyPart(msg) {
  if (msg.html) {
    const b = "alt_" + Math.random().toString(36).slice(2);
    return {
      headers: `Content-Type: multipart/alternative; boundary="${b}"`,
      body: [`--${b}`, "Content-Type: text/plain; charset=UTF-8", "", msg.text, "",
        `--${b}`, "Content-Type: text/html; charset=UTF-8", "", msg.html, "", `--${b}--`, ""].join("\r\n"),
    };
  }
  return { headers: "Content-Type: text/plain; charset=UTF-8", body: msg.text };
}

function buildMime(msg) {
  const from = `${msg.fromName || ""} <${msg.fromEmail}>`.trim();
  const head = [`From: ${from}`, `To: ${msg.to}`, `Subject: ${msg.subject}`, "MIME-Version: 1.0"];
  const part = bodyPart(msg);
  const atts = msg.attachments || [];
  if (!atts.length) return [...head, part.headers, "", part.body].join("\r\n");

  // multipart/mixed: the message body (alt or plain) + each attachment
  const mb = "mix_" + Math.random().toString(36).slice(2);
  const lines = [...head, `Content-Type: multipart/mixed; boundary="${mb}"`, "", `--${mb}`, part.headers, "", part.body, ""];
  for (const a of atts) {
    const content = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
    lines.push(`--${mb}`, `Content-Type: ${a.contentType || "application/octet-stream"}`, "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename || "attachment"}"`, "", content.toString("base64"), "");
  }
  lines.push(`--${mb}--`, "");
  return lines.join("\r\n");
}

async function send(cfg, msg) {
  const token = await accessToken(cfg);
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(buildMime(msg)) }),
  });
  const d = await r.json();
  if (!d.id) throw new Error("Gmail send failed: " + JSON.stringify(d).slice(0, 200));
  return { messageId: d.id };
}

async function verify(cfg) {
  await accessToken(cfg); // if the token refreshes, creds are valid
  return true;
}

module.exports = { send, verify };
