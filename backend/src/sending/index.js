"use strict";
const { decryptJSON } = require("../lib/crypto");
const smtp = require("./smtp");
const gmail = require("./gmail");
const instantly = require("./instantly");
const smartlead = require("./smartlead");

const METHODS = ["smtp", "gmail_api", "instantly", "smartlead"];

// "Owned" methods = we control the raw message, so we can inject tracking and read
// replies over IMAP. Push methods hand the send off to a platform that does its own.
function isOwned(method) {
  return method === "smtp" || method === "gmail_api";
}

async function sendVia(account, msg) {
  const cfg = decryptJSON(account.config_json);
  switch (account.method) {
    case "smtp": return smtp.send(cfg, msg);
    case "gmail_api": return gmail.send(cfg, msg);
    case "instantly": return instantly.push(cfg, msg);
    case "smartlead": return smartlead.push(cfg, msg);
    default: throw new Error(`unknown sending method "${account.method}"`);
  }
}

async function testAccount(account) {
  const cfg = decryptJSON(account.config_json);
  switch (account.method) {
    case "smtp": return smtp.verify(cfg);
    case "gmail_api": return gmail.verify(cfg);
    case "instantly": return instantly.verify(cfg);
    case "smartlead": return smartlead.verify(cfg);
    default: throw new Error(`unknown sending method "${account.method}"`);
  }
}

module.exports = { sendVia, testAccount, isOwned, METHODS };
