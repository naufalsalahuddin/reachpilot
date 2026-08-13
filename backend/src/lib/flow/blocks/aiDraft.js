"use strict";
/** Flow block: write the first-draft email from the lead's audit hook. Port of
 * legacy handleDraft, scoped by flow_node_id instead of leads.status. */
const prisma = require("../../prisma");
const data = require("../../data");
const { makeDraft } = require("../../draft");
const providers = require("../../ai/providers");

module.exports = {
  type: "ai_draft",
  async run(ctx) {
    const { campaign, node, batchSize } = ctx;
    let provider = campaign.ai_provider || "template";
    if (provider !== "template" && !(await providers.isAvailable(provider))) provider = "template";

    const where = { campaign_id: campaign.id, flow_node_id: node.id };
    const total = await prisma.leads.count({ where });
    const rows = await prisma.leads.findMany({ where, orderBy: { review_count: "desc" }, take: Number(batchSize) });

    const doneLeadIds = [];
    for (const lead of rows) {
      const audit = await data.latestAudit(lead.id);
      if (!audit || !audit.pitchable) {
        await prisma.leads.update({ where: { id: lead.id }, data: { status: "skipped" } });
        doneLeadIds.push(lead.id);
        continue;
      }
      let checks = [];
      try { checks = JSON.parse(audit.checks_json || "[]"); } catch { checks = []; }
      const hookCheck = checks.find((c) => c.key === audit.hook_key);
      if (!hookCheck) {
        await prisma.leads.update({ where: { id: lead.id }, data: { status: "skipped" } });
        doneLeadIds.push(lead.id);
        continue;
      }
      const hook = { key: hookCheck.key, label: hookCheck.label, detail: hookCheck.detail, evidence: hookCheck.evidence };

      let pagespeed = null;
      try { const meta = JSON.parse(audit.meta_json || "{}"); pagespeed = meta.pagespeed || null; } catch { /* ignore */ }

      const { subject, body, preview, flags, source } = await makeDraft(
        lead, hook, campaign.sender_name || "", { provider, model: campaign.ai_model, rules: campaign.pitch_rules, pagespeed }
      );
      await data.saveDraft(lead.id, audit.id, campaign.id, subject, body, audit.hook_key, flags, source, preview);
      doneLeadIds.push(lead.id);
    }

    return { doneLeadIds, remaining: Math.max(0, total - doneLeadIds.length) };
  },
};
