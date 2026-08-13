"use strict";
/** Flow block: opportunistically upgrade a lead's email (site-scrape, Hunter.io,
 * permutations, optional SMTP verify). Every lead at this node passes through —
 * enrichment is a best-effort improvement, not a gate, so a lead that already has
 * a personal email just advances without re-running the finder. */
const prisma = require("../../prisma");
const emailFinder = require("../../emailFinder");

module.exports = {
  type: "email_finder",
  async run(ctx) {
    const { campaign, node, batchSize } = ctx;
    const where = { campaign_id: campaign.id, flow_node_id: node.id };
    const total = await prisma.leads.count({ where });
    const rows = await prisma.leads.findMany({ where, orderBy: { review_count: "desc" }, take: Number(batchSize) });
    const strategies = Array.isArray(node.config && node.config.strategies) ? node.config.strategies : undefined;
    const verify = !!(node.config && node.config.verify);

    const doneLeadIds = [];
    for (const lead of rows) {
      const needsEnrich = (lead.email_type !== "personal") && (!lead.email_status || lead.email_status === "found");
      if (needsEnrich) {
        try {
          const best = await emailFinder.findBest(lead, { strategies, verify });
          if (best && best.type === "personal") {
            await prisma.leads.update({ where: { id: lead.id }, data: { email: best.email, email_type: "personal", email_status: best.status, first_name: lead.first_name || best.first_name } });
            if (lead.company_id) await prisma.companies.update({ where: { id: lead.company_id }, data: { email: best.email, email_type: "personal", last_activity: new Date() } });
          } else if (best && best.email && !lead.email) {
            await prisma.leads.update({ where: { id: lead.id }, data: { email: best.email, email_type: best.type, email_status: "searched", first_name: lead.first_name || best.first_name } });
          } else {
            await prisma.leads.update({ where: { id: lead.id }, data: { email_status: "searched" } });
          }
        } catch {
          await prisma.leads.update({ where: { id: lead.id }, data: { email_status: "searched" } });
        }
      }
      doneLeadIds.push(lead.id);
    }

    return { doneLeadIds, remaining: Math.max(0, total - doneLeadIds.length) };
  },
};
