"use strict";
/**
 * AES-256-GCM encryption for sending-account credentials at rest (SMTP passwords,
 * API keys, OAuth refresh tokens). The key is derived from APP_SECRET in .env.
 *
 * Stored form: "v1:<iv-base64>:<tag-base64>:<ciphertext-base64>".
 * If APP_SECRET is the dev fallback, this still works but the secret is weak —
 * set a real APP_SECRET in production.
 */
const crypto = require("crypto");
const config = require("../config");

const KEY = crypto.createHash("sha256").update(String(config.appSecret)).digest(); // 32 bytes

function encrypt(plainObjOrString) {
  const plain = typeof plainObjOrString === "string" ? plainObjOrString : JSON.stringify(plainObjOrString || {});
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

function decrypt(stored) {
  if (!stored) return null;
  const parts = String(stored).split(":");
  if (parts[0] !== "v1" || parts.length !== 4) throw new Error("bad ciphertext format");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  return out;
}

function decryptJSON(stored) {
  const s = decrypt(stored);
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

module.exports = { encrypt, decrypt, decryptJSON };
