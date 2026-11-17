import { AUTOMATION_ACTION_IDS, type AutomationActionId, type AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";
import { portsForStage, type AutomationGraph } from "@/lib/am-stage-automation/typed-graph";
import { ACTION_SUPPORTED, AUTOMATION_SCENARIOS } from "@/lib/am-stage-automation/catalog";
import actionMetadata from "@/lib/am-stage-automation/am2-nodeflow-action-metadata.json";

export type PortKind = string;
export type Am2ActionId = AutomationActionId;
export type EditorSelection = { type: "node"; id: string } | { type: "edge"; id: string };
export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted" | "skipped";

export interface EditorSettingSpec {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "json" | "action-list" | "string-list";
  options?: string[];
  min?: number;
  max?: number;
  default?: unknown;
  description?: string;
  jsonEditor?: string;
  editable: boolean;
  readOnlyReason?: string;
}

export interface EditorActionSpec {
  actionId: AutomationActionId;
  title: string;
  family: string;
  inputs: Array<{ name: string; kind: string; required: boolean; multiple?: boolean; accepts?: string[] }>;
  outputs: Array<{ port: string; kind: string; required: boolean }>;
  needsAudio: boolean;
  needsBrief: boolean;
  editable: boolean;
  readOnlyReason?: string;
  settings: EditorSettingSpec[];
}

export interface EditorGraphNode {
  id: string;
  type: "operation";
  stage: AutomationStageDefinition;
  ordinal: number;
}

export interface EditorGraphExternalNode {
  id: string;
  type: "external";
  externalKind: "audio" | "brief" | "unknown";
  outputPort: string;
  outputKind: string | null;
  label?: string;
  readOnlyReason?: string;
}

export interface EditorGraphEdge {
  id: string;
  kind: "data" | "order";
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
  dataKind: string;
  bindingFrom?: string;
  bindingPort?: string;
  bindingName?: string;
  derived?: boolean;
}

export interface EditorGraph {
  nodes: Array<EditorGraphNode | EditorGraphExternalNode>;
  edges: Array<EditorGraphEdge | (Omit<EditorGraphEdge, "kind" | "dataKind"> & { kind: "audio-dependency"; dataKind?: string })>;
}

export interface EditorValidationError {
  nodeId: string;
  portId?: string;
  code: string;
  message: string;
}

const labels: Partial<Record<AutomationActionId, string>> = {
  "brief.from_template": "Brief из шаблона",
  "text.qwen.resolved": "Qwen · поиск параметров",
  "text.gemma.awtd": "Gemma · поиск идентичностей",
  "data.merge": "Объединение банков",
};

type ActionMetadata = (typeof actionMetadata)[number];
const primaryEditorMetadata: ActionMetadata[] = [
  {
    actionId: "audio.describe_segments.lfm3", title: "LFM3 · descriptions for selected segments", titleRu: "LFM3 · описания выбранных сегментов", family: "audio", category: "audio", role: "Describe a bounded sample of segments from a segment plan.",
    inputs: [{ name: "segmentPlan", kind: "segment-plan", required: true, multiple: false, accepts: ["segment-plan"], description: "Segment plan to sample." }],
    outputs: [{ port: "result", kind: "description", required: true }], needsAudio: false, needsBrief: false,
    settings: [{ key: "sampleLimit", label: "Sample limit", type: "number", default: 3, min: 1, max: 500, description: "Maximum number of segments described." }], dynamicOutputs: null, available: true, unavailableReasonRu: null,
  } as unknown as ActionMetadata,
  {
    actionId: "data.select", title: "Select or summarize data", titleRu: "Выбрать или свести данные", family: "data", category: "data", role: "Select fields or summarize one bound artifact.",
    inputs: [{ name: "input", kind: "parameter-bank", required: true, multiple: false, accepts: ["parameter-bank", "record-set", "text-feature-snapshot", "brief", "text"], description: "Artifact to select from." }],
    outputs: [{ port: "result", kind: "record-set", required: true }], needsAudio: false, needsBrief: false,
    settings: [
      { key: "mode", label: "Selection mode", type: "select", options: ["summary", "fields", "parameters_by_name"], default: "summary", description: "Primary runtime data.select mode." },
      { key: "fields", label: "Fields or technical names", type: "json", default: [], description: "List required for fields and parameters_by_name modes." },
    ], dynamicOutputs: null, available: true, unavailableReasonRu: null,
  } as unknown as ActionMetadata,
];
const metadataByAction = new Map<string, ActionMetadata>([...actionMetadata, ...primaryEditorMetadata].map((item) => [item.actionId, item]));
const AM2_DEMO_ACTIONS = new Set<string>([
  "audio.clap.resolved", "audio.describe.lfm3", "audio.describe_segments.lfm3", "audio.segment", "brief.from_crystal", "brief.from_template",
  "data.count", "data.difference", "data.filter", "data.intersection", "data.merge", "data.select", "flow.if", "flow.join",
  "flow.router", "flowmusic.export", "llm.advisor", "spec.siglip.resolved", "stage2.client", "stage2.server",
  "text_features.build", "text.assemble", "text.gemma.awtd", "text.gemma.resolved", "text.limit", "text.qwen.resolved",
  "vocal_allocation.search", "result.bundle",
]);
const AM2_EDITOR_ACTIONS = new Set([...metadataByAction.keys()].filter((id) => AM2_DEMO_ACTIONS.has(id) && ACTION_SUPPORTED.has(id as AutomationActionId)));

export const PALETTE_ORDER: AutomationActionId[] = AUTOMATION_ACTION_IDS.filter((id) => AM2_EDITOR_ACTIONS.has(id));

export function actionTitleRu(actionId: AutomationActionId): string {
  const metadata = metadataByAction.get(actionId);
  return metadata?.titleRu ?? labels[actionId] ?? metadata?.title ?? actionId;
}

export function portsForEditorStage(stage: AutomationStageDefinition, allStages: AutomationStageDefinition[] = [stage]) {
  const ports = portsForStage(stage, allStages);
  return {
    inputs: (ports?.inputs ?? stage.inputBindings.filter((binding) => binding.port !== "order").map((binding) => ({ id: binding.name, kind: "unknown", required: false }))).map((port) => ({ name: port.id, kind: port.kind, required: port.required, multiple: port.multiple, accepts: port.accepts })),
    outputs: (ports?.outputs ?? stage.outputDefinitions).map((port) => ({ port: "id" in port ? port.id : port.port, kind: port.kind, required: port.required })),
  };
}

export function actionSpec(actionId: AutomationActionId, actualStage?: AutomationStageDefinition, allStages: AutomationStageDefinition[] = actualStage ? [actualStage] : []): EditorActionSpec {
  const metadata = metadataByAction.get(actionId);
  const stage = {
    actionId,
    stageId: `editor:${actionId}`,
    title: actionTitleRu(actionId),
    role: actionId.split(".")[0],
    inputBindings: [],
    outputDefinitions: [{ port: "result", kind: actionId === "brief.from_template" ? "brief" : "parameter-bank", required: true }],
    settings: { requested: {}, effective: {}, origin: "scenario_default" },
    requiredForGoal: true,
    failurePolicy: "fail_run",
    allowedFallbacks: [],
    available: true,
  } as AutomationStageDefinition;
  const ports = portsForEditorStage(actualStage ?? stage, allStages.length ? allStages : [stage]);
  const hasRuntime = ACTION_SUPPORTED.has(actionId);
  const hasPrimaryPortContract = portsForStage(actualStage ?? stage, allStages.length ? allStages : [stage]) !== null;
  const availability = (metadata as { available?: boolean | null } | undefined)?.available;
  const editable = AM2_EDITOR_ACTIONS.has(actionId) && availability !== false && hasPrimaryPortContract;
  const readOnlyReason = !hasRuntime
    ? "В основном Automation runtime нет обработчика этого типа узла."
    : !metadata
      ? "Тип узла не подключён к registry визуального редактора."
      : availability === false
        ? metadata.unavailableReasonRu ?? "Оператор отключён в исходном каталоге AM2."
        : !hasPrimaryPortContract
          ? "Определение требует адаптации: для узла нет typed port contract основного Automation."
        : !editable
        ? "Тип узла пока не подключён к редакторскому срезу сценариев AM2 A–T."
        : undefined;
  return {
    actionId,
    title: metadata?.titleRu ?? labels[actionId] ?? metadata?.title ?? actionTitleRu(actionId),
    family: actionId.split(".")[0],
    inputs: ports.inputs,
    outputs: ports.outputs,
    needsAudio: metadata?.needsAudio === true,
    needsBrief: metadata?.needsBrief === true,
    editable,
    readOnlyReason,
    settings: (metadata?.settings ?? []).map((setting) => {
      const runtimeKey = runtimeSettingKey(actionId, setting.key);
      const type: EditorSettingSpec["type"] = actionId === "llm.advisor" && setting.key === "allowedActions" ? "action-list"
        : actionId === "data.select" && setting.key === "fields" ? "string-list"
          : setting.type === "string" || setting.type === "number" || setting.type === "boolean" || setting.type === "select" || setting.type === "json" ? setting.type : "json";
      const storedValue = actualStage && runtimeKey
        ? actualStage.settings.requested[runtimeKey] ?? actualStage.settings.effective[runtimeKey]
        : undefined;
      const known = type === "action-list" || type === "string-list"
        ? true
        : Boolean(runtimeKey) && (actualStage ? Object.hasOwn(actualStage.settings.requested, runtimeKey!) || Object.hasOwn(actualStage.settings.effective, runtimeKey!) || setting.key === "template" : true);
      const safeJson = setting.type === "json" && ["condition", "rules", "policies"].includes(runtimeKey ?? setting.key);
      const safeList = type === "action-list" || type === "string-list"
        ? storedValue === undefined || Array.isArray(storedValue) && storedValue.every((item) => typeof item === "string")
        : false;
      const safeValue = type === "json" ? safeJson : type === "action-list" || type === "string-list" ? safeList : true;
      return {
        key: runtimeKey ?? setting.key,
        label: setting.label,
        type,
        ...(type === "action-list" ? { options: AUTOMATION_ACTION_IDS.filter((id) => ACTION_SUPPORTED.has(id)) }
          : setting.options ? { options: setting.options } : {}),
        ...(typeof setting.min === "number" ? { min: setting.min } : {}),
        ...(typeof setting.max === "number" ? { max: setting.max } : {}),
        ...(type === "action-list" || type === "string-list" ? { default: setting.default ?? [] }
          : Object.hasOwn(setting, "default") ? { default: setting.default } : {}),
        ...(setting.description ? { description: setting.description } : {}),
        ...(setting.jsonEditor ? { jsonEditor: setting.jsonEditor } : {}),
        editable: editable && known && safeValue,
        ...(!known ? { readOnlyReason: `Настройка «${setting.key}» не сопоставлена с параметрами основного runtime.` }
          : !safeValue ? { readOnlyReason: type === "action-list" || type === "string-list" ? "Ожидается список строк; сохранённое значение оставлено без изменений." : "Для этого JSON-контракта нет безопасного редактора/валидатора; исходное значение сохранено без изменений." }
            : type === "json" && !safeJson ? { readOnlyReason: "Для этого JSON-контракта нет безопасного редактора/валидатора; исходное значение сохранено без изменений." } : {}),
      };
    }),
  };
}

export const ACTION_CATALOG = Object.fromEntries(AUTOMATION_SCENARIOS.flatMap((scenario) => scenario.stages).map((stage) => [stage.actionId, actionSpec(stage.actionId, stage, scenarioStagesFor(stage.actionId))])) as Partial<Record<AutomationActionId, EditorActionSpec>>;

function scenarioStagesFor(actionId: AutomationActionId) {
  return AUTOMATION_SCENARIOS.find((scenario) => scenario.stages.some((stage) => stage.actionId === actionId))?.stages ?? [];
}

function runtimeSettingKey(actionId: AutomationActionId, key: string): string | null {
  if (["testFailure", "testDelayMs"].includes(key)) return null;
  if (actionId === "brief.from_template" && key === "template") return "templateBrief";
  if (actionId === "stage2.server" && key === "topK") return "stage2TopK";
  if (actionId === "audio.segment") {
    return ({ segmentMode: "boundaryMode", segmentCountMode: "countMode", segmentCount: "requestedCount" } as Record<string, string>)[key] ?? key;
  }
  return key;
}

export function graphForCanvas(graph: AutomationGraph, allStages: AutomationStageDefinition[] = graph.nodes.map((node) => node.stage)): EditorGraph {
  const nodes: Array<EditorGraphNode | EditorGraphExternalNode> = graph.nodes.map((node, ordinal) => ({ id: node.id, type: "operation" as const, stage: node.stage, ordinal: ordinal + 1 }));
  const edges: EditorGraph["edges"] = graph.edges.map((edge) => ({
    id: edge.id,
    kind: edge.edgeKind,
    from: edge.from,
    fromPort: edge.edgeKind === "order" ? "order" : edge.fromPort,
    to: edge.to,
    toPort: edge.edgeKind === "order" ? "order" : edge.toPort,
    dataKind: edge.kind,
    bindingFrom: `stage:${edge.from}`,
    bindingPort: edge.edgeKind === "order" ? "order" : edge.fromPort,
    bindingName: edge.toPort,
  }));
  const addExternal = (raw: string, kind: "audio" | "brief" | "unknown", outputPort: string, outputKind: string | null, label?: string, readOnlyReason?: string) => {
    const id = `ext:${raw}`;
    if (!nodes.some((node) => node.id === id)) nodes.push({ id, type: "external", externalKind: kind, outputPort, outputKind, label, readOnlyReason });
    return id;
  };
  const renderedStageIds = new Set(graph.nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!edge.bindingFrom?.startsWith("stage:") || renderedStageIds.has(edge.from)) continue;
    const missingStageId = edge.bindingFrom.slice("stage:".length);
    const id = addExternal(`missing-stage:${missingStageId}`, "unknown", "missing", null, `Отсутствующий узел ${missingStageId}`, `Связь ссылается на stageId, которого нет в definition: ${missingStageId}.`);
    edge.from = id;
    edge.fromPort = "missing";
    edge.dataKind = "missing source";
  }
  for (const target of allStages) {
    for (const binding of target.inputBindings) {
      if (binding.port === "order" || binding.from.startsWith("stage:")) continue;
      const raw = binding.from.startsWith("external:") ? binding.from.slice("external:".length) : binding.from;
      const kind = raw.toLowerCase().includes("audio") || raw.toLowerCase().includes("asset") ? "audio" : raw.toLowerCase().includes("brief") ? "brief" : "unknown";
      const ports = portsForStage(target, allStages)?.inputs.find((port) => port.id === binding.name);
      const outputKind = kind === "audio" ? ports?.kind ?? "audio" : kind === "brief" ? "brief" : ports?.kind ?? null;
      const id = addExternal(raw, kind, binding.port ?? (kind === "audio" ? "audio" : "brief"), outputKind);
      const port = binding.port ?? (kind === "audio" ? "audio" : "brief");
      edges.push({ id: `${id}#${port}->${target.stageId}:${binding.name}`, kind: kind === "audio" ? "audio-dependency" : "data", from: id, fromPort: port, to: target.stageId, toPort: binding.name, dataKind: outputKind ?? "unknown", bindingFrom: binding.from, bindingPort: port, bindingName: binding.name });
    }
    const action = actionSpec(target.actionId, target, allStages);
    const boundNames = new Set(target.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name));
    if (action.needsAudio && !boundNames.has("audio")) {
      const id = addExternal("scenario-audio", "audio", "audio", "audio");
      edges.push({ id: `${id}#audio->${target.stageId}:audio-dependency`, kind: "audio-dependency", from: id, fromPort: "audio", to: target.stageId, toPort: "audio", dataKind: "audio", derived: true });
    }
    if (action.needsBrief && !boundNames.has("brief")) {
      const id = addExternal("scenario-brief", "brief", "brief", "brief");
      edges.push({ id: `${id}#brief->${target.stageId}:brief-input`, kind: "data", from: id, fromPort: "brief", to: target.stageId, toPort: "brief", dataKind: "brief", derived: true });
    }
  }
  return {
    nodes,
    edges,
  };
}

