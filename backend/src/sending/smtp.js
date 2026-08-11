"use strict";
// Generic SMTP sender (also covers Gmail/Outlook via an app password).
const nodemailer = require("nodemailer");

function transport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: cfg.secure === true || Number(cfg.port) === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

async function send(cfg, msg) {
  const info = await transport(cfg).sendMail({
    from: `${msg.fromName || ""} <${msg.fromEmail || cfg.user}>`.trim(),
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html || undefined,
    headers: msg.headers || undefined,
    // [{ filename, content: Buffer, contentType }]
    attachments: (msg.attachments && msg.attachments.length) ? msg.attachments : undefined,
  });
  return { messageId: info.messageId };
}

async function verify(cfg) {
  await transport(cfg).verify();
  return true;
}

module.exports = { send, verify };
