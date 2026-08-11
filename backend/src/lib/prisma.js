"use strict";
/**
 * Single shared PrismaClient. In Next.js dev the module graph is re-evaluated on
 * every change, so we stash the client on globalThis to avoid exhausting the DB
 * connection pool with a new client per reload.
 */
const { PrismaClient } = require("@prisma/client");

const g = globalThis;
const prisma = g.__outreachPrisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__outreachPrisma = prisma;

module.exports = prisma;
module.exports.prisma = prisma;
