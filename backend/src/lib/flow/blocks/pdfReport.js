"use strict";
/** Flow block: pre-warm the audit-report content cache for each lead. Cache-warm
 * only — this does NOT decide whether a PDF gets attached to the send; that's
 * still the `send` block, driven by campaign.attach_report_pdf / drafts.attach_pdf. */
const prisma = require("../../prisma");
const { getReportData, saveReportContent } = require("../../reportData");

module.exports = {
  type: "pdf_report",
  async run(ctx) {
    const { campaign, node, batchSize } = ctx;
    const where = { campaign_id: campaign.id, flow_node_id: node.id };
    const total = await prisma.leads.count({ where });
    const rows = await prisma.leads.findMany({ where, take: Number(batchSize) });

    const doneLeadIds = [];
    for (const lead of rows) {
      try {
        const rd = await getReportData(lead.id);
        if (rd && rd.content) await saveReportContent(lead.id, rd.content);
      } catch { /* best-effort cache warm — never blocks the flow */ }
      doneLeadIds.push(lead.id);
    }

    return { doneLeadIds, remaining: Math.max(0, total - doneLeadIds.length) };
  },
};
