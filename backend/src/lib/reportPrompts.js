"use strict";
/** User-defined report AI "types" (named prompts), stored in settings.report_ai_prompts. */
const prisma = require("./prisma");
const { DEFAULT_REPORT_PROMPT } = require("./reportDoc");

async function getPrompts() {
  const row = await prisma.settings.findUnique({ where: { k: "report_ai_prompts" } });
  let list = [];
  try { list = row && row.v ? JSON.parse(row.v) : []; } catch { list = []; }
  if (!Array.isArray(list) || !list.length) list = [{ id: "standard", name: "Standard", prompt: DEFAULT_REPORT_PROMPT }];
  return list.filter((p) => p && p.id && p.name);
}

async function savePrompts(list) {
  const clean = (Array.isArray(list) ? list : []).filter((p) => p && p.id && (p.name || "").trim()).map((p) => ({ id: String(p.id), name: String(p.name).trim().slice(0, 60), prompt: String(p.prompt || "") }));
  await prisma.settings.upsert({ where: { k: "report_ai_prompts" }, update: { v: JSON.stringify(clean) }, create: { k: "report_ai_prompts", v: JSON.stringify(clean) } });
  return clean;
}

module.exports = { getPrompts, savePrompts, DEFAULT_REPORT_PROMPT };
