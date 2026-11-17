"use client";

/**
 * FlowCanvas — the React Flow projection of the AM2 graph.
 *
 * The canvas is a RENDERER only (§2): every semantic action is delegated
 * upward through callbacks; the graph never lives in React Flow state.
 *
 * Interaction patterns implemented here (studied examples — see the report):
 * - typed ports with live compatibility highlighting (chaiNNer);
 * - invalid connections rejected with an inline reason, never silently;
 * - drag-to-empty-canvas quick-add filtered by the dragged port type
 *   (chaiNNer / ComfyUI double-click palette);
 * - run overlay: per-node status + animated edge only into the currently
 *   running node (real status, no fake data flow);
 * - keyboard: Delete (guarded against text inputs), Ctrl+Z/Ctrl+Shift+Z,
 *   fit-view button, upstream/downstream dimming on selection.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ACTION_CATALOG, PALETTE_ORDER, actionSpec, actionTitleRu, canConnect, neighborsOf, portsForEditorStage, type Am2ActionId, type EditorGraph as Am2Graph, type EditorGraphNode, type EditorSelection, type EditorValidationError, type PortKind, type StageStatus } from "./adapter";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";
import { EDITOR_NODE_TYPES, type Am2FlowNode, type OperationNodeData, type ExternalNodeData, type RunArtifactChip } from "./FlowNodes";
import { edgeColor } from "./kinds";

type Am2RunView = { stages: Array<{
  stageId: string;
  status: StageStatus;
  attempts: Array<{ attemptNumber: number; startedAt: string | null; finishedAt: string | null; error: { message?: string } | null }>;
  artifacts: Array<{ id: string; kind: string; validity: string; bankId: string | null; attemptId: string | null }>;
  nodeCheckpoints: unknown[];
}> };

export interface FocusRequest {
  nodeId: string;
  portName?: string;
  nonce: number;
}

export interface FlowCanvasProps {
  graph: Am2Graph;
  positions: Record<string, { x: number; y: number }>;
  selection: EditorSelection | null;
  editable: boolean;
  runView: Am2RunView | null;
  assetLabel: string | null;
  briefLabel: string | null;
  focusRequest: FocusRequest | null;
  /** Bump to re-fit the view (after auto-layout or mode switch). */
  fitNonce: number;
  validationErrors?: EditorValidationError[];
  onSelect: (selection: EditorSelection | null) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onBeginMove: () => void;
  onSettleMove: () => void;
  onConnectChecked: (from: string, fromPort: string, to: string, toPort: string) => { ok: true } | { ok: false; code: string; reason: string };
  onRemoveNode: (nodeId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onQuickAdd: (actionId: Am2ActionId, position: { x: number; y: number }, connectFrom: { nodeId: string; port: string; direction: "out" | "in" } | null) => void;
  onDropItem: (item: { type: "action"; actionId: Am2ActionId } | { type: "external"; kind: "audio" | "brief" }, position: { x: number; y: number }) => void;
  onUndo: () => void;
  onRedo: () => void;
}

interface QuickAddState {
  screenX: number;
  screenY: number;
  flowX: number;
  flowY: number;
  source: { nodeId: string; port: string; direction: "out" | "in" };
  /** Actions that can accept (direction "out") or produce (direction "in") the dragged kind. */
  actions: Am2ActionId[];
  sourceKindLabel: string;
}

const nodeTypes: NodeTypes = EDITOR_NODE_TYPES;

