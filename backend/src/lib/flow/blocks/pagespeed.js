"use strict";
/** Flow block: fold PageSpeed (mobile+desktop) into the lead's existing audit row.
 * Cache-warm only for report content — the send block still decides attachment.
 * Runs AFTER a `website_audit` node has already persisted its audit; re-fetches via
 * data.latestAudit rather than needing any in-memory handoff between jobs. */
const prisma = require("../../prisma");
const data = require("../../data");
const pagespeed = require("../../pagespeed");

module.exports = {
  type: "pagespeed",
  async run(ctx) {
    const { campaign, node, batchSize } = ctx;
    const where = { campaign_id: campaign.id, flow_node_id: node.id, website: { not: null } };
    const total = await prisma.leads.count({ where });
    const rows = await prisma.leads.findMany({ where, take: Number(batchSize) });

    const doneLeadIds = [];
    for (const lead of rows) {
      try {
        const audit = await data.latestAudit(lead.id);
        if (audit && !audit.blocked) {
          const ps = await pagespeed.runBoth(lead.website);
          await data.attachPagespeedToAudit(audit.id, lead.id, ps);
        }
      } catch { /* pagespeed is best-effort; never block the flow over it */ }
      doneLeadIds.push(lead.id);
    }

    return { doneLeadIds, remaining: Math.max(0, total - doneLeadIds.length) };
  },
};
