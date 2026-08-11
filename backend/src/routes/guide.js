"use strict";
/** "Guide me" onboarding state (Prisma). Ordered checklist with the next action. */
const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

router.get("/api/guide", async (req, res) => {
  try {
    const sourceKeys = await prisma.api_keys.count({ where: { provider: { in: ["google_places", "yelp", "foursquare"] }, status: "active" } });
    const campaigns = await prisma.campaigns.count();
    const leads = await prisma.leads.count();
    const pending = await prisma.drafts.count({ where: { decision: "pending" } });
    const approved = await prisma.drafts.count({ where: { decision: "approved" } });
    const accounts = await prisma.sending_accounts.count();
    const sendingOn = await prisma.campaigns.count({ where: { sending_enabled: 1 } });
    const sent = await prisma.sends.count({ where: { status: "sent" } });

    const steps = [
      { key: "source", label: "Connect a data source", desc: "Add a Google Places, Yelp, or Foursquare API key so campaigns can find businesses. Or skip and import a CSV.", done: sourceKeys > 0, href: "/settings?section=integrations", cta: "Add a key" },
      { key: "campaign", label: "Create a campaign", desc: "Pick an industry + city, choose your data source, and set the AI writer.", done: campaigns > 0, href: "/campaign", cta: "New campaign" },
      { key: "leads", label: "Source or import leads", desc: "Run the campaign to pull leads, or import a CSV. The app then audits each site and drafts an email.", done: leads > 0, href: "/", cta: "Run a campaign" },
      { key: "review", label: "Review the drafts", desc: pending ? `${pending} draft${pending > 1 ? "s" : ""} waiting. Edit, add preview text, and approve the good ones.` : "Approve the drafts you like — approved emails queue to send.", done: approved > 0, href: "/review", cta: pending ? `Review ${pending}` : "Open review" },
      { key: "account", label: "Add a sending inbox", desc: "Connect SMTP / Gmail / Instantly / Smartlead so approved emails can actually go out.", done: accounts > 0, href: "/settings?section=sending", cta: "Add inbox" },
      { key: "sending", label: "Turn on sending", desc: "Enable sending on the campaign, assign inboxes, and set the send window. Then approvals send automatically.", done: sendingOn > 0 && sent > 0, href: campaigns > 0 ? "/campaign" : "/", cta: "Enable sending" },
    ];

    const next = steps.find((s) => !s.done) || null;
    const doneCount = steps.filter((s) => s.done).length;
    res.json({ steps, next: next ? next.key : null, done: doneCount, total: steps.length, complete: doneCount === steps.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
