import type { AutomationStageDefinition } from "./contracts";

export type AutomationPortKind = string;

export interface AutomationPortSpec {
  id: string;
  kind: AutomationPortKind;
  required: boolean;
  multiple?: boolean;
  /** Concrete kinds accepted by an input port; kind is the canonical display kind. */
  accepts?: AutomationPortKind[];
}

export interface AutomationGraphNode {
  id: string;
  actionId: AutomationStageDefinition["actionId"];
  stage: AutomationStageDefinition;
  x: number;
  y: number;
}

export interface AutomationGraphEdge {
  id: string;
  edgeKind: "data" | "order";
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
  kind: AutomationPortKind;
  order: number;
}

export interface AutomationGraph {
  nodes: AutomationGraphNode[];
  edges: AutomationGraphEdge[];
  width: number;
  height: number;
}

const R_PORTS: Partial<Record<AutomationStageDefinition["actionId"], { inputs: AutomationPortSpec[]; outputs: AutomationPortSpec[] }>> = {
  "audio.extract_acoustics": { inputs: [{ id: "segmentPlan", kind: "segment-plan", required: false }], outputs: [{ id: "result", kind: "acoustic-analysis", required: true }] },
  "audio.analyze": { inputs: [{ id: "segmentPlan", kind: "segment-plan", required: false }], outputs: [{ id: "result", kind: "audio-analysis", required: true }] },
  "audio.describe.lfm3": { inputs: [], outputs: [{ id: "result", kind: "description", required: true }] },
  "audio.transcribe.lfm3": { inputs: [], outputs: [{ id: "result", kind: "transcription", required: true }] },
  "audio.detect_indic_language": { inputs: [], outputs: [{ id: "result", kind: "language-analysis", required: true }] },
  "audio.analyze_helm": { inputs: [], outputs: [{ id: "result", kind: "helm-analysis", required: true }] },
  "audio.assess_vocal_timbre": { inputs: [{ id: "helm", kind: "helm-analysis", required: true }], outputs: [{ id: "result", kind: "voice-analysis", required: true }] },
  "audio.segment": { inputs: [], outputs: [{ id: "result", kind: "segment-plan", required: true }] },
  "audio.clap.resolved": { inputs: [{ id: "segmentPlan", kind: "segment-plan", required: true }], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "spec.siglip.resolved": { inputs: [{ id: "segmentPlan", kind: "segment-plan", required: true }], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "flowmusic.export": { inputs: [
    { id: "segmentPlan", kind: "segment-plan", required: true },
    { id: "banks", kind: "parameter-bank", required: true, multiple: true },
  ], outputs: [{ id: "result", kind: "flowmusic-timeline", required: true }] },
  "audio.describe_segments.lfm3": { inputs: [{ id: "segmentPlan", kind: "segment-plan", required: true }], outputs: [{ id: "result", kind: "description", required: true }] },
  "audio.describe_gaps.lfm3": { inputs: [{ id: "segmentPlan", kind: "segment-plan", required: true }, { id: "anchors", kind: "natural-description", required: true }], outputs: [{ id: "result", kind: "gap-descriptions", required: true }] },
  "brief.from_template": { inputs: [], outputs: [{ id: "result", kind: "brief", required: true }] },
  "brief.from_crystal": { inputs: [], outputs: [{ id: "result", kind: "brief", required: true }] },
  "text.limit": { inputs: [{ id: "text", kind: "text", required: true, accepts: ["brief", "text", "description", "transcription", "llm-advice"] }], outputs: [{ id: "result", kind: "text", required: true }] },
  "text.assemble": { inputs: [{ id: "parts", kind: "text", required: true, multiple: true, accepts: ["brief", "text", "description", "transcription"] }], outputs: [{ id: "result", kind: "brief", required: true }] },
  "text_features.build": { inputs: [], outputs: [{ id: "result", kind: "text-feature-snapshot", required: true }] },
  "text_features.compare_rankings": { inputs: [{ id: "snapshot", kind: "text-feature-snapshot", required: true }], outputs: [{ id: "result", kind: "ranking-variants", required: true }] },
  "text_features.describe_llm": { inputs: [{ id: "snapshot", kind: "text-feature-snapshot", required: true }], outputs: [{ id: "result", kind: "natural-description", required: true }] },
  "text_features.reverse_query": { inputs: [{ id: "snapshot", kind: "text-feature-snapshot", required: true }], outputs: [{ id: "result", kind: "reverse-query", required: true }] },
  "llm.advisor": { inputs: [{ id: "steps", kind: "record-set", required: true, multiple: true, accepts: ["parameter-bank", "record-set", "brief", "text", "description", "transcription", "natural-description", "reverse-query", "vocal-allocation", "text-feature-snapshot", "segment-plan", "flowmusic-timeline", "llm-advice"] }, { id: "question", kind: "text", required: false, accepts: ["brief", "text", "description", "transcription", "natural-description", "reverse-query"] }], outputs: [{ id: "result", kind: "llm-advice", required: true }] },
  "text.qwen.resolved": { inputs: [{ id: "brief", kind: "brief", required: false, accepts: ["brief", "text", "description", "transcription", "reverse-query"] }], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "text.gemma.awtd": { inputs: [{ id: "brief", kind: "brief", required: false, accepts: ["brief", "text", "description", "transcription", "reverse-query"] }], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "text.gemma.resolved": { inputs: [
    { id: "identityBank", kind: "parameter-bank", required: true },
    { id: "qwenAnchors", kind: "parameter-bank", required: false },
    { id: "identityBankB", kind: "parameter-bank", required: false },
    { id: "brief", kind: "brief", required: false, accepts: ["brief", "text", "description", "transcription", "reverse-query"] },
  ], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "audio.gemma.awtd": { inputs: [{ id: "brief", kind: "brief", required: false, accepts: ["brief", "text", "description", "transcription", "reverse-query"] }, { id: "segmentPlan", kind: "segment-plan", required: false }], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "audio.gemma.resolved": { inputs: [
    { id: "brief", kind: "brief", required: false, accepts: ["brief", "text", "description", "transcription", "reverse-query"] },
    { id: "identityBank", kind: "parameter-bank", required: true, accepts: ["parameter-bank"] },
    { id: "clapBank", kind: "parameter-bank", required: false, accepts: ["parameter-bank"] },
    { id: "qwenAnchors", kind: "parameter-bank", required: false, accepts: ["parameter-bank"] },
  ], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "brief.combine_segment_texts": { inputs: [{ id: "segmentPlan", kind: "segment-plan", required: false }], outputs: [{ id: "result", kind: "brief", required: true }] },
  "vocal_allocation.search": { inputs: [{ id: "brief", kind: "brief", required: false, accepts: ["brief", "text", "description", "transcription", "reverse-query"] }], outputs: [{ id: "result", kind: "vocal-allocation", required: true }, { id: "parameters", kind: "parameter-bank", required: true }] },
  "stage2.server": { inputs: [
    { id: "stage1", kind: "parameter-bank", required: true, multiple: true, accepts: ["parameter-bank"] },
    { id: "brief", kind: "brief", required: false, accepts: ["brief", "text", "description", "transcription", "reverse-query"] },
  ], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "stage2.client": { inputs: [], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "result.bundle": { inputs: [
    { id: "source", kind: "parameter-bank", required: false, multiple: true, accepts: ["parameter-bank"] },
    { id: "description", kind: "description", required: false, multiple: true, accepts: ["description", "gap-descriptions", "transcription"] },
  ], outputs: [{ id: "result", kind: "run-bundle", required: true }] },
  "data.merge": {
    inputs: [{ id: "sources", kind: "parameter-bank", required: true, multiple: true, accepts: ["parameter-bank", "record-set", "brief", "text"] }],
    outputs: [{ id: "result", kind: "parameter-bank", required: true }],
  },
  "data.intersection": {
    inputs: [{ id: "a", kind: "parameter-bank", required: true }, { id: "b", kind: "parameter-bank", required: true }],
    outputs: [{ id: "result", kind: "parameter-bank", required: true }],
  },
  "data.difference": {
    inputs: [{ id: "a", kind: "parameter-bank", required: true }, { id: "b", kind: "parameter-bank", required: true }],
    outputs: [{ id: "result", kind: "parameter-bank", required: true }],
  },
  "data.filter": { inputs: [{ id: "input", kind: "parameter-bank", required: true, accepts: ["parameter-bank", "record-set"] }], outputs: [{ id: "result", kind: "parameter-bank", required: true }] },
  "data.count": { inputs: [{ id: "input", kind: "parameter-bank", required: true, accepts: ["parameter-bank", "record-set"] }], outputs: [{ id: "result", kind: "record-set", required: true }] },
  "data.select": { inputs: [{ id: "input", kind: "parameter-bank", required: true, accepts: ["parameter-bank", "record-set", "text-feature-snapshot", "brief", "text"] }], outputs: [{ id: "result", kind: "record-set", required: true }] },
  "data.split": { inputs: [{ id: "input", kind: "parameter-bank", required: true, accepts: ["parameter-bank", "record-set"] }], outputs: [] },
  "flow.if": { inputs: [{ id: "input", kind: "parameter-bank", required: true }], outputs: [{ id: "then", kind: "parameter-bank", required: false }, { id: "else", kind: "parameter-bank", required: false }, { id: "decision", kind: "decision", required: true }] },
  "flow.router": { inputs: [{ id: "input", kind: "parameter-bank", required: true }], outputs: [] },
  "flow.join": { inputs: [{ id: "inputs", kind: "parameter-bank", required: true, multiple: true, accepts: ["parameter-bank", "record-set", "brief", "text"] }], outputs: [] },
};

export function portsForAction(actionId: AutomationStageDefinition["actionId"]) {
  return R_PORTS[actionId] ?? null;
}

export function portsForStage(stage: AutomationStageDefinition, allStages: AutomationStageDefinition[] = []): { inputs: AutomationPortSpec[]; outputs: AutomationPortSpec[] } | null {
  const ports = portsForAction(stage.actionId);
  if (!ports) return null;
  if (stage.actionId === "data.merge") {
    const dataBindings = stage.inputBindings.filter((binding) => binding.port !== "order");
    const legacyRBindings = dataBindings.some((binding) => binding.name === "qwenBank" || binding.name === "gemmaBank");
    const inputs = legacyRBindings
      ? [{ id: "qwenBank", kind: "parameter-bank", required: true }, { id: "gemmaBank", kind: "parameter-bank", required: true }]
      : ports.inputs;
    return { inputs, outputs: stage.outputDefinitions.map((output) => ({ id: output.port, kind: output.kind, required: output.required })) };
  }
  if (stage.actionId === "text_features.build") {
    return { ...ports, inputs: stage.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name === "segmentPlan"
      ? { id: binding.name, kind: "segment-plan", required: true }
      : { id: binding.name, kind: "parameter-bank", required: true, accepts: ["parameter-bank"] }) };
  }
  if (stage.actionId === "brief.combine_segment_texts") {
    const sources = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name.startsWith("source"));
    const sourceKinds: Record<string, string> = { "text_features.reverse_query": "reverse-query", "text_features.describe_llm": "natural-description", "text_features.build": "text-feature-snapshot", "audio.describe_gaps.lfm3": "gap-descriptions" };
    const sourceInputs = sources.map((binding): AutomationPortSpec => {
      const sourceId = binding.from.startsWith("stage:") ? binding.from.slice(6) : "";
      const source = allStages.find((candidate) => candidate.stageId === sourceId);
      const kind = sourceKinds[source?.actionId ?? ""];
      return { id: binding.name, kind: kind ?? "record-set", required: false, accepts: kind ? [kind] : Object.values(sourceKinds) };
    });
    return { ...ports, inputs: [...ports.inputs.filter((input) => input.id === "segmentPlan"), ...sourceInputs] };
  }
  if (stage.actionId === "audio.gemma.resolved") {
    const perSegment = stage.settings.effective.perSegmentResults === true;
    return { ...ports, inputs: [...ports.inputs, ...(perSegment ? [{ id: "segmentPlan", kind: "segment-plan", required: true }] : [])] };
  }
  if (stage.actionId === "audio.gemma.awtd") {
    const perSegment = stage.settings.effective.perSegmentResults === true;
    return { ...ports, inputs: ports.inputs.map((input) => input.id === "segmentPlan" ? { ...input, required: perSegment } : input) };
  }
  if (stage.actionId === "stage2.client") {
    return { ...ports, inputs: stage.inputBindings.filter((binding) => binding.port !== "order").map((binding): AutomationPortSpec => ({ id: binding.name, kind: "parameter-bank", required: true, accepts: ["parameter-bank"] })) };
  }
  if (stage.actionId === "flow.router" || stage.actionId === "flow.join" || stage.actionId === "data.filter" || stage.actionId === "data.split" || stage.actionId === "data.select") {
    return { ...ports, outputs: stage.outputDefinitions.map((output) => ({ id: output.port, kind: output.kind, required: output.required })) };
  }
  return ports;
}

/** Pick a source output that satisfies a target input contract. Existing bindings
 * take precedence so editing one edge does not silently retarget another input. */
export function compatibleOutputPortForTarget(
  target: AutomationStageDefinition,
  source: AutomationStageDefinition,
  allStages: AutomationStageDefinition[],
  inputName?: string,
): string | undefined {
  const targetPorts = portsForStage(target, allStages);
  const sourcePorts = portsForStage(source, allStages);
  if (!targetPorts || !sourcePorts) return undefined;

  const boundInputName = inputName ?? target.inputBindings.find((binding) => binding.from === `stage:${source.stageId}` && binding.port !== "order")?.name;
  const targetInputs = boundInputName
    ? targetPorts.inputs.filter((input) => input.id === boundInputName)
    : targetPorts.inputs;
  const accepts = new Set(targetInputs.flatMap((input) => input.accepts ?? [input.kind]));
  return sourcePorts.outputs.find((output) => accepts.has(output.kind))?.id;
}

/** Resolve the runtime binding name expected by a target action for a new edge. */
export function inputBindingNamesForConnection(
  target: AutomationStageDefinition,
  source: AutomationStageDefinition,
  allStages: AutomationStageDefinition[],
  ordinal: number,
  sourcePort = "result",
): string[] {
  const sourceKind = portsForStage(source, allStages)?.outputs.find((output) => output.id === sourcePort)?.kind
    ?? source.outputDefinitions.find((output) => output.port === sourcePort)?.kind;
  const targetAction = target.actionId;
  const sourceAction = source.actionId;
  if (targetAction === "data.merge") return [target.inputBindings.some((binding) => binding.name === "qwenBank" || binding.name === "gemmaBank")
    ? sourceAction === "text.qwen.resolved" ? "qwenBank" : sourceAction === "text.gemma.awtd" ? "gemmaBank" : `source${ordinal}`
    : "sources"];
  if (["data.intersection", "data.difference"].includes(targetAction)) return [ordinal === 1 ? "a" : "b"];
  if (targetAction === "text.gemma.resolved" && sourceAction === "text.gemma.awtd") return ["identityBank", "identityBankB"];
  if (targetAction === "text.limit") return ["text"];
  if (targetAction === "text.assemble") return ["parts"];
  if (["flow.if", "flow.router", "data.filter", "data.count", "data.split", "data.select"].includes(targetAction)) return ["input"];
  if (targetAction === "flow.join") return ["inputs"];
  if (targetAction === "result.bundle" && sourceKind === "parameter-bank") return ["source"];
  if (targetAction === "result.bundle" && ["description", "gap-descriptions", "transcription"].includes(String(sourceKind))) return ["description"];
  if (targetAction === "flowmusic.export") return [sourceKind === "segment-plan" ? "segmentPlan" : "banks"];
  if (targetAction === "llm.advisor") return ["steps"];
  if (["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.server", "vocal_allocation.search"].includes(targetAction)
    && ["brief", "text", "description", "transcription", "reverse-query"].includes(String(sourceKind))) return ["brief"];
  if (targetAction === "audio.assess_vocal_timbre" && sourceAction === "audio.analyze_helm") return ["helm"];
  if (["audio.analyze", "audio.extract_acoustics", "audio.clap.resolved", "spec.siglip.resolved", "audio.describe_segments.lfm3", "audio.gemma.awtd", "audio.gemma.resolved", "brief.combine_segment_texts"].includes(targetAction) && sourceKind === "segment-plan") return ["segmentPlan"];
  if (targetAction === "audio.describe_gaps.lfm3") return [sourceAction === "audio.segment" ? "segmentPlan" : sourceAction === "text_features.describe_llm" ? "anchors" : `source${ordinal}`];
  if (targetAction === "stage2.client") return [`source${ordinal}`];
  if (targetAction === "stage2.server") return ["stage1"];
  if (targetAction === "text_features.build") return [sourceKind === "segment-plan" ? "segmentPlan" : `parameterBank${ordinal}`];
  if (["text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query"].includes(targetAction)) return ["snapshot"];
  if (["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved"].includes(targetAction)
    && ["audio.describe.lfm3", "audio.describe_gaps.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"].includes(sourceAction)) return ["brief"];
  if (["text.gemma.resolved", "audio.gemma.resolved"].includes(targetAction) && sourceAction === "audio.gemma.awtd") return ["identityBank"];
  if (["text.gemma.resolved", "audio.gemma.resolved"].includes(targetAction) && sourceAction === "text.qwen.resolved") return ["qwenAnchors"];
  if (targetAction === "audio.gemma.resolved" && sourceAction === "audio.clap.resolved") return ["clapBank"];
  if (targetAction === "audio.gemma.resolved" && sourceAction === "text.qwen.resolved") return ["qwenAnchors"];
  return [`source${ordinal}`];
}

export function graphEdgeId(from: string, fromPort: string, to: string, toPort: string): string {
  return `${from}#${fromPort}->${to}:${toPort}`;
}

/** Convert persisted stage bindings into a typed DAG without changing legacy storage. */
export function buildAutomationGraph(stages: AutomationStageDefinition[]): AutomationGraph {
  const stageById = new Map(stages.map((stage) => [stage.stageId, stage]));
  const edges: AutomationGraphEdge[] = [];
  for (const target of stages) {
    for (const [order, binding] of target.inputBindings.entries()) {
      if (!binding.from.startsWith("stage:")) continue;
      const from = binding.from.slice(6);
      const source = stageById.get(from);
      if (binding.port === "order") {
        edges.push({ id: graphEdgeId(from, "order", target.stageId, binding.name), edgeKind: "order", from, fromPort: "order", to: target.stageId, toPort: binding.name, kind: "order", order });
        continue;
      }
      const sourcePorts = source ? portsForStage(source, stages) : null;
      const outputKind = sourcePorts?.outputs.find((port) => port.id === (binding.port ?? "result"))?.kind
        ?? source?.outputDefinitions.find((port) => port.port === (binding.port ?? "result"))?.kind
        ?? "unknown";
      edges.push({ id: graphEdgeId(from, binding.port ?? "result", target.stageId, binding.name), edgeKind: "data", from, fromPort: binding.port ?? "result", to: target.stageId, toPort: binding.name, kind: outputKind, order });
    }
  }

  const layers = new Map<string, number>();
  const resolving = new Set<string>();
  const layerOf = (id: string): number => {
    const known = layers.get(id);
    if (known !== undefined) return known;
    if (resolving.has(id)) return 0;
    resolving.add(id);
    const incoming = edges.filter((edge) => edge.to === id).map((edge) => layerOf(edge.from));
    const layer = incoming.length ? Math.max(...incoming) + 1 : 0;
    resolving.delete(id);
    layers.set(id, layer);
    return layer;
  };
  for (const stage of stages) layerOf(stage.stageId);
  const byLayer = new Map<number, string[]>();
  for (const stage of stages) {
    const layer = layers.get(stage.stageId) ?? 0;
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), stage.stageId]);
  }
  const nodeWidth = 190;
  const nodeHeight = 92;
  const horizontalGap = 80;
  const verticalGap = 28;
  const nodes = stages.map((stage) => {
    const layer = layers.get(stage.stageId) ?? 0;
    const row = byLayer.get(layer)?.indexOf(stage.stageId) ?? 0;
    return { id: stage.stageId, actionId: stage.actionId, stage, x: 16 + layer * (nodeWidth + horizontalGap), y: 16 + row * (nodeHeight + verticalGap) };
  });
  return {
    nodes,
    edges,
    width: Math.max(360, ...nodes.map((node) => node.x + nodeWidth + 16)),
    height: Math.max(120, ...nodes.map((node) => node.y + nodeHeight + 16)),
  };
}

export function validateTypedAutomationGraph(stages: AutomationStageDefinition[]): string[] {
  const issues: string[] = [];
  const ids = new Set(stages.map((stage) => stage.stageId));
  if (ids.size !== stages.length) issues.push("Graph node IDs must be unique.");
  const graph = buildAutomationGraph(stages);
  for (const stage of stages) {
    const ports = portsForStage(stage, stages);
    if (!ports) {
      issues.push(`Stage ${stage.stageId} has no typed graph contract for ${stage.actionId}.`);
      continue;
    }
    for (const output of ports.outputs) {
      const definitions = stage.outputDefinitions.filter((candidate) => candidate.port === output.id);
      if (definitions.length !== 1 || definitions[0]?.kind !== output.kind) {
        issues.push(`Stage ${stage.stageId} output '${output.id}' must match the typed ${output.kind} contract.`);
      }
    }
    const allBindings = stage.inputBindings;
    for (const binding of allBindings) {
      if (!binding.from.startsWith("stage:")) continue;
      const source = stages.find((candidate) => candidate.stageId === binding.from.slice(6));
      if (!source) { issues.push(`Stage ${stage.stageId} references missing graph node ${binding.from.slice(6)}.`); continue; }
      if (binding.port === "order") continue;
      const output = portsForStage(source, stages)?.outputs.find((port) => port.id === (binding.port ?? "result"));
      const input = ports.inputs.find((port) => port.id === binding.name);
      if (!output || !input) { issues.push(`Connection ${source.stageId} → ${stage.stageId} references an unknown port.`); continue; }
      if (!(input.accepts ?? [input.kind]).includes(output.kind)) issues.push(`Connection ${source.stageId}.${output.id} (${output.kind}) → ${stage.stageId}.${input.id} (${input.kind}) has incompatible types.`);
    }
    const bindings = allBindings.filter((binding) => binding.port !== "order");
    for (const input of ports.inputs) {
      const count = bindings.filter((binding) => binding.name === input.id).length;
      if (input.required && count === 0) issues.push(`Stage ${stage.stageId} is missing required input '${input.id}'.`);
      if (!input.multiple && count > 1) issues.push(`Stage ${stage.stageId} input '${input.id}' accepts only one connection.`);
    }
  }
  const incoming = new Map(stages.map((stage) => [stage.stageId, graph.edges.filter((edge) => edge.to === stage.stageId).map((edge) => edge.from)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const parent of incoming.get(id) ?? []) if (!visit(parent)) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  for (const id of ids) if (!visit(id)) { issues.push("Graph connections must be acyclic."); break; }
  return [...new Set(issues)];
}

/** Stable topological execution order; authoring order breaks ties. */
export function topologicalStageOrder(stages: AutomationStageDefinition[]): AutomationStageDefinition[] {
  const stageOrder = new Map(stages.map((stage, index) => [stage.stageId, index]));
  const dependencies = new Map(stages.map((stage) => [stage.stageId, new Set(stage.inputBindings.filter((binding) => binding.from.startsWith("stage:")).map((binding) => binding.from.slice(6)))]));
  const ids = new Set(stages.map((stage) => stage.stageId));
  for (const [stageId, parents] of dependencies) {
    for (const parent of parents) if (!ids.has(parent)) throw new Error(`Automation graph stage ${stageId} references missing dependency ${parent}.`);
  }
  const ordered: AutomationStageDefinition[] = [];
  const pending = new Set(stages.map((stage) => stage.stageId));
  while (pending.size) {
    const ready = [...pending].filter((id) => [...(dependencies.get(id) ?? [])].every((dependency) => !pending.has(dependency)))
      .sort((a, b) => (stageOrder.get(a) ?? 0) - (stageOrder.get(b) ?? 0));
    if (!ready.length) throw new Error("Automation graph contains a cycle or a missing dependency.");
    for (const id of ready) { pending.delete(id); const stage = stages.find((candidate) => candidate.stageId === id); if (stage) ordered.push(stage); }
  }
  return ordered;
}
