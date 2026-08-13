"use strict";
/** Flow block: source leads from the campaign's configured provider (one search per run, no self-loop — matches legacy handleSource). */
const prisma = require("../../prisma");
const data = require("../../data");
const keystore = require("../../keystore");
const places = require("../../places");
const yelp = require("../../yelp");
const foursquare = require("../../foursquare");

const SOURCES = {
  google_places: { keystore: "google_places", search: (key, c) => places.search(key, c.industry, c.city, { want: c.leads_per_run, minReviews: c.min_reviews, requireWebsite: !!c.require_website }) },
  yelp: { keystore: "yelp", search: (key, c) => yelp.search(key, c.industry, c.city, { want: c.leads_per_run, minReviews: c.min_reviews }) },
  foursquare: { keystore: "foursquare", search: (key, c) => foursquare.search(key, c.industry, c.city, { want: c.leads_per_run, minReviews: c.min_reviews, requireWebsite: !!c.require_website }) },
};

module.exports = {
  type: "lead_source",
  async run(ctx) {
    const { campaign, node } = ctx;
    const src = SOURCES[campaign.source_provider] || SOURCES.google_places;
    const leads = await keystore.withKey(src.keystore, (key) => src.search(key, campaign));

    const doneLeadIds = [];
    for (const lead of leads) {
      const id = await data.insertLead(campaign.id, lead);
      if (id) {
        await prisma.leads.update({ where: { id }, data: { flow_node_id: node.id } });
        doneLeadIds.push(id);
      }
    }
    return { doneLeadIds, remaining: 0 };
  },
};
