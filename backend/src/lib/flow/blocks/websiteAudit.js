"use strict";
/** Flow block: audit each lead's website for a pitchable "hook". Port of legacy
 * handleAudit, minus the pagespeed fold-in (that's now its own `pagespeed` block)
 * and minus the hardcoded next-stage enqueue (the engine resolves edges generically). */
const prisma = require("../../prisma");
const data = require("../../data");
const { auditSite } = require("../../audit");
const { chooseEmail } = require("../../../jobs/handlers");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  type: "website_audit",
  async run(ctx) {
    const { campaign, node, batchSize } = ctx;
    const where = { campaign_id: campaign.id, flow_node_id: node.id, website: { not: null } };
    const total = await prisma.leads.count({ where });
    const rows = await prisma.leads.findMany({ where, orderBy: { review_count: "desc" }, take: Number(batchSize) });
    const skipGroups = Array.isArray(node.config && node.config.disabled_checks) ? node.config.disabled_checks : [];

    const doneLeadIds = [];
    for (const lead of rows) {
      let res;
      try { res = await auditSite(lead.website, { skipGroups }); }
      catch {
        await prisma.leads.update({ where: { id: lead.id }, data: { status: "skipped" } });
        doneLeadIds.push(lead.id);
        continue;
      }

      await data.saveAudit(lead.id, res);

      if (!lead.email && res.meta && res.meta.emails_found) {
        const pick = chooseEmail(res.meta.emails_found);
        if (pick) {
          await prisma.leads.update({
            where: { id: lead.id },
            data: { email: pick.email, email_type: pick.type, email_status: "found", first_name: lead.first_name || pick.firstName },
          });
        }
      }

      doneLeadIds.push(lead.id);
      await sleep(campaign.delay_ms || 1500);
    }

    return { doneLeadIds, remaining: Math.max(0, total - doneLeadIds.length) };
  },
};
