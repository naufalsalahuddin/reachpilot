"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

const { cleanUrl, domainOf } = require("../src/lib/url");
const { csvToLeads } = require("../src/lib/csv");
const { lintEmail } = require("../src/lib/contentLint");
const { scoreLead } = require("../src/lib/leadScore");
const { effectiveCap } = require("../src/sending/rotation");
const { buildReport } = require("../src/lib/reportContent");
const { blocksToDoc, buildDoc } = require("../src/lib/reportDoc");

test("cleanUrl strips UTM/query/hash, keeps path", () => {
  assert.equal(cleanUrl("https://acme.com/?utm_source=x&gclid=y"), "https://acme.com");
  assert.equal(cleanUrl("http://www.biz.co/page?fbclid=1#top"), "http://www.biz.co/page");
  assert.equal(cleanUrl("plumber.io/services?a=b"), "https://plumber.io/services");
  assert.equal(cleanUrl(""), null);
  assert.equal(domainOf("https://www.Example.com/x?y=1"), "example.com");
});

test("csvToLeads parses quoted commas + doubled quotes + maps headers", () => {
  const csv = 'name,website,email,reviews\nAcme,acme.com,a@acme.com,42\n"Smith, Co",https://s.com,,7';
  const { leads, skipped } = csvToLeads(csv);
  assert.equal(leads.length, 2);
  assert.equal(skipped, 0);
  assert.equal(leads[0].domain, "acme.com");
  assert.equal(leads[0].review_count, 42);
  assert.equal(leads[1].name, "Smith, Co");
});

test("lintEmail flags spammy content, passes clean copy", () => {
  const spam = lintEmail({ subject: "RE: ACT NOW!! 100% FREE", body: "Click here to buy now and earn money!!! http://a.com http://b.com http://c.com" });
  assert.ok(spam.score >= 45, "spam score should be high, got " + spam.score);
  assert.equal(spam.level, "high");
  const clean = lintEmail({ subject: "quick question about your booking form", body: "Hi there, I was looking at your site and noticed the contact form is missing. Happy to show you what I'd change. Best, Sam" });
  assert.ok(clean.score < 20, "clean score should be low, got " + clean.score);
});

test("scoreLead ranks by hook weight + fails", () => {
  const checks = [
    { key: "site_down", state: "FAIL", tier: 1 },
    { key: "no_h1", state: "FAIL", tier: 2 },
    { key: "cert", state: "PASS", tier: 2 },
  ];
  const s = scoreLead(checks, "site_down");
  assert.ok(s >= 95 && s <= 100, "site_down hook → near 100, got " + s);
  assert.ok(scoreLead([], null) === 0);
  assert.equal(scoreLead("nope"), null);
});

test("effectiveCap ramps a warming inbox and caps at daily_cap", () => {
  const acct = (days, warmup, cap = 40) => ({ daily_cap: cap, warmup: warmup ? 1 : 0, created_at: new Date(Date.now() - days * 86400000) });
  assert.equal(effectiveCap(acct(0, false), 8, 6), 40, "no warmup → full cap");
  assert.equal(effectiveCap(acct(0, true), 8, 6), 8, "day 0 warmup → base");
  assert.equal(effectiveCap(acct(2, true), 8, 6), 20, "day 2 → 8+6*2");
  assert.equal(effectiveCap(acct(30, true), 8, 6), 40, "far along → clamped to cap");
});

test("buildReport splits PASS vs FAIL/UNKNOWN", () => {
  const checks = [
    { key: "cert", state: "PASS", tier: 2, label: "Cert valid" },
    { key: "form_missing", state: "FAIL", tier: 1, label: "No form", detail: "no enquiry form" },
    { key: "tel", state: "UNKNOWN", tier: 2, label: "No phone" },
  ];
  const r = buildReport(checks, null);
  assert.equal(r.whatsGood.length, 1);
  assert.equal(r.whatsBad.length, 2); // fail + unknown
  assert.equal(r.counts.bad, 1);
  assert.equal(r.counts.unknown, 1);
});

test("blocksToDoc + buildDoc produce valid ProseMirror docs", () => {
  const doc = blocksToDoc([{ type: "heading", level: 2, text: "Hi" }, { type: "bullets", items: ["a", "b"] }, { type: "paragraph", text: "p" }]);
  assert.equal(doc.type, "doc");
  assert.equal(doc.content[0].type, "heading");
  assert.equal(doc.content[1].type, "bulletList");
  const d2 = buildDoc({ whatsGood: ["x"], whatsBad: [{ title: "y", detail: "z" }], pagespeed: null });
  assert.equal(d2.type, "doc");
  assert.ok(d2.content.length >= 4);
});
