#!/usr/bin/env node
"use strict";
// One-off: create the schema and the first admin user, then exit.
const db = require("../src/db");
const auth = require("../src/auth");

(async () => {
  try {
    await db.ensureSchema();
    console.log("Schema ready.");
    await auth.ensureAdmin();
    console.log("Done.");
    process.exit(0);
  } catch (e) {
    console.error("init-db failed:", e.message);
    process.exit(1);
  }
})();
