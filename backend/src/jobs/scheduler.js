"use strict";
/**
 * In-process scheduler so the pipeline runs itself — no external cron required.
 * Overlap-guarded. Disable with SCHEDULER=off (e.g. if you point real cron at
 * /cron/tick instead). Interval via SCHEDULER_INTERVAL_SEC (default 60).
 */
const { processBatch } = require("./worker");

let running = false;
let timer = null;

async function tick() {
  if (running) return; // never overlap
  running = true;
  try { await processBatch(20); }
  catch (e) { console.warn("[scheduler]", e.message); }
  finally { running = false; }
}

function start() {
  if (String(process.env.SCHEDULER || "").toLowerCase() === "off") {
    console.log("  Scheduler: OFF (SCHEDULER=off) — hit /cron/tick or run bin/tick.js\n");
    return;
  }
  const sec = parseInt(process.env.SCHEDULER_INTERVAL_SEC, 10) || 60;
  timer = setInterval(tick, sec * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 3000); // first run shortly after boot
  console.log(`  Scheduler: ON, every ${sec}s (SCHEDULER=off to disable)\n`);
}

module.exports = { start, tick };
