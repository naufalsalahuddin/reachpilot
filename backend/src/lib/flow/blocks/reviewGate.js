"use strict";
/** Flow block: human review gate — a pure routing marker, never dispatched as a
 * job (no `run`). A lead's flow_node_id parks here until routes/review.js's
 * decide/decide-bulk endpoints resolve the node's approved/rejected edge. */
module.exports = {
  type: "review_gate",
};