export function removeEditorEdgeBinding(stages: AutomationStageDefinition[], edge: EditorGraph["edges"][number]): AutomationStageDefinition[] {
  if (edge.derived || !edge.bindingFrom || !edge.bindingName || !edge.bindingPort) return stages;
  return stages.map((stage) => stage.stageId !== edge.to ? stage : {
    ...stage,
    inputBindings: stage.inputBindings.filter((binding) => !(
      binding.from === edge.bindingFrom
      && binding.name === edge.bindingName
      && (edge.bindingPort === "order" ? binding.port === "order" : binding.port !== "order" && (binding.port ?? "result") === edge.bindingPort)
    )),
  });
}

export function canConnect(graph: EditorGraph, from: string, fromPort: string, to: string, toPort: string, allowReadOnlyExisting = false) {
  const source = graph.nodes.find((node) => node.id === from);
  const target = graph.nodes.find((node) => node.id === to);
  if (!source || !target) return { ok: false as const, code: "UNKNOWN_NODE", reason: "Один из узлов уже удалён." };
  if (from === to) return { ok: false as const, code: "SELF_CONNECTION", reason: "Узел не может быть соединён сам с собой." };
  if (source.type === "external" && target.type === "operation" && allowReadOnlyExisting) {
    if (source.outputPort !== fromPort) return { ok: false as const, code: "PORT_UNKNOWN", reason: "Внешний источник не объявляет такой выход." };
    if (toPort === "audio" && actionSpec(target.stage.actionId, target.stage).needsAudio && source.externalKind === "audio") return { ok: true as const };
    const targetPort = portsForEditorStage(target.stage, graph.nodes.filter((node): node is EditorGraphNode => node.type === "operation").map((node) => node.stage)).inputs.find((port) => port.name === toPort);
    if (!targetPort || !source.outputKind) return { ok: false as const, code: "PORT_UNKNOWN", reason: "Нельзя проверить typed contract этого внешнего соединения." };
    const accepted = targetPort.accepts ?? [targetPort.kind];
    return accepted.includes(source.outputKind)
      ? { ok: true as const }
      : { ok: false as const, code: "KIND_MISMATCH", reason: `Вход ${toPort} принимает ${accepted.join(" / ")}, внешний выход даёт ${source.outputKind}.` };
  }
  if (source.type !== "operation" || target.type !== "operation") return { ok: false as const, code: "SOURCE_NOT_OPERATION", reason: "В этом срезе соединяются только узлы поддержанных операций." };
  const sourceSpec = actionSpec(source.stage.actionId, source.stage, graph.nodes.filter((node): node is EditorGraphNode => node.type === "operation").map((node) => node.stage));
  const targetSpec = actionSpec(target.stage.actionId, target.stage, graph.nodes.filter((node): node is EditorGraphNode => node.type === "operation").map((node) => node.stage));
  if (!allowReadOnlyExisting && (!sourceSpec.editable || !targetSpec.editable)) return { ok: false as const, code: "READ_ONLY_NODE", reason: sourceSpec.readOnlyReason ?? targetSpec.readOnlyReason ?? "Соединение затрагивает узел только для просмотра." };
  const sourcePort = portsForEditorStage(source.stage).outputs.find((port) => port.port === fromPort);
  const targetPort = portsForEditorStage(target.stage).inputs.find((port) => port.name === toPort);
  if (!sourcePort || !targetPort) return { ok: false as const, code: "PORT_UNKNOWN", reason: "Порт отсутствует в контракте этого узла." };
  const accepted = targetPort.accepts ?? [targetPort.kind];
  if (!accepted.includes(sourcePort.kind)) return { ok: false as const, code: "KIND_MISMATCH", reason: `Вход ${toPort} принимает ${accepted.join(" / ")}, выход даёт ${sourcePort.kind}.` };
  if (target.stage.actionId === "data.merge" && (toPort === "qwenBank" || toPort === "gemmaBank")) {
    const expectedSource = toPort === "qwenBank" ? "text.qwen.resolved" : "text.gemma.awtd";
    if (source.stage.actionId !== expectedSource) return { ok: false as const, code: "MERGE_SOURCE_ROLE_MISMATCH", reason: `Порт ${toPort} предназначен для ${expectedSource}, выбран ${source.stage.actionId}.` };
  }
  if (graph.edges.some((edge) => edge.from === from && edge.fromPort === fromPort && edge.to === to && edge.toPort === toPort)) {
    return { ok: false as const, code: "ALREADY_CONNECTED", reason: "Такая связь уже существует." };
  }
  if (!targetPort.multiple && graph.edges.some((edge) => edge.to === to && edge.toPort === toPort)) {
    return { ok: false as const, code: "CARDINALITY_EXCEEDED", reason: `Вход ${toPort} уже подключён.` };
  }
  const orderEdges = graph.nodes.flatMap((node) => node.type === "operation"
    ? node.stage.inputBindings.filter((binding) => binding.port === "order" && binding.from.startsWith("stage:")).map((binding) => ({ from: binding.from.slice(6), to: node.id }))
    : []);
  const reachesSource = (current: string, visited = new Set<string>()): boolean => {
    if (current === from) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    return [...graph.edges, ...orderEdges].filter((edge) => edge.from === current).some((edge) => reachesSource(edge.to, visited));
  };
  if (reachesSource(to)) return { ok: false as const, code: "CYCLE", reason: "Эта связь создаст цикл." };
  return { ok: true as const };
}

