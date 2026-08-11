"use strict";
/**
 * On-the-spot AI editing with preset styles + Grammarly-like fixes.
 *
 * The system prompt keeps the anti-fabrication rule alive: the editor may
 * rephrase, tighten or fix, but it must not invent facts, numbers, names,
 * links or a signature. The draft validator still runs on whatever comes back.
 */
const { chat } = require("./providers");

const EDIT_SYSTEM = `You are an in-line editing assistant for short, plain-text cold emails.

Return ONLY the revised text — no preamble, no explanation, no surrounding quotes,
no markdown. Rules you must not break:
- Preserve the writer's meaning and intent.
- Do NOT invent facts, numbers, statistics, percentages, competitor names, links,
  attachments, or a signature. If a fact is not already in the text, it may not appear.
- Keep it plain text that reads like one person typed it to another.
- Keep it roughly the same length unless the instruction is explicitly about length.`;

// key -> { label, group, instruction }
const OPS = {
  // Rewrite / style
  rephrase:        { label: "Rephrase",        group: "Rewrite", instruction: "Rewrite this so it says the same thing in different words. Keep the tone and length similar." },
  humanize:        { label: "Humanize",        group: "Rewrite", instruction: "Rewrite this so it reads like a real person typed it casually — natural rhythm, plain words, small imperfections. Remove anything that sounds AI-generated, corporate, or templated." },
  shorten:         { label: "Shorten",         group: "Rewrite", instruction: "Make this noticeably shorter and punchier without losing the core point. Cut filler and hedging." },
  expand:          { label: "Expand",          group: "Rewrite", instruction: "Add one or two natural sentences of substance. Do not invent facts — only elaborate on what is already implied." },

  // Grammarly-like
  fix_grammar:     { label: "Fix grammar",     group: "Proofread", instruction: "Correct grammar, spelling and punctuation. Change nothing else. Keep wording and voice identical apart from the fixes." },
  improve_clarity: { label: "Improve clarity", group: "Proofread", instruction: "Make this clearer and easier to read on first pass. Simplify tangled sentences, but keep the meaning and the casual tone." },
  make_concise:    { label: "Make concise",    group: "Proofread", instruction: "Tighten the wording. Remove redundancy and wordiness while keeping every real point." },

  // Tone
  more_formal:     { label: "More formal",     group: "Tone", instruction: "Shift the tone slightly more professional and polished, without becoming stiff or corporate." },
  more_casual:     { label: "More casual",     group: "Tone", instruction: "Shift the tone slightly more relaxed and friendly, like a message to a peer." },
  more_direct:     { label: "More direct",     group: "Tone", instruction: "Make it more direct and confident. Get to the point faster; drop apologetic hedging." },
  warmer:          { label: "Warmer",          group: "Tone", instruction: "Make it a touch warmer and more personable without gushing." },
};

function presets() {
  return Object.entries(OPS).map(([key, v]) => ({ key, label: v.label, group: v.group }));
}

/**
 * Apply an edit to `text`.
 * @param {object} p
 * @param {string} p.provider  anthropic | openai | groq
 * @param {string} p.op        a key in OPS, or "custom"
 * @param {string} p.text      the text to edit (selection or whole body)
 * @param {string} [p.instruction] free-form instruction when op === "custom"
 * @param {string} [p.model]
 * @returns {Promise<string>}
 */
async function applyEdit({ provider, op, text, instruction, model }) {
  if (!text || !text.trim()) throw new Error("Nothing to edit");

  let directive;
  if (op === "custom") {
    if (!instruction || !instruction.trim()) throw new Error("Custom edit needs an instruction");
    directive = instruction.trim();
  } else {
    const spec = OPS[op];
    if (!spec) throw new Error(`Unknown edit "${op}"`);
    directive = spec.instruction;
  }

  const prompt = `Instruction: ${directive}\n\nText:\n"""\n${text}\n"""\n\nReturn only the revised text.`;
  const out = await chat({
    provider, system: EDIT_SYSTEM, prompt, model,
    maxTokens: Math.min(1200, Math.ceil(text.length / 2) + 400),
    temperature: op === "fix_grammar" ? 0.2 : 0.7,
  });
  // Strip stray surrounding quotes/backticks a model sometimes adds.
  return out.replace(/^["'`]+|["'`]+$/g, "").trim();
}

module.exports = { applyEdit, presets, OPS, EDIT_SYSTEM };