function FlowCanvasInner(props: FlowCanvasProps) {
  const { graph, positions, selection, editable, runView, focusRequest } = props;
  const { setCenter, screenToFlowPosition, fitView } = useReactFlow();
  const [connectSource, setConnectSource] = useState<{ nodeId: string; port: string; direction: "out" | "in"; kind: PortKind | "audio" } | null>(null);
  const [rejection, setRejection] = useState<{ code: string; reason: string } | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null);
  const rejectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusNonce = useRef(-1);

  // ----- derive bindings from EDGES (single source of truth) ----------------
  // Labels are the HUMAN titles (RU); the full source list stays in the
  // tooltip and the Inspector (details).
  const bindingsByStage = useMemo(() => {
    const map = new Map<string, Record<string, Array<{ label: string; external: boolean }>>>();
    for (const node of graph.nodes) {
      if (node.type === "operation") map.set(node.id, {});
    }
    for (const edge of graph.edges) {
      if (edge.kind !== "data") continue;
      const entry = map.get(edge.to);
      if (!entry) continue;
      const fromNode = graph.nodes.find((candidate) => candidate.id === edge.from);
      const label =
        fromNode?.type === "operation"
          ? actionTitleRu(fromNode.stage.actionId)
          : fromNode?.type === "external"
            ? fromNode.externalKind === "audio"
              ? "аудио"
              : "Brief (внешний)"
            : edge.from;
      entry[edge.toPort] = [...(entry[edge.toPort] ?? []), { label, external: fromNode?.type === "external" }];
    }
    return map;
  }, [graph]);

  // ----- unused external inputs (no outgoing edges at all) ------------------
  const unusedExternals = useMemo(() => {
    const used = new Set(graph.edges.map((edge) => edge.from));
    const unused = new Set<string>();
    for (const node of graph.nodes) {
      if (node.type === "external" && !used.has(node.id)) unused.add(node.id);
    }
    return unused;
  }, [graph]);

  const upstreamDownstream = useMemo(() => {
    if (!selection || selection.type !== "node" || selection.id.startsWith("ext:")) return null;
    return neighborsOf(graph, selection.id);
  }, [graph, selection]);

  // ----- run status by stageId ----------------------------------------------
  const runStageById = useMemo(() => {
    const map = new Map<string, NonNullable<Am2RunView>["stages"][number]>();
    if (runView) for (const stage of runView.stages) map.set(stage.stageId, stage);
    return map;
  }, [runView]);

  // ----- highlight compatible ports during a drag ---------------------------
  const highlightByNode = useMemo(() => {
    if (!connectSource) return null;
    const map = new Map<string, string[]>();
    if (connectSource.direction === "out") {
      if (connectSource.kind === "audio") {
        for (const node of graph.nodes) {
          if (node.type === "operation" && ACTION_CATALOG[node.stage.actionId]?.needsAudio) map.set(node.id, ["audio"]);
        }
      } else {
        for (const node of graph.nodes) {
          if (node.type !== "operation") continue;
          const ports = portsForEditorStage(node.stage, graph.nodes.filter((item): item is EditorGraphNode => item.type === "operation").map((item) => item.stage)).inputs.filter((port) => port.kind === connectSource.kind).map((port) => port.name);
          if (ports.length) map.set(node.id, ports);
        }
      }
    } else {
      // dragging FROM an input port: highlight producers with a compatible output
      for (const node of graph.nodes) {
        if (node.type === "operation") {
          const ports = portsForEditorStage(node.stage, graph.nodes.filter((item): item is EditorGraphNode => item.type === "operation").map((item) => item.stage)).outputs.filter((output) => output.kind === connectSource.kind).map((output) => output.port);
          if (ports.length) map.set(node.id, ports);
        } else if (node.type === "external" && node.externalKind === "brief" && connectSource.kind === "brief") {
          map.set(node.id, ["brief"]);
        }
      }
    }
    return map;
  }, [connectSource, graph]);

  // ----- nodes & edges ------------------------------------------------------
  const nodes: Am2FlowNode[] = useMemo(() => {
    const result: Am2FlowNode[] = [];
    for (const node of graph.nodes) {
      const position = positions[node.id] ?? { x: 40, y: 40 };
      const dimmed = upstreamDownstream !== null && node.id !== selection?.id && !upstreamDownstream.upstream.has(node.id) && !upstreamDownstream.downstream.has(node.id);
      if (node.type === "external") {
        result.push({
          id: node.id,
          type: "external",
          position,
          data: {
            externalKind: node.externalKind,
            outputPort: node.outputPort,
            outputKind: node.outputKind,
            label: node.label,
            readOnlyReason: node.readOnlyReason,
            assetLabel: node.externalKind === "audio" ? props.assetLabel : null,
            briefLabel: node.externalKind === "brief" ? props.briefLabel : null,
            dimmed,
            highlightPorts: null,
            unused: unusedExternals.has(node.id),
          } satisfies ExternalNodeData,
          deletable: editable,
          draggable: editable,
        });
        continue;
      }
      const runStage = runStageById.get(node.id) ?? null;
      const attempts = runStage?.attempts ?? [];
      const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
      const durationMs =
        lastAttempt?.startedAt && lastAttempt.finishedAt
          ? new Date(lastAttempt.finishedAt).getTime() - new Date(lastAttempt.startedAt).getTime()
          : null;
      const artifacts: RunArtifactChip[] = (runStage?.artifacts ?? []).map((artifact) => ({
        artifactId: artifact.id,
        kind: artifact.kind,
        validity: artifact.validity,
        bankId: artifact.bankId,
        attemptId: artifact.attemptId,
        label: `${artifact.id.slice(0, 14)}…`,
      }));
      const reusedNodes = runStage?.nodeCheckpoints.length ?? 0;
      result.push({
        id: node.id,
        type: "operation",
        position,
        data: {
          stage: node.stage as AutomationStageDefinition,
          spec: { ...(ACTION_CATALOG[node.stage.actionId] ?? actionSpec(node.stage.actionId, node.stage, graph.nodes.filter((item): item is EditorGraphNode => item.type === "operation").map((item) => item.stage))), ...portsForEditorStage(node.stage, graph.nodes.filter((item): item is EditorGraphNode => item.type === "operation").map((item) => item.stage)) },
          ordinal: node.ordinal,
          bindings: bindingsByStage.get(node.id) ?? {},
          portErrors: Object.fromEntries((props.validationErrors ?? []).filter((error) => error.nodeId === node.id && error.portId).map((error) => [error.portId!, error.message])),
          highlightPorts: highlightByNode?.get(node.id) ?? null,
          dimmed,
          run: runStage
            ? {
                status: runStage.status as StageStatus,
                attemptLabel: lastAttempt ? String(lastAttempt.attemptNumber) : null,
                durationMs,
                reusedNodes,
                errorSummary: lastAttempt?.error?.message ?? null,
                artifacts,
              }
            : null,
          editable: actionSpec(node.stage.actionId, node.stage).editable,
          readOnlyReason: actionSpec(node.stage.actionId, node.stage).readOnlyReason,
        } satisfies OperationNodeData,
        deletable: editable && actionSpec(node.stage.actionId, node.stage).editable,
        draggable: editable && actionSpec(node.stage.actionId, node.stage).editable,
      });
    }
    return result;
  }, [graph, positions, bindingsByStage, highlightByNode, runStageById, upstreamDownstream, selection, editable, props.assetLabel, props.briefLabel, props.validationErrors, unusedExternals]);

  const edges: Edge[] = useMemo(() => {
    return graph.edges.map((edge) => {
      const isDependency = edge.kind !== "data";
      const targetRunning = (() => {
        if (!runView) return false;
        const stage = runView.stages.find((candidate) => candidate.stageId === edge.to);
        return stage?.status === "running";
      })();
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        sourceHandle: edge.fromPort,
        targetHandle: edge.toPort,
        type: "smoothstep",
        animated: targetRunning, // real execution only — no fake flow
        label: edge.kind === "audio-dependency" ? "audio" : edge.kind === "order" ? "порядок" : edge.dataKind,
        labelShowBg: true,
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "hsl(var(--card))" },
        labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 9 },
        style: {
          stroke: edgeColor(edge.dataKind, isDependency),
          strokeWidth: selection?.type === "edge" && selection.id === edge.id ? 3 : 1.75,
          strokeDasharray: isDependency ? "5 4" : undefined,
        },
        // No hidden conversions: the edge carries exactly one kind.
        data: { kind: edge.dataKind, isDependency },
        deletable: !edge.derived && editable && (graph.nodes.find((node) => node.id === edge.from)?.type !== "operation" || actionSpec((graph.nodes.find((node) => node.id === edge.from) as EditorGraphNode).stage.actionId).editable) && (graph.nodes.find((node) => node.id === edge.to)?.type !== "operation" || actionSpec((graph.nodes.find((node) => node.id === edge.to) as EditorGraphNode).stage.actionId).editable),
        focusable: true,
      } satisfies Edge;
    });
  }, [graph.edges, runView, selection, editable]);

  // ----- interactions -------------------------------------------------------
  const showRejection = useCallback((code: string, reason: string) => {
    setRejection({ code, reason });
    if (rejectionTimer.current) clearTimeout(rejectionTimer.current);
    rejectionTimer.current = setTimeout(() => setRejection(null), 6000);
  }, []);

  const isValidConnection = useCallback(
    (edge: Edge | Connection): boolean => {
      const source = edge.source;
      const target = edge.target;
      const sourceHandle = edge.sourceHandle ?? undefined;
      const targetHandle = edge.targetHandle ?? undefined;
      if (!editable) return false;
      if (!source || !target || !sourceHandle || !targetHandle) return false;
      const check = canConnect(graph, source, sourceHandle, target, targetHandle);
      if (!check.ok) {
        showRejection(check.code, check.reason);
        return false;
      }
      return true;
    },
    [editable, graph, showRejection],
  );

  const onConnect = useCallback<OnConnect>(
    (connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
      const result = props.onConnectChecked(connection.source, connection.sourceHandle, connection.target, connection.targetHandle);
      if (!result.ok) showRejection(result.code, result.reason);
    },
    [props],
  );

  const onConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, state: { nodeId?: string | null; handleId?: string | null; handleType?: string | null }) => {
      const nodeId = state.nodeId ?? undefined;
      const handleId = state.handleId ?? undefined;
      const handleType = state.handleType;
      if (!nodeId || !handleId || !handleType) return;
      const direction = handleType === "source" ? "out" : "in";
      let kind: PortKind | "audio" | null = null;
      if (nodeId === "ext:audio") kind = "audio";
      else if (nodeId === "ext:brief") kind = "brief";
      else {
        const node = graph.nodes.find((candidate) => candidate.id === nodeId);
        if (node?.type === "operation") {
          const spec = portsForEditorStage(node.stage, graph.nodes.filter((item): item is EditorGraphNode => item.type === "operation").map((item) => item.stage));
          kind =
            direction === "out"
              ? (spec.outputs.find((output) => output.port === handleId)?.kind ?? null)
              : (spec.inputs.find((input) => input.name === handleId)?.kind ?? null);
        }
      }
      if (!kind) return;
      setConnectSource({ nodeId, port: handleId, direction, kind });
    },
    [graph],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const source = connectSource;
      setConnectSource(null);
      if (!source || !editable) return;
      const target = event.target as HTMLElement;
      const droppedOnPane = target.classList.contains("react-flow__pane");
      if (!droppedOnPane) return;
      const clientX = "clientX" in event ? event.clientX : 0;
      const clientY = "clientY" in event ? event.clientY : 0;
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      // Quick-add: list compatible operations for the dragged port type.
      const actions = PALETTE_ORDER.filter((actionId) => {
        const spec = ACTION_CATALOG[actionId] ?? actionSpec(actionId);
        if (source.direction === "out") {
          return source.kind === "audio"
            ? Boolean(spec.needsAudio)
            : spec.inputs.some((input) => input.kind === source.kind);
        }
        return spec.outputs.some((output) => output.kind === source.kind);
      });
      setQuickAdd({
        screenX: clientX,
        screenY: clientY,
        flowX: flow.x,
        flowY: flow.y,
        source: { nodeId: source.nodeId, port: source.port, direction: source.direction },
        actions,
        sourceKindLabel: source.kind,
      });
    },
    [connectSource, editable, screenToFlowPosition],
  );

  const onNodeDragStart = useCallback(() => {
    if (editable) props.onBeginMove();
  }, [editable, props]);

  const onNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Am2FlowNode) => {
      if (editable) props.onMoveNode(node.id, node.position);
    },
    [editable, props],
  );

  const onNodeDragStop = useCallback(() => {
    if (editable) props.onSettleMove();
  }, [editable, props]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      props.onSelect({ type: "node", id: node.id });
    },
    [props],
  );

  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (_event, edge) => {
      props.onSelect({ type: "edge", id: edge.id });
    },
    [props],
  );

  const onPaneClick = useCallback(() => {
    props.onSelect(null);
    setQuickAdd(null);
  }, [props]);

  // Palette drag-and-drop onto the canvas.
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const action = event.dataTransfer.getData("application/am2-action");
      const external = event.dataTransfer.getData("application/am2-external");
      if (!action && !external) return;
      event.preventDefault();
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      if (action) {
        props.onDropItem({ type: "action", actionId: action as Am2ActionId }, flow);
      } else if (external) {
        props.onDropItem({ type: "external", kind: external as "audio" | "brief" }, flow);
      }
    },
    [props, screenToFlowPosition],
  );

  // ----- keyboard (guarded against text inputs) ------------------------------
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) props.onRedo();
        else props.onUndo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        if (typing) return;
        event.preventDefault();
        props.onRedo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !typing) {
        if (!selection) return;
        event.preventDefault();
        if (selection.type === "node") props.onRemoveNode(selection.id);
        else props.onRemoveEdge(selection.id);
      }
      if (event.key === "Escape") setQuickAdd(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [props, selection]);

  // ----- focus requests (validation panel / search) --------------------------
  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === lastFocusNonce.current) return;
    lastFocusNonce.current = focusRequest.nonce;
    const node = nodes.find((candidate) => candidate.id === focusRequest.nodeId);
    if (!node) return;
    props.onSelect({ type: "node", id: focusRequest.nodeId });
    setCenter(node.position.x + 130, node.position.y + 80, { zoom: 1.05, duration: 400 });
  }, [focusRequest, nodes, props, setCenter]);

  // ----- re-fit after auto-layout ---------------------------------------------
  const lastFitNonce = useRef(props.fitNonce);
  useEffect(() => {
    if (props.fitNonce === lastFitNonce.current) return;
    lastFitNonce.current = props.fitNonce;
    fitView({ padding: 0.25, maxZoom: 1, duration: 400 });
  }, [props.fitNonce, fitView]);

  return (
    <div className="relative h-full w-full" role="application" aria-label="Полотно конструктора сценариев">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        isValidConnection={isValidConnection}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        deleteKeyCode={null}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: connectSource ? edgeColor(connectSource.kind === "audio" ? undefined : connectSource.kind, connectSource.kind === "audio") : "#78716c", strokeWidth: 2 }}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>

      {/* Inline rejection hint (§6: explain WHY a connection was rejected) */}
      {rejection && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-10 w-[min(560px,92%)] -translate-x-1/2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-[11px] text-red-800 shadow-sm" role="alert">
          <span className="font-semibold">Связь отклонена ({rejection.code}):</span> {rejection.reason}
        </div>
      )}

      {/* Empty state */}
      {graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto max-w-sm rounded-lg border border-dashed border-border bg-card/90 p-5 text-center shadow-sm">
            <p className="text-sm font-semibold">Сценарий пуст</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Добавьте операции из палитры слева или перетащите выход порта на пустое полотно — появится меню совместимых узлов.
            </p>
          </div>
        </div>
      )}

      {/* Quick-add menu (drop on empty canvas) */}
      {quickAdd && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setQuickAdd(null)} aria-hidden />
          <div
            className="absolute z-30 max-h-80 w-72 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-lg"
            style={{
              left: Math.min(quickAdd.screenX, window.innerWidth - 300),
              top: Math.min(quickAdd.screenY, window.innerHeight - 340),
            }}
            role="menu"
            aria-label={`Быстрое добавление: совместимые операции для типа ${quickAdd.sourceKindLabel}`}
          >
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Совместимо с «{quickAdd.sourceKindLabel}»
            </p>
            {quickAdd.actions.length === 0 && <p className="px-2 py-2 text-[11px] text-muted-foreground">Нет операций под этот тип порта.</p>}
            {quickAdd.actions.map((actionId) => {
              const spec = ACTION_CATALOG[actionId] ?? actionSpec(actionId);
              return (
                <button
                  key={actionId}
                  type="button"
                  role="menuitem"
                  className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    props.onQuickAdd(actionId, { x: quickAdd.flowX, y: quickAdd.flowY }, quickAdd.source);
                    setQuickAdd(null);
                  }}
                >
                  <span className="text-xs font-medium">{actionTitleRu(actionId)}</span>
                  <span className="font-mono text-[9px] text-muted-foreground">{actionId}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