export function neighborsOf(graph: EditorGraph, nodeId: string) {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const visit = (current: string, direction: "in" | "out", result: Set<string>) => {
    for (const edge of graph.edges) {
      const next = direction === "in" && edge.to === current ? edge.from : direction === "out" && edge.from === current ? edge.to : null;
      if (next && !result.has(next)) { result.add(next); visit(next, direction, result); }
    }
  };
  visit(nodeId, "in", upstream);
  visit(nodeId, "out", downstream);
  return { upstream, downstream };
}

export function normalizeEditorLayout(
  stages: AutomationStageDefinition[],
  layout: Record<string, { x: number; y: number }> | undefined,
  graph: AutomationGraph | EditorGraph,
) {
  const normalized: Record<string, { x: number; y: number }> = {};
  for (const [index, node] of graph.nodes.entries()) {
    const position = layout?.[node.id];
    normalized[node.id] = position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? { x: position.x, y: position.y }
      : "x" in node ? { x: node.x, y: node.y } : { x: 40, y: 80 + index * 150 };
  }
  return normalized;
}

export function validateEditorConnections(stages: AutomationStageDefinition[], graph: AutomationGraph): EditorValidationError[] {
  const editorGraph = graphForCanvas(graph, stages);
  const errors: Array<{ nodeId: string; portId?: string; code: string; message: string }> = [];
  for (const stage of stages) {
    const stagePorts = portsForEditorStage(stage, stages);
    for (const input of stagePorts.inputs) {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name === input.name);
      if (input.required && bindings.length === 0) errors.push({ nodeId: stage.stageId, portId: input.name, code: "MISSING_INPUT", message: `Обязательный вход «${input.name}» не подключён.` });
    }
  }
  for (const edge of editorGraph.edges) {
    const external = editorGraph.nodes.find((node): node is EditorGraphExternalNode => node.id === edge.from && node.type === "external");
    if (external?.readOnlyReason) {
      errors.push({ nodeId: edge.to, portId: edge.toPort, code: "MISSING_SOURCE", message: external.readOnlyReason });
      continue;
    }
    if (edge.kind === "order" || edge.kind === "audio-dependency") continue;
    const check = canConnect(editorGraph, edge.from, edge.fromPort, edge.to, edge.toPort, true);
    if (!check.ok && check.code !== "ALREADY_CONNECTED") errors.push({ nodeId: edge.to, portId: edge.toPort, code: check.code, message: check.reason });
  }
  return errors;
}
