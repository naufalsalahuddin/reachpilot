"use strict";
/**
 * Applies pending Prisma migrations using the already-connected Prisma Client
 * instead of shelling out to the `prisma` CLI. Some shared hosts block spawning
 * subprocesses entirely, which makes `execSync("prisma migrate deploy")` fail
 * instantly (no DB connection, no engine — just a rejected spawn) — this runner
 * only ever talks to the DB through the connection the app already needs anyway.
 *
 * Compatible with the real `_prisma_migrations` table Prisma's own CLI uses, so
 * `prisma migrate status`/`deploy` run locally still recognize what's applied.
 *
 * Migrations before this file existed were never tracked (this project used
 * manual ALTER TABLE + `prisma db pull` historically) — on first run against
 * such a database, each migration is "baselined" (marked applied without
 * re-running its SQL) if its target table/column already exists, and actually
 * run otherwise. This is the standard approach for adopting migrations against
 * a pre-existing database, done automatically instead of via a one-off command.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "prisma", "migrations");

// One marker per migration folder — a table (column: null) or table+column this
// migration introduces. Used only to decide whether a migration already landed
// on a database that predates migration tracking; genuinely pending migrations
// (marker absent) still run their full migration.sql.
const MARKERS = {
  "00000000000000_init": { table: "campaigns", column: null },
  "20260811005023_address_and_templates": { table: "companies", column: "country" },
  "20260811080824_email_design_templates": { table: "campaigns", column: "email_template_id" },
  "20260812140340_add_campaign_flows": { table: "campaigns", column: "flow_id" },
  "20260812175633_add_disabled_checks": { table: "campaigns", column: "disabled_checks" },
};

async function ensureMigrationsTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id                      VARCHAR(36) NOT NULL,
      checksum                VARCHAR(64) NOT NULL,
      finished_at             DATETIME(3) NULL,
      migration_name          VARCHAR(255) NOT NULL,
      logs                    TEXT NULL,
      rolled_back_at          DATETIME(3) NULL,
      started_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      applied_steps_count     INTEGER UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    ) DEFAULT CHARACTER SET utf8mb4
  `);
}

async function alreadyMarkedApplied(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT 1 FROM _prisma_migrations WHERE migration_name = ? AND finished_at IS NOT NULL LIMIT 1",
    name,
  );
  return rows.length > 0;
}

async function markerAlreadyPresent(prisma, marker) {
  if (!marker) return false;
  if (marker.column) {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
      marker.table, marker.column,
    );
    return rows.length > 0;
  }
  const rows = await prisma.$queryRawUnsafe(
    "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
    marker.table,
  );
  return rows.length > 0;
}

function splitStatements(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function recordApplied(prisma, name, checksum, stepCount) {
  await prisma.$executeRawUnsafe(
    "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (?, ?, NOW(3), ?, NOW(3), ?)",
    crypto.randomUUID(), checksum, name, stepCount,
  );
}

async function applyPendingMigrations(prisma) {
  await ensureMigrationsTable(prisma);

  const folders = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => fs.statSync(path.join(MIGRATIONS_DIR, f)).isDirectory())
    .sort();

  for (const name of folders) {
    const sqlPath = path.join(MIGRATIONS_DIR, name, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;
    if (await alreadyMarkedApplied(prisma, name)) continue;

    const sqlBuffer = fs.readFileSync(sqlPath);
    const checksum = crypto.createHash("sha256").update(sqlBuffer).digest("hex");

    if (await markerAlreadyPresent(prisma, MARKERS[name])) {
      console.log(`[migrate] ${name} — already present, baselining without re-running`);
      await recordApplied(prisma, name, checksum, 0);
      continue;
    }

    console.log(`[migrate] ${name} — applying…`);
    const statements = splitStatements(sqlBuffer.toString("utf8"));
    for (const stmt of statements) await prisma.$executeRawUnsafe(stmt);
    await recordApplied(prisma, name, checksum, statements.length);
    console.log(`[migrate] ${name} — applied`);
  }

  console.log("[migrate] up to date");
}

module.exports = { applyPendingMigrations };
