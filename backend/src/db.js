"use strict";
/**
 * Data entrypoint. Historically this held raw mysql2 SQL; it now re-exports the
 * Prisma-backed helpers from lib/data so every route/job imports one place.
 * `prisma` is the client for model queries; `now()` returns a Date for DateTime
 * columns (Prisma stores JS Dates as UTC, matching the old UTC-naive convention).
 */
const data = require("./lib/data");

module.exports = {
  ...data,
  prisma: data.prisma,
  now: data.now,
  nowSql: data.now, // back-compat alias; returns a Date now, not a string
};
