#!/usr/bin/env node
"use strict";
// Cron alternative to /cron/tick — run one batch of queued jobs then exit.
// Point cron at either this script or the HTTP endpoint, not both.
const { processBatch } = require("../src/jobs/worker");
console.log(`Start`);

(async () => {
  try {
    const out = await processBatch(20);
    console.log(`Claimed ${out.claimed} job(s):`);
    for (const r of out.results)
      console.log(
        `  #${r.id} ${r.type} -> ${r.status}${r.note ? " (" + r.note + ")" : ""}`,
      );
    process.exit(0);
  } catch (e) {
    console.error("tick failed:", e.message);
    process.exit(1);
  }
})();
