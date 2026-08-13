import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position,
  addEdge, useNodesState, useEdgesState, useReactFlow,
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, TIMEZONES } from "../api.js";
import { Icon } from "../icons.jsx";
import { AUDIT_CHECK_GROUPS, HOOK_VARIABLES, PAGESPEED_VARIABLES, EMAIL_FINDER_STRATEGIES, EMAIL_FINDER_VERIFY, BLOCK_DESCRIPTIONS } from "../flowConstants.js";
import InsertVariable from "../components/InsertVariable.jsx";
import CsvDropzone from "../components/CsvDropzone.jsx";

const CONDITIONS = [
  ["hook_found", "Audit found a pitchable hook"],
  ["no_hook", "Audit found nothing to pitch"],
  ["has_email", "Lead has an email"],
  ["no_email", "Lead has no email"],
  ["is_suppressed", "Lead is on the suppression list"],
  ["pagespeed_mobile_below", "Mobile PageSpeed score below…"],
  ["lint_score_below", "Spam-lint score below…"],
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const BLOCK_META = {
  lead_source: { icon: "blockSource", color: "#1c97e6" },
  website_audit: { icon: "blockAudit", color: "#6c5ce7" },
  pagespeed: { icon: "blockPagespeed", color: "#6c5ce7" },
  email_finder: { icon: "blockEmail", color: "#6c5ce7" },
  ai_draft: { icon: "blockAi", color: "#6c5ce7" },
  pdf_report: { icon: "blockPdf", color: "#6c5ce7" },
  review_gate: { icon: "blockReview", color: "#b3821a" },
  send: { icon: "blockSend", color: "#00875a" },
  branch: { icon: "blockBranch", color: "#b3821a" },
};

const BRANCH_HANDLES = { branch: ["true", "false"], review_gate: ["approved", "rejected"] };

// Zapier-style eyebrow shown above the block's name — purely a visual category hint.
const BLOCK_CATEGORY = { lead_source: "Trigger", branch: "Condition", review_gate: "Review" };
const categoryFor = (type) => BLOCK_CATEGORY[type] || "Action";

// ---- default starter graph ("Classic": mirrors the legacy fixed pipeline) ----
// Backend graph_json shape — same shape returned by GET /api/flows/:id, so it can
// be passed straight into <FlowCanvas initialGraph> either way.
export function classicStarterGraph() {
  return {
    entry: "n1",
    nodes: [
      { id: "n1", type: "lead_source", position: { x: 0, y: 80 } },
      { id: "n2", type: "website_audit", position: { x: 280, y: 80 } },
      { id: "n3", type: "branch", config: { condition: "hook_found" }, position: { x: 560, y: 80 } },
      { id: "n4", type: "ai_draft", position: { x: 860, y: 0 } },
      { id: "n5", type: "email_finder", position: { x: 1140, y: 0 } },
      { id: "n6", type: "review_gate", position: { x: 1420, y: 0 } },
      { id: "n7", type: "send", position: { x: 1700, y: 0 } },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", when: "true" },
      { from: "n3", to: null, when: "false" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7", when: "approved" },
      { from: "n6", to: null, when: "rejected" },
    ],
  };
}

// ---- graph_json <-> React Flow conversion ----
export function graphToFlow(graph) {
  const nodes = (graph.nodes || []).map((n, i) => ({
    id: n.id, type: "block",
    position: n.position || { x: (i % 5) * 280, y: Math.floor(i / 5) * 180 },
    data: { type: n.type, config: n.config || {} },
  }));
  const edges = (graph.edges || []).filter((e) => e.to != null).map((e) => ({
    id: `e-${e.from}-${e.to}-${e.when || "x"}`, source: e.from, target: e.to,
    sourceHandle: e.when || undefined, type: "flow",
  }));
  return { nodes, edges };
}

export function flowToGraph(nodes, edges) {
  const nodeList = nodes.map((n) => ({ id: n.id, type: n.data.type, config: n.data.config || {}, position: n.position }));
  const edgeList = [];
  for (const n of nodes) {
    const handles = BRANCH_HANDLES[n.data.type];
    if (handles) {
      for (const w of handles) {
        const e = edges.find((e) => e.source === n.id && e.sourceHandle === w);
        edgeList.push({ from: n.id, to: e ? e.target : null, when: w });
      }
    } else {
      const e = edges.find((e) => e.source === n.id);
      edgeList.push({ from: n.id, to: e ? e.target : null });
    }
  }
  const sourceNode = nodes.find((n) => n.data.type === "lead_source");
  const entry = sourceNode ? sourceNode.id : (nodes[0] ? nodes[0].id : null);
  return { entry, nodes: nodeList, edges: edgeList };
}

function BlockNode({ data, selected }) {
  const handles = BRANCH_HANDLES[data.type];
  const meta = BLOCK_META[data.type] || {};
  const isStart = data.type === "lead_source";
  return (
    <div className={`flow-node${selected ? " selected" : ""}${isStart ? " trigger" : ""}`} style={{ "--accent": meta.color || "var(--muted)" }}>
      {!isStart && <Handle type="target" position={Position.Left} />}
      <div className="flow-node-icon">{Icon[meta.icon]}</div>
      <div className="flow-node-body">
        <div className="flow-node-eyebrow">{categoryFor(data.type)}</div>
        <div className="flow-node-label">{data.label}</div>
        {data.sub && <div className="flow-node-sub">{data.sub}</div>}
      </div>
      {handles ? handles.map((h, i) => (
        <React.Fragment key={h}>
          <Handle type="source" position={Position.Right} id={h} style={{ top: `${34 + i * 26}%` }} />
          <div className={`flow-node-handle-label ${h}`} style={{ top: `${34 + i * 26}%` }}>{h}</div>
        </React.Fragment>
      )) : <Handle type="source" position={Position.Right} />}
    </div>
  );
}

const nodeTypes = { block: BlockNode };

// Zapier-style connector: a smooth right-angled path with a small "+" that drops a
// new block in the middle of this exact edge (rewiring source->new->target).
function InsertEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 14 });
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {data?.onInsert && (
        <EdgeLabelRenderer>
          <div className="flow-edge-add-wrap" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            <button
              className="flow-edge-add" title="Insert a step here"
              onClick={(e) => { e.stopPropagation(); data.onInsert(id, e.clientX, e.clientY); }}
            >
              {Icon.plus}
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const edgeTypes = { flow: InsertEdge };

function Canvas({ initialGraph, palette, onChange, readOnly, campaign, setCampaignField, providers, campaignId, designs, accounts, onToggleAccount }) {
  const initial = useMemo(() => graphToFlow(initialGraph), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { x, y, nodeId }
  const [insertMenu, setInsertMenu] = useState(null); // { x, y, edgeId }
  const idCounter = useRef(initial.nodes.length + 1);
  const { screenToFlowPosition } = useReactFlow();

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => { if (onChangeRef.current) onChangeRef.current(flowToGraph(nodes, edges)); }, [nodes, edges]);

  const label = (type) => palette.find((p) => p.type === type)?.label || type;
  const decorated = useMemo(() => nodes.map((n) => ({
    ...n,
    data: { ...n.data, label: label(n.data.type), sub: n.data.type === "branch" ? (CONDITIONS.find(([v]) => v === n.data.config.condition)?.[1] || "") : "" },
  })), [nodes, palette]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback((params) => {
    if (readOnly) return;
    setEdges((eds) => {
      const filtered = eds.filter((e) => !(e.source === params.source && e.sourceHandle === params.sourceHandle));
      return addEdge({ ...params, type: "flow" }, filtered);
    });
  }, [setEdges, readOnly]);

  const hasLeadSource = nodes.some((n) => n.data.type === "lead_source");

  const addBlock = (type, position) => {
    if (type === "lead_source" && hasLeadSource) return; // single initiator, enforced
    const id = `n${idCounter.current++}`;
    const config = type === "branch" ? { condition: "hook_found" } : {};
    setNodes((ns) => [...ns, { id, type: "block", position: position || { x: 80 + (ns.length % 5) * 60, y: 460 + Math.floor(ns.length / 5) * 40 }, data: { type, config } }]);
    setSelectedId(id);
  };

  // Zapier-style "insert step here": splits one edge into source->newBlock->target,
  // preserving the original edge's branch label (sourceHandle) on the incoming side.
  const insertNodeOnEdge = (edgeId, type) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge || (type === "lead_source" && hasLeadSource)) { setInsertMenu(null); return; }
    const srcNode = nodes.find((n) => n.id === edge.source);
    const tgtNode = nodes.find((n) => n.id === edge.target);
    const id = `n${idCounter.current++}`;
    const config = type === "branch" ? { condition: "hook_found" } : {};
    const position = srcNode && tgtNode
      ? { x: (srcNode.position.x + tgtNode.position.x) / 2, y: (srcNode.position.y + tgtNode.position.y) / 2 }
      : { x: 80, y: 460 };
    setNodes((ns) => [...ns, { id, type: "block", position, data: { type, config } }]);
    setEdges((es) => {
      const rest = es.filter((e) => e.id !== edgeId);
      const inEdge = { id: `e-${edge.source}-${id}-${edge.sourceHandle || "x"}`, source: edge.source, target: id, sourceHandle: edge.sourceHandle, type: "flow" };
      const handles = BRANCH_HANDLES[type];
      const outEdge = handles
        ? { id: `e-${id}-${edge.target}-${handles[0]}`, source: id, target: edge.target, sourceHandle: handles[0], type: "flow" }
        : { id: `e-${id}-${edge.target}-x`, source: id, target: edge.target, type: "flow" };
      return [...rest, inEdge, outEdge];
    });
    setSelectedId(id);
    setInsertMenu(null);
  };

  const removeNode = (id) => {
    if (!id) return;
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId((s) => (s === id ? null : s));
    setContextMenu(null);
  };
  const removeSelected = () => removeNode(selectedId);

  const duplicateNode = (id) => {
    const src = nodes.find((n) => n.id === id);
    if (!src || src.data.type === "lead_source") { setContextMenu(null); return; } // single initiator
    const newId = `n${idCounter.current++}`;
    setNodes((ns) => [...ns, { id: newId, type: "block", position: { x: src.position.x + 40, y: src.position.y + 40 }, data: { type: src.data.type, config: { ...src.data.config } } }]);
    setSelectedId(newId);
    setContextMenu(null);
  };

  const selected = nodes.find((n) => n.id === selectedId);
  const setSelectedConfig = (patch) => setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n)));
  const pitchRulesRef = useRef();
  const [csv, setCsv] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const importCsv = async () => {
    if (!csv.trim()) { setImportMsg("Paste or choose a CSV first"); return; }
    if (!campaignId) { setImportMsg("Save the campaign first"); return; }
    setImportMsg("Importing…");
    try {
      const r = await api(`/api/campaigns/${campaignId}/import`, { method: "POST", body: { csv } });
      setImportMsg(`Queued ${r.parsed} lead(s)${r.skipped ? `, ${r.skipped} skipped` : ""} in ${r.chunks} batch(es).`);
      setCsv("");
    } catch (e) { setImportMsg(e.message); }
  };

  // Which block types feed INTO nodeId, walking edges backward — used to decide
  // which "insert variable" tokens actually make sense to offer (e.g. only show
  // PageSpeed tokens if a pagespeed block really runs before this one).
  const getUpstreamTypes = useCallback((nodeId) => {
    const types = new Set();
    const visited = new Set();
    const walk = (id) => {
      for (const e of edges) {
        if (e.target === id && !visited.has(e.source)) {
          visited.add(e.source);
          const n = nodes.find((nn) => nn.id === e.source);
          if (n) { types.add(n.data.type); walk(e.source); }
        }
      }
    };
    walk(nodeId);
    return types;
  }, [nodes, edges]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    if (readOnly) return;
    const type = e.dataTransfer.getData("application/flow-block");
    if (!type) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addBlock(type, position);
  }, [readOnly, screenToFlowPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const openInsertMenu = useCallback((edgeId, x, y) => {
    if (readOnly) return;
    setContextMenu(null);
    setPickerSearch("");
    setInsertMenu({ edgeId, x, y });
  }, [readOnly]);

  const edgesForRender = useMemo(() => edges.map((e) => ({
    ...e, type: "flow", data: readOnly ? undefined : { onInsert: openInsertMenu },
  })), [edges, readOnly, openInsertMenu]);

  return (
    <div className="flow-canvas-wrap" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={decorated} edges={edgesForRender} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onNodesDelete={(deleted) => { if (deleted.some((n) => n.id === selectedId)) setSelectedId(null); }}
        onConnect={onConnect}
        onNodeClick={(_, n) => { setSelectedId(n.id); setContextMenu(null); setInsertMenu(null); }}
        onPaneClick={() => { setSelectedId(null); setContextMenu(null); setInsertMenu(null); }}
        onNodeContextMenu={(e, n) => { e.preventDefault(); if (readOnly) return; setSelectedId(n.id); setContextMenu({ x: e.clientX, y: e.clientY, nodeId: n.id }); }}
        onPaneContextMenu={(e) => { e.preventDefault(); if (readOnly) return; setContextMenu(null); }}
        onMoveStart={() => { setContextMenu(null); setInsertMenu(null); }}
        nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--faint)" } }}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background gap={20} color="var(--rule)" />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable style={{ background: "var(--surface)" }} maskColor="rgba(28,151,230,.06)" />
      </ReactFlow>

      {!readOnly && (
        <div className="flow-palette">
          <button className="flow-palette-btn" onClick={() => { setPickerOpen((o) => !o); setPickerSearch(""); }}>
            {Icon.search}
            <span className="flow-palette-tip">Browse blocks</span>
          </button>
          <div className="flow-palette-sep" />
          {palette.map((p) => {
            const disabled = p.initiator && hasLeadSource;
            return (
              <button key={p.type} className="flow-palette-btn" disabled={disabled} draggable={!disabled}
                onDragStart={(e) => e.dataTransfer.setData("application/flow-block", p.type)}
                onClick={() => addBlock(p.type)}>
                {Icon[BLOCK_META[p.type]?.icon]}
                <span className="flow-palette-tip">{disabled ? "Only one lead source allowed" : p.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {pickerOpen && !readOnly && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 14 }} onClick={() => setPickerOpen(false)} />
          <div className="flow-picker">
            <div className="flow-picker-search">
              {Icon.search}
              <input autoFocus placeholder="Search blocks…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
            </div>
            <div className="flow-picker-grid">
              {palette.filter((p) => {
                const q = pickerSearch.trim().toLowerCase();
                if (!q) return true;
                return p.label.toLowerCase().includes(q) || (BLOCK_DESCRIPTIONS[p.type] || "").toLowerCase().includes(q);
              }).map((p) => {
                const disabled = p.initiator && hasLeadSource;
                return (
                  <button key={p.type} className="flow-picker-card" disabled={disabled} onClick={() => { addBlock(p.type); setPickerOpen(false); }}>
                    <span className="flow-node-icon" style={{ "--accent": BLOCK_META[p.type]?.color }}>{Icon[BLOCK_META[p.type]?.icon]}</span>
                    <span>
                      <div style={{ fontWeight: 600 }}>{p.label}</div>
                      <div className="hint" style={{ marginTop: 2 }}>{disabled ? "Only one lead source allowed" : BLOCK_DESCRIPTIONS[p.type]}</div>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {insertMenu && !readOnly && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 14 }} onClick={() => setInsertMenu(null)} />
          <div className="flow-picker" style={{ position: "fixed", left: Math.min(insertMenu.x, window.innerWidth - 336), top: Math.min(insertMenu.y, window.innerHeight - 60) }}>
            <div className="flow-picker-search">
              {Icon.search}
              <input autoFocus placeholder="Insert a step…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
            </div>
            <div className="flow-picker-grid">
              {palette.filter((p) => {
                const q = pickerSearch.trim().toLowerCase();
                if (!q) return true;
                return p.label.toLowerCase().includes(q) || (BLOCK_DESCRIPTIONS[p.type] || "").toLowerCase().includes(q);
              }).map((p) => {
                const disabled = p.initiator && hasLeadSource;
                return (
                  <button key={p.type} className="flow-picker-card" disabled={disabled} onClick={() => insertNodeOnEdge(insertMenu.edgeId, p.type)}>
                    <span className="flow-node-icon" style={{ "--accent": BLOCK_META[p.type]?.color }}>{Icon[BLOCK_META[p.type]?.icon]}</span>
                    <span>
                      <div style={{ fontWeight: 600 }}>{p.label}</div>
                      <div className="hint" style={{ marginTop: 2 }}>{disabled ? "Only one lead source allowed" : BLOCK_DESCRIPTIONS[p.type]}</div>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {contextMenu && !readOnly && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 14 }} onClick={() => setContextMenu(null)} />
          <div className="flow-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={() => duplicateNode(contextMenu.nodeId)}>{Icon.copy} Duplicate</button>
            <button className="danger" onClick={() => removeNode(contextMenu.nodeId)}>{Icon.trash} Delete</button>
          </div>
        </>
      )}

      {selected && (
        <div className="flow-drawer">
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="flow-drawer-icon" style={{ background: (BLOCK_META[selected.data.type]?.color || "var(--muted)") + "22", color: BLOCK_META[selected.data.type]?.color || "var(--muted)" }}>{Icon[BLOCK_META[selected.data.type]?.icon]}</span>
            <h2 style={{ fontSize: 15, margin: 0 }}>{label(selected.data.type)}</h2>
            <span className="spacer" />
            <button className="ghost sm" onClick={() => setSelectedId(null)} aria-label="Close">{Icon.close}</button>
          </div>
          {!readOnly && <button className="sm danger" style={{ marginBottom: 14 }} onClick={removeSelected}>Remove block</button>}

          {selected.data.type === "branch" && (
            <div>
              <div className="field"><label className="fld">Condition</label>
                <select disabled={readOnly} value={selected.data.config.condition || "hook_found"} onChange={(e) => setSelectedConfig({ condition: e.target.value })}>
                  {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {(selected.data.config.condition === "pagespeed_mobile_below" || selected.data.config.condition === "lint_score_below") && (
                <div className="field"><label className="fld">Threshold</label><input disabled={readOnly} type="number" value={selected.data.config.threshold || ""} onChange={(e) => setSelectedConfig({ threshold: e.target.value })} /></div>
              )}
              <div className="hint">Drag from the <b>true</b>/<b>false</b> dots on the right edge of this block to wire its branches.</div>
            </div>
          )}
          {selected.data.type === "review_gate" && <div className="hint">Drag from the <b>approved</b>/<b>rejected</b> dots to wire what happens after a human decides.</div>}
          {selected.data.type === "send" && campaign && (
            <div>
              <div className="hint" style={{ marginBottom: 12 }}>Ends the flow by default — drag from the dot on its right edge (or use the + on its connector) to run one more step after sending.</div>

              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--brand-50)", border: "1px solid var(--brand-100)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                <input type="checkbox" style={{ marginTop: 2 }} disabled={readOnly} checked={!!campaign.attach_report_pdf} onChange={(e) => setCampaignField("attach_report_pdf", e.target.checked)} />
                <span><b style={{ fontSize: 13 }}>Attach the audit PDF</b><div className="hint" style={{ marginTop: 3 }}>On by default — a personalized report per lead.</div></span>
              </label>

              <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}><input type="checkbox" disabled={readOnly} checked={!!campaign.sending_enabled} onChange={(e) => setCampaignField("sending_enabled", e.target.checked)} /> Enable sending for this campaign</label>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}><input type="checkbox" disabled={readOnly} checked={!!campaign.track_opens} onChange={(e) => setCampaignField("track_opens", e.target.checked)} /> Track opens</label>
              <label style={{ display: "block", marginBottom: 14, fontSize: 13 }}><input type="checkbox" disabled={readOnly} checked={!!campaign.track_clicks} onChange={(e) => setCampaignField("track_clicks", e.target.checked)} /> Track clicks</label>

              <div className="field"><label className="fld">Unsubscribe link</label>
                <select disabled={readOnly} value={campaign.include_unsubscribe ?? ""} onChange={(e) => setCampaignField("include_unsubscribe", e.target.value)}>
                  <option value="">Use workspace default</option><option value="on">Always include</option><option value="off">Remove from this campaign</option>
                </select>
              </div>
              <div className="field"><label className="fld">Email design</label>
                <select disabled={readOnly} value={campaign.email_template_id || ""} onChange={(e) => setCampaignField("email_template_id", e.target.value)}>
                  <option value="">Plain text</option>{(designs || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field"><label className="fld">Timezone</label>
                <select disabled={readOnly} value={campaign.timezone || ""} onChange={(e) => setCampaignField("timezone", e.target.value)}>
                  <option value="">(app default)</option>{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <label style={{ display: "block", marginBottom: 12, fontSize: 13 }}><input type="checkbox" disabled={readOnly} checked={!!campaign.send_weekdays_only} onChange={(e) => setCampaignField("send_weekdays_only", e.target.checked)} /> Weekdays only</label>
              <div className="grid two">
                <div className="field"><label className="fld">Send from</label><select disabled={readOnly} value={campaign.send_start_hour ?? 0} onChange={(e) => setCampaignField("send_start_hour", +e.target.value)}>{HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></div>
                <div className="field"><label className="fld">Send until</label><select disabled={readOnly} value={campaign.send_end_hour ?? 24} onChange={(e) => setCampaignField("send_end_hour", +e.target.value)}>{HOURS.map((h) => <option key={h + 1} value={h + 1}>{String(h + 1).padStart(2, "0")}:00</option>)}</select></div>
              </div>
              <label className="fld" style={{ marginBottom: 6 }}>Delay between emails (min)</label>
              <div className="grid two">
                <div className="field"><input disabled={readOnly} type="number" min="0" value={Math.round((campaign.send_gap_min_sec ?? 120) / 60)} onChange={(e) => setCampaignField("send_gap_min_sec", (parseInt(e.target.value, 10) || 0) * 60)} /></div>
                <div className="field"><input disabled={readOnly} type="number" min="0" value={Math.round((campaign.send_gap_max_sec ?? 600) / 60)} onChange={(e) => setCampaignField("send_gap_max_sec", (parseInt(e.target.value, 10) || 0) * 60)} /></div>
              </div>
              <label className="fld">Inboxes to rotate across</label>
              {accounts?.all?.length ? accounts.all.map((a) => (
                <label key={a.id} style={{ display: "block", margin: "4px 0", fontSize: 13 }}>
                  <input type="checkbox" disabled={readOnly} checked={accounts.assigned.has(a.id)} onChange={() => onToggleAccount(a.id)} /> {a.name} <span className="hint">({a.method}, {a.sent_today}/{a.daily_cap})</span>
                </label>
              )) : <div className="hint">No accounts yet. Add one under Settings → Sending.</div>}
            </div>
          )}
          {selected.data.type === "pdf_report" && <div className="hint">Pre-builds the report content cache — doesn't decide whether a PDF is attached (that's under Settings).</div>}
          {selected.data.type === "website_audit" && (
            <div>
              <div className="hint" style={{ marginBottom: 10 }}>Turn off checks that don't apply to this industry — e.g. most retail businesses don't need "online booking".</div>
              {AUDIT_CHECK_GROUPS.map(([key, label]) => {
                const disabledList = selected.data.config.disabled_checks || [];
                return (
                  <label key={key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "6px 0" }}>
                    <input type="checkbox" disabled={readOnly} checked={!disabledList.includes(key)} onChange={() => setSelectedConfig({ disabled_checks: disabledList.includes(key) ? disabledList.filter((k) => k !== key) : [...disabledList, key] })} /> {label}
                  </label>
                );
              })}
            </div>
          )}
          {selected.data.type === "email_finder" && (
            <div>
              <div className="hint" style={{ marginBottom: 10 }}>Opportunistically upgrades a lead's email when it isn't a personal address yet — pick which strategies to try, in order.</div>
              {EMAIL_FINDER_STRATEGIES.map(([key, label, hint]) => {
                const list = selected.data.config.strategies || EMAIL_FINDER_STRATEGIES.map(([k]) => k);
                const on = list.includes(key);
                return (
                  <label key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, margin: "8px 0" }}>
                    <input type="checkbox" style={{ marginTop: 2 }} disabled={readOnly} checked={on} onChange={() => setSelectedConfig({ strategies: on ? list.filter((k) => k !== key) : [...list, key] })} />
                    <span><b>{label}</b><div className="hint" style={{ marginTop: 2 }}>{hint}</div></span>
                  </label>
                );
              })}
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, margin: "8px 0", paddingTop: 8, borderTop: "1px solid var(--rule-soft)" }}>
                <input type="checkbox" style={{ marginTop: 2 }} disabled={readOnly} checked={!!selected.data.config.verify} onChange={() => setSelectedConfig({ verify: !selected.data.config.verify })} />
                <span><b>{EMAIL_FINDER_VERIFY[1]}</b><div className="hint" style={{ marginTop: 2 }}>{EMAIL_FINDER_VERIFY[2]}</div></span>
              </label>
            </div>
          )}

          {selected.data.type === "lead_source" && campaign && (
            <div>
              <div className="segmented" style={{ marginBottom: 14, width: "100%" }}>
                <button type="button" style={{ flex: 1 }} className={(selected.data.config.mode || "search") === "search" ? "active" : ""} onClick={() => setSelectedConfig({ mode: "search" })}>Search providers</button>
                <button type="button" style={{ flex: 1 }} className={selected.data.config.mode === "csv" ? "active" : ""} onClick={() => setSelectedConfig({ mode: "csv" })}>Import CSV</button>
              </div>

              {(selected.data.config.mode || "search") === "search" ? (
                <>
                  <div className="field"><label className="fld">Industry</label><input disabled={readOnly} value={campaign.industry} onChange={(e) => setCampaignField("industry", e.target.value)} /></div>
                  <div className="field"><label className="fld">City</label><input disabled={readOnly} value={campaign.city} onChange={(e) => setCampaignField("city", e.target.value)} /></div>
                  <div className="field"><label className="fld">Data source</label>
                    <select disabled={readOnly} value={campaign.source_provider} onChange={(e) => setCampaignField("source_provider", e.target.value)}>
                      <option value="google_places">Google Places</option>
                      <option value="foursquare">Foursquare Places</option>
                      <option value="yelp">Yelp Fusion</option>
                    </select>
                  </div>
                  <div className="grid two">
                    <div className="field"><label className="fld">Min reviews</label><input disabled={readOnly} type="number" value={campaign.min_reviews} onChange={(e) => setCampaignField("min_reviews", e.target.value)} /></div>
                    <div className="field"><label className="fld">Leads per run</label><input disabled={readOnly} type="number" value={campaign.leads_per_run} onChange={(e) => setCampaignField("leads_per_run", e.target.value)} /></div>
                  </div>
                  <div className="hint">Runs when you click Run on this campaign.</div>
                </>
              ) : (
                <>
                  <div className="hint" style={{ marginBottom: 10 }}>First row is a header: <span className="mono">name, website, email, phone, city, reviews</span>. Imported leads skip straight to the next block.</div>
                  <CsvDropzone csv={csv} onCsvChange={setCsv} compact />
                  {!readOnly && <div className="row" style={{ marginTop: 10 }}><button className="primary sm" onClick={importCsv}>Import now</button></div>}
                  {importMsg && <div className="hint" style={{ marginTop: 6 }}>{importMsg}</div>}
                </>
              )}
            </div>
          )}

          {selected.data.type === "ai_draft" && campaign && (
            <div>
              <div className="field"><label className="fld">Writer</label>
                <div className="segmented">{(providers || ["template"]).map((p) => <button key={p} type="button" disabled={readOnly} className={campaign.ai_provider === p ? "active" : ""} onClick={() => setCampaignField("ai_provider", p)}>{p === "template" ? "Templates" : p}</button>)}</div>
              </div>
              <div className="field"><label className="fld">Model (optional)</label><input disabled={readOnly} value={campaign.ai_model} onChange={(e) => setCampaignField("ai_model", e.target.value)} placeholder="leave blank for default" /></div>
              <div className="field"><label className="fld">Sender name</label><input disabled={readOnly} value={campaign.sender_name} onChange={(e) => setCampaignField("sender_name", e.target.value)} /></div>
              <div className="field">
                <div className="row" style={{ marginBottom: 6 }}><label className="fld" style={{ margin: 0 }}>Pitch rules</label><span className="spacer" />
                  <InsertVariable
                    options={[...HOOK_VARIABLES, ...(getUpstreamTypes(selected.id).has("pagespeed") ? PAGESPEED_VARIABLES : [])]}
                    textareaRef={pitchRulesRef} value={campaign.pitch_rules} onChange={(v) => setCampaignField("pitch_rules", v)}
                  />
                </div>
                <textarea ref={pitchRulesRef} disabled={readOnly} rows={3} value={campaign.pitch_rules} onChange={(e) => setCampaignField("pitch_rules", e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FlowCanvas(props) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}

export function useBlockPalette() {
  const [palette, setPalette] = useState([]);
  React.useEffect(() => { api("/api/flows/blocks").then(setPalette).catch(() => setPalette([])); }, []);
  return palette;
}
