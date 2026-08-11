"use strict";
/** Do-not-contact / suppression list (Prisma). Checked before every send. */
const prisma = require("./prisma");

function domainOf(email) {
  const at = String(email || "").lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : null;
}

async function isSuppressed(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  const d = domainOf(e);
  const row = await prisma.suppression.findFirst({
    where: { OR: [{ value: e }, { kind: "domain", value: d || " " }] },
    select: { id: true },
  });
  return !!row;
}

async function add(value, kind = "email", reason = null) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) throw new Error("value required");
  await prisma.suppression.upsert({
    where: { value: v },
    update: { reason },
    create: { value: v, kind: kind === "domain" ? "domain" : "email", reason, created_at: new Date() },
  });
}

module.exports = { isSuppressed, add, domainOf };
