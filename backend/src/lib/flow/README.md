# Adding a new flow block type

The flow builder's block palette is fixed, not user-extensible — adding a new
block type is a code change in a handful of known places. This is the checklist.

## 1. Write the adapter

Add `backend/src/lib/flow/blocks/yourBlock.js`:

```js
"use strict";
const prisma = require("../../prisma");

module.exports = {
  type: "your_block",
  async run(ctx) {
    // ctx = { campaign, node, flow, batchSize }
    const where = { campaign_id: ctx.campaign.id, flow_node_id: ctx.node.id };
    const total = await prisma.leads.count({ where });
    const rows = await prisma.leads.findMany({ where, take: Number(ctx.batchSize) });

    const doneLeadIds = [];
    for (const lead of rows) {
      // ...do the work, write whatever you need via lib/data.js or prisma directly...
      doneLeadIds.push(lead.id);
    }

    // IMPORTANT: compute remaining as (total candidates) - (done this batch), not a
    // fresh recount after the loop — the engine hasn't advanced flow_node_id yet
    // when this returns, so a recount would still include the leads you just did.
    return { doneLeadIds, remaining: Math.max(0, total - doneLeadIds.length) };
  },
};
```

Candidate queries are always scoped by `flow_node_id: node.id`, never by
`leads.status` — a flow can reorder blocks, so status isn't a reliable "which
node is this lead at" signal (see `jobs/flowEngine.js`'s header comment).

A block that should NOT run as a job (like `review_gate`, a pure routing
marker) just omits `run` entirely — the engine checks
`typeof adapter.run === "function"` to decide whether a node needs a job.

A `branch`-shaped block (multiple outgoing edges chosen by a condition, not
processed in batches) exports `evaluate(lead, node)` instead of `run` — see
`blocks/branch.js`. It's resolved synchronously during edge traversal, never
queued.

## 2. Register it

In `backend/src/lib/flow/registry.js`:
- Add it to `BLOCKS` (`your_block: require("./blocks/yourBlock")`).
- Add a display name to `LABELS`.
- If it doesn't map to an existing `config.batch.*` env var, add a default
  batch size to `DEFAULT_BATCH` (5 is a reasonable default).
- If it's allowed to be the graph's entry point, add it to `INITIATOR_TYPES`.
  Almost nothing should be — `lead_source` is the only one today, enforced in
  `routes/flows.js validateGraph()`.

## 3. Graph validation

`routes/flows.js validateGraph()` already handles the generic rules (unique
ids, edges point at real nodes, exactly one unconditional outgoing edge per
non-branch/gate/send node) automatically once the type is in `BLOCKS`. You
only need to touch it if your block has `branch`-style multiple named edges
(add its type alongside `branch`/`review_gate` in the edge-count checks) or
is terminal like `send` (zero outgoing edges).

## 4. Frontend

- `frontend/src/icons.jsx`: add an SVG icon (`blockYourThing: <svg>...</svg>`,
  follow the existing stroke style — `fill: none, stroke: currentColor,
  strokeWidth: 1.8`).
- `frontend/src/pages/FlowCanvas.jsx`: add an entry to `BLOCK_META` (`icon`
  key + accent `color`) so the node card and palette render correctly.
- `frontend/src/flowConstants.js`: add a one-line description to
  `BLOCK_DESCRIPTIONS` for the searchable block picker.
- If the block has per-node configuration (like `branch`'s condition, or
  `website_audit`'s disabled checks), add its fields to the drawer's
  conditional render in `FlowCanvas.jsx` (search for
  `selected.data.type === "..."` — each block type has one block there).
  Config lives in `node.config` (arbitrary JSON, no schema) and is read by
  the adapter via `node.config.whateverKey` — see `websiteAudit.js`
  (`disabled_checks`) or `emailFinder.js` (`strategies`) for the pattern.

## 5. Verify

There's no automated test suite for the flow engine — verify by hand, the
same way every block above was built:
1. Direct-call the adapter against hand-inserted `leads` rows with
   `flow_node_id` set to a node of your new type, and confirm the DB state
   changes as expected.
2. Build a small graph (a plain object, no need for the real `flows` table)
   with your block wired in, call `jobs/flowEngine.js`'s `handleFlowNode`
   against a hand-inserted `jobs` row, and confirm `leads.flow_node_id`
   advances correctly afterward.
3. Only then wire it up through the real `POST /api/flows` + UI and confirm
   the same thing through a live campaign.
