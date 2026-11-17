import { ACTION_SUPPORTED } from "./catalog";
import type { AutomationPlanDocument, AutomationScenarioDefinition, AutomationStageDefinition } from "./contracts";
import { compatibleOutputPortForTarget, inputBindingNamesForConnection, portsForAction, portsForStage, validateTypedAutomationGraph } from "./typed-graph";
import { validateFlowCondition } from "./control-flow";
import { dataSplitOutputDefinitions, validateDataSplitChannels } from "./data-split";
import { dataSelectAcceptsInputKind, validateDataSelectSettings } from "./data-select";

const MERGE_POLICIES = new Set(["keep_first", "keep_last", "error"]);
const MERGE_INPUT_ACTIONS = {
  qwenBank: "text.qwen.resolved",
  gemmaBank: "text.gemma.awtd",
} as const;
const BANK_INPUT_ACTIONS = new Set(["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server"]);
const CLIENT_STAGE2_INPUT_ACTIONS = new Set(["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"]);
const TEXT_INPUT_ACTIONS = new Set(["brief.from_template", "brief.from_crystal", "text.limit", "text.assemble", "llm.advisor"]);
const mergeGroup = (kind: string | undefined) => kind === "parameter-bank" ? "parameter-bank"
  : kind === "record-set" ? "record-set"
    : ["brief", "text"].includes(String(kind)) ? "text" : null;

/** Shared compatibility check used by both the graph editor and its binding updater. */
export function canConnectMergeSource(
  stage: AutomationStageDefinition,
  source: AutomationStageDefinition,
  allStages: AutomationStageDefinition[],
): boolean {
  if (stage.actionId !== "data.merge") return false;
  const current = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from !== `stage:${source.stageId}`);
  const legacyR = current.some((binding) => binding.name === "qwenBank" || binding.name === "gemmaBank");
  if (legacyR) return source.actionId === "text.qwen.resolved" || source.actionId === "text.gemma.awtd";
  if (current.length >= 8) return false;

  const targetPorts = portsForStage(stage, allStages);
  const accepted = new Set(targetPorts?.inputs.find((input) => input.id === "sources")?.accepts ?? []);
  const sourcePorts = portsForStage(source, allStages)?.outputs ?? [];
  const existingGroups = current.map((binding) => {
    const boundSource = allStages.find((candidate) => `stage:${candidate.stageId}` === binding.from);
    const kind = boundSource
      ? portsForStage(boundSource, allStages)?.outputs.find((output) => output.id === (binding.port ?? "result"))?.kind
        ?? boundSource.outputDefinitions.find((output) => output.port === (binding.port ?? "result"))?.kind
      : undefined;
    return mergeGroup(kind);
  });
  return sourcePorts.some((output) => {
    const group = mergeGroup(output.kind);
    return Boolean(group && accepted.has(output.kind)
      && existingGroups.every((existing) => existing === null || existing === group));
  });
}

/** Add/remove a typed data.merge source while preserving the saved R binding shape. */
export function updateMergeSourceBinding(
  stage: AutomationStageDefinition,
  source: AutomationStageDefinition,
  allStages: AutomationStageDefinition[],
  checked: boolean,
): AutomationStageDefinition {
  if (stage.actionId !== "data.merge") return stage;
  const order = stage.inputBindings.filter((binding) => binding.port === "order");
  const current = stage.inputBindings.filter((binding) => binding.port !== "order");
  const selected = current.filter((binding) => binding.from !== `stage:${source.stageId}`);
  const legacyR = current.some((binding) => binding.name === "qwenBank" || binding.name === "gemmaBank");
  const rName = source.actionId === "text.qwen.resolved" ? "qwenBank"
    : source.actionId === "text.gemma.awtd" ? "gemmaBank" : null;

  if (checked && current.some((binding) => binding.from === `stage:${source.stageId}`)) return stage;
  const sameLegacyInput = rName ? current.find((binding) => binding.name === rName) : undefined;
  if (legacyR && rName && (!checked || !sameLegacyInput || sameLegacyInput.from === `stage:${source.stageId}`)) {
    const next = checked ? [...selected, { name: rName, from: `stage:${source.stageId}`, port: "result" }] : selected;
    return { ...stage, inputBindings: [...order, ...next], outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }] };
  }
  if (legacyR && !checked) return stage;

  const genericTarget = legacyR
    ? { ...stage, inputBindings: [...order, ...selected.map((binding) => ({ ...binding, name: "sources" }))] }
    : stage;
  const sourcePort = compatibleOutputPortForTarget(genericTarget, source, allStages, "sources");
  const sourceKind = sourcePort
    ? portsForStage(source, allStages)?.outputs.find((output) => output.id === sourcePort)?.kind
      ?? source.outputDefinitions.find((output) => output.port === sourcePort)?.kind
    : undefined;
  const currentKinds = selected.map((binding) => {
    const sourceStage = allStages.find((candidate) => `stage:${candidate.stageId}` === binding.from);
    const kind = sourceStage
      ? portsForStage(sourceStage, allStages)?.outputs.find((output) => output.id === (binding.port ?? "result"))?.kind
        ?? sourceStage.outputDefinitions.find((output) => output.port === (binding.port ?? "result"))?.kind
      : undefined;
    return mergeGroup(kind);
  });
  const nextGroup = mergeGroup(sourceKind);
  if (checked && (!sourcePort || !nextGroup || currentKinds.some((kind) => kind !== null && kind !== nextGroup) || selected.length >= 8)) return stage;

  // Keep the published R path's named bindings when the author connects its
  // Qwen/Gemma pair. A third source explicitly moves the draft to the general
  // many-input contract, for which Stage Apply is intentionally not inferred.
  const shouldKeepR = !legacyR && selected.length < 2 && rName !== null
    && selected.every((binding) => binding.name === "qwenBank" || binding.name === "gemmaBank");
  const next = checked ? [...selected, {
    name: shouldKeepR ? rName! : "sources",
    from: `stage:${source.stageId}`,
    port: sourcePort ?? "result",
  }] : selected;
  const generic = next.map((binding) => ({ ...binding, name: "sources" }));
  const groups = next.map((binding) => {
    const boundSource = allStages.find((candidate) => `stage:${candidate.stageId}` === binding.from);
    const kind = boundSource
      ? portsForStage(boundSource, allStages)?.outputs.find((output) => output.id === (binding.port ?? "result"))?.kind
        ?? boundSource.outputDefinitions.find((output) => output.port === (binding.port ?? "result"))?.kind
      : undefined;
    return mergeGroup(kind);
  });
  const firstGroup = groups[0];
  const outputKind = firstGroup === "text" ? "text" : firstGroup ?? stage.outputDefinitions[0]?.kind ?? "parameter-bank";
  const inputBindings = shouldKeepR && next.every((binding) => binding.name !== "sources")
    ? next
    : generic;
  return { ...stage, inputBindings: [...order, ...inputBindings], outputDefinitions: [{ port: "result", kind: outputKind, required: true }] };
}

/**
 * Add or remove one producer/consumer connection using the same typed binding
 * rules as the Automation editor. A source can map to more than one semantic
 * input (for example, paired identity banks), so the operation is pair-scoped.
 */
export function updateAutomationSourceBinding(
  stages: AutomationStageDefinition[],
  targetStageId: string,
  sourceId: string,
  checked: boolean,
): AutomationStageDefinition[] {
  const targetIndex = stages.findIndex((candidate) => candidate.stageId === targetStageId);
  const stage = stages[targetIndex];
  const source = stages.find((candidate) => candidate.stageId === sourceId);
  if (!stage || !source || targetIndex <= stages.findIndex((candidate) => candidate.stageId === sourceId)) return stages;

  let updated: AutomationStageDefinition;
  if (stage.actionId === "data.merge") {
    updated = updateMergeSourceBinding(stage, source, stages, checked);
  } else if (stage.actionId === "data.intersection" || stage.actionId === "data.difference") {
    if (!BANK_INPUT_ACTIONS.has(source.actionId)) return stages;
    const order = stage.inputBindings.filter((binding) => binding.port === "order");
    const selected = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from !== `stage:${sourceId}`);
    const next = checked ? [...selected, { name: "", from: `stage:${sourceId}`, port: "result" }] : selected;
    const named = next.map((binding, index) => ({ ...binding, name: index === 0 ? "a" : "b" }));
    updated = { ...stage, inputBindings: [...order, ...named] };
  } else if (["flow.if", "flow.router", "data.filter", "data.count", "data.split", "data.select"].includes(stage.actionId)) {
    const order = stage.inputBindings.filter((binding) => binding.port === "order");
    const inputBindings = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name !== "input");
    const compatibleSelectPort = source.actionId === "data.select"
      ? portsForStage(source, stages)?.outputs.find((output) => dataSelectAcceptsInputKind(stage.settings.requested.mode, output.kind))?.id
      : undefined;
    const port = compatibleSelectPort
      ?? compatibleOutputPortForTarget(stage, source, stages, "input")
      ?? (source.actionId === "flow.if" ? "then" : ["flow.router", "data.split"].includes(source.actionId) ? source.outputDefinitions.find((output) => output.kind !== "decision")?.port ?? "result" : "result");
    if (checked) inputBindings.push({ name: "input", from: `stage:${sourceId}`, port });
    const inputKind = portsForStage(source, stages)?.outputs.find((output) => output.id === port)?.kind
      ?? source.outputDefinitions.find((output) => output.port === port)?.kind;
    const splitOutputs = stage.actionId === "data.split" && inputKind
      ? outputDefinitionsForOperatorSettings({ ...stage, outputDefinitions: [{ port: "seed", kind: inputKind, required: false }] }, stage.settings.requested)
      : undefined;
    const selectOutputs = stage.actionId === "data.select" ? outputDefinitionsForOperatorSettings(stage, stage.settings.requested) : undefined;
    updated = {
      ...stage,
      inputBindings: [...order, ...inputBindings],
      ...(stage.actionId === "data.filter" && inputKind ? { outputDefinitions: [{ port: "result", kind: inputKind, required: true }] } : {}),
      ...(splitOutputs ? { outputDefinitions: splitOutputs } : {}),
      ...(selectOutputs ? { outputDefinitions: selectOutputs } : {}),
    };
  } else if (stage.actionId === "flow.join") {
    const order = stage.inputBindings.filter((binding) => binding.port === "order");
    const inputBindings = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from !== `stage:${sourceId}`);
    const port = source.actionId === "flow.if" ? "else" : source.actionId === "flow.router" ? source.outputDefinitions.find((output) => output.port !== "decision")?.port ?? "result" : "result";
    if (checked) inputBindings.push({ name: "inputs", from: `stage:${sourceId}`, port });
    const previousPolicies = (stage.settings.effective.policies as Array<Record<string, unknown>> | undefined) ?? [];
    const policies = inputBindings.map((binding) => previousPolicies.find((policy) => policy.binding === binding.from.slice(6)) ?? { binding: binding.from.slice(6), onSkipped: "omit", onFailed: "omit", onPartial: "accept" });
    const inputKinds = inputBindings.map((binding) => {
      const boundSource = stages.find((candidate) => `stage:${candidate.stageId}` === binding.from);
      return boundSource ? portsForStage(boundSource, stages)?.outputs.find((output) => output.id === binding.port)?.kind
        ?? boundSource.outputDefinitions.find((output) => output.port === binding.port)?.kind : undefined;
    });
    const outputKind = inputKinds.length && inputKinds.every((kind) => kind === inputKinds[0]) ? inputKinds[0] ?? "parameter-bank" : "record-set";
    const settings = { ...stage.settings, requested: { ...stage.settings.requested, policies }, effective: { ...stage.settings.effective, policies }, origin: "manual" as const };
    updated = { ...stage, inputBindings: [...order, ...inputBindings], settings, outputDefinitions: [{ port: "result", kind: outputKind, required: true }] };
  } else {
    const selected = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from.startsWith("stage:") && binding.from.slice(6) !== sourceId);
    const existing = stage.inputBindings.find((binding) => binding.port !== "order" && binding.from === `stage:${sourceId}`);
    if (checked && existing) return stages;
    const compatiblePort = compatibleOutputPortForTarget(stage, source, stages, existing?.name);
    const renumbered = selected.flatMap((binding, index) => {
      if (!/^(?:source|parameterBank)\d+$/u.test(binding.name)) return [binding];
      const bindingSource = stages.find((candidate) => candidate.stageId === binding.from.slice(6));
      if (!bindingSource) return [binding];
      return inputBindingNamesForConnection(stage, bindingSource, stages, index + 1, binding.port ?? "result").map((name) => ({ ...binding, name }));
    });
    const added = checked
      ? inputBindingNamesForConnection(stage, source, stages, selected.length + 1, compatiblePort ?? "result")
        .map((name) => ({ name, from: `stage:${sourceId}`, port: compatiblePort ?? "result" }))
      : [];
    const named = [...renumbered, ...added];
    updated = { ...stage, inputBindings: [...stage.inputBindings.filter((binding) => binding.port === "order" || binding.from.startsWith("external:")), ...named] };
  }

  return stages.map((candidate, index) => index === targetIndex ? updated : candidate);
}

function boundOutputKind(source: AutomationStageDefinition | undefined, port: string | undefined): string | undefined {
  if (!source) return undefined;
  const outputPort = port ?? "result";
  return source.outputDefinitions.find((output) => output.port === outputPort)?.kind
    ?? portsForAction(source.actionId)?.outputs.find((output) => output.id === outputPort)?.kind;
}

/** Stable ID for render-time bootstrap nodes; event-created nodes pass a nonce. */
export function makeDraftStageId(actionId: string, index: number, nonce: string): string {
  return `draft:${index + 1}:${actionId.replaceAll(".", "-")}:${nonce}`;
}

export function outputDefinitionsForOperatorSettings(stage: AutomationStageDefinition, requested: Record<string, unknown>) {
  if (stage.actionId === "flow.router") {
    const routes = Array.isArray(requested.rules)
      ? requested.rules.map((rule) => (rule as { route?: unknown }).route).filter((route): route is string => typeof route === "string")
      : [];
    const fallback = typeof requested.fallbackRoute === "string" ? requested.fallbackRoute : "fallback";
    return [{ port: "decision", kind: "decision", required: true }, ...[...new Set([...routes, fallback])].map((port) => ({ port, kind: "parameter-bank", required: false }))];
  }
  if (stage.actionId === "data.select") {
    const kind = requested.mode === "parameters_by_name" ? "parameter-bank" : "record-set";
    return [{ port: "result", kind, required: true }];
  }
  if (stage.actionId === "data.split") return dataSplitOutputDefinitions(requested.channels, stage.outputDefinitions[0]?.kind ?? "parameter-bank");
  return stage.outputDefinitions;
}

/** Apply validated flow-node settings while keeping router route ports in sync. */
export function updateFlowOperatorSettings(
  stage: AutomationStageDefinition,
  patch: Record<string, unknown>,
): AutomationStageDefinition {
  if (stage.actionId !== "flow.if" && stage.actionId !== "flow.router") return stage;
  const requested = { ...stage.settings.requested, ...patch };
  const effective = { ...stage.settings.effective, ...patch };
  const updated = { ...stage, settings: { ...stage.settings, requested, effective, origin: "manual" as const } };
  return stage.actionId === "flow.router"
    ? { ...updated, outputDefinitions: outputDefinitionsForOperatorSettings(updated, requested) }
    : updated;
}

/** Update supported data-node settings and keep dynamic ports aligned with them. */
export function updateDataOperatorSettings(
  stage: AutomationStageDefinition,
  patch: Record<string, unknown>,
): AutomationStageDefinition {
  if (!["data.filter", "data.count", "data.select", "data.split"].includes(stage.actionId)) return stage;
  const requested = { ...stage.settings.requested, ...patch };
  const effective = { ...stage.settings.effective, ...patch };
  return {
    ...stage,
    settings: { ...stage.settings, requested, effective, origin: "manual" },
    outputDefinitions: outputDefinitionsForOperatorSettings(stage, requested),
  };
}

/** Persist the per-source join policy while keeping requested/effective settings in sync. */
export function updateFlowJoinPolicies(
  stage: AutomationStageDefinition,
  policies: Array<Record<string, unknown>>,
): AutomationStageDefinition {
  if (stage.actionId !== "flow.join") return stage;
  return {
    ...stage,
    settings: {
      ...stage.settings,
      requested: { ...stage.settings.requested, policies },
      effective: { ...stage.settings.effective, policies },
      origin: "manual",
    },
  };
}

/** Clone operation nodes once when a definition is copied; IDs then survive edits and reordering. */
export function cloneStagesForScenarioEditor(
  stages: AutomationStageDefinition[],
  copyId: string,
): AutomationStageDefinition[] {
  const ids = new Map(stages.map((stage) => [stage.stageId, `${copyId}:${stage.stageId.split(":").slice(-2).join(":")}`]));
  return stages.map((stage) => ({
    ...structuredClone(stage),
    settings: {
      ...structuredClone(stage.settings),
      requested: rewriteJoinPolicyBindings(stage.settings.requested, ids),
      effective: rewriteJoinPolicyBindings(stage.settings.effective, ids),
    },
    stageId: ids.get(stage.stageId)!,
    inputBindings: stage.inputBindings.map((binding) => binding.from.startsWith("stage:")
      ? { ...binding, from: `stage:${ids.get(binding.from.slice(6)) ?? binding.from.slice(6)}` }
      : { ...binding }),
  }));
}

/** Remove one draft node and its incident data edges without changing other node IDs. */
export function removeDraftStage(
  stages: AutomationStageDefinition[],
  stageId: string,
): AutomationStageDefinition[] {
  return stages
    .filter((stage) => stage.stageId !== stageId)
    .map((stage) => {
      const inputBindings = stage.inputBindings.filter((binding) => binding.from !== `stage:${stageId}`);
      if (stage.actionId !== "flow.join") return { ...stage, inputBindings };

      const policies = (settings: Record<string, unknown>) => ({
        ...settings,
        policies: Array.isArray(settings.policies)
          ? settings.policies.filter((policy) => !policy || typeof policy !== "object" || Array.isArray(policy)
            || (policy as Record<string, unknown>).binding !== stageId)
          : settings.policies,
      });
      return {
        ...stage,
        inputBindings,
        settings: {
          ...stage.settings,
          requested: policies(stage.settings.requested),
          effective: policies(stage.settings.effective),
        },
      };
    });
}

/** Move one node by one position while preserving all producer-before-consumer edges. */
export function moveDraftStage(
  stages: AutomationStageDefinition[],
  stageId: string,
  direction: -1 | 1,
): AutomationStageDefinition[] | null {
  const index = stages.findIndex((stage) => stage.stageId === stageId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= stages.length) return null;

  const reordered = [...stages];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const positions = new Map(reordered.map((stage, position) => [stage.stageId, position]));
  for (const [consumerIndex, consumer] of reordered.entries()) {
    for (const binding of consumer.inputBindings) {
      if (binding.port === "order" || !binding.from.startsWith("stage:")) continue;
      const producerIndex = positions.get(binding.from.slice(6));
      if (producerIndex !== undefined && producerIndex >= consumerIndex) return null;
    }
  }
  return reordered.map((stage, position) => {
    const dataBindings = stage.inputBindings.filter((binding) => binding.port !== "order");
    if (position === 0) return { ...stage, inputBindings: dataBindings };
    return {
      ...stage,
      inputBindings: [
        ...dataBindings,
        { name: "previousStage", from: `stage:${reordered[position - 1]!.stageId}`, port: "order" },
      ],
    };
  });
}

function rewriteJoinPolicyBindings(settings: Record<string, unknown>, ids: Map<string, string>): Record<string, unknown> {
  if (!Array.isArray(settings.policies)) return settings;
  return { ...settings, policies: settings.policies.map((policy) => {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) return policy;
    const item = policy as Record<string, unknown>;
    return typeof item.binding === "string" ? { ...item, binding: ids.get(item.binding) ?? item.binding } : item;
  }) };
}

export function validateUserScenarioDefinition(definition: AutomationScenarioDefinition): string[] {
  const issues: string[] = [];
  const stagesById = new Map(definition.stages.map((stage) => [stage.stageId, stage]));

  for (const stage of definition.stages) {
    if (!ACTION_SUPPORTED.has(stage.actionId)) {
      issues.push(`Stage ${stage.stageId} has no registered executor handler for ${stage.actionId}.`);
    }
    if (stage.actionId === "flowmusic.export") {
      const requested = stage.settings.requested;
      const effective = stage.settings.effective;
      const clapWeight = effective.clapWeight ?? requested.clapWeight;
      if (clapWeight !== undefined && (typeof clapWeight !== "number" || !Number.isFinite(clapWeight) || clapWeight < 0 || clapWeight > 1)) {
        issues.push(`Stage ${stage.stageId} requires a finite CLAP weight from 0 to 1.`);
      }
      for (const key of ["blend", "vocalMatrix"] as const) {
        const value = effective[key] ?? requested[key];
        if (value !== undefined && typeof value !== "boolean") issues.push(`Stage ${stage.stageId} setting ${key} must be boolean.`);
      }
    }
    if (stage.actionId === "data.intersection" || stage.actionId === "data.difference") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const names = bindings.map((binding) => binding.name);
      if (bindings.length !== 2 || new Set(names).size !== 2 || !names.includes("a") || !names.includes("b")) {
        issues.push(`Stage ${stage.stageId} requires ordered inputs 'a' and 'b'.`);
      }
      for (const binding of bindings) {
        const source = binding.from.startsWith("stage:") ? stagesById.get(binding.from.slice(6)) : undefined;
        if (!source || !BANK_INPUT_ACTIONS.has(source.actionId) || (binding.port ?? "result") !== "result") {
          issues.push(`Stage ${stage.stageId} input '${binding.name}' must reference a supported parameter-bank producer.`);
        }
      }
      const requested = stage.settings.requested;
      const effective = stage.settings.effective;
      if (stage.actionId === "data.intersection" && (!["from_a", "from_b"].includes(String(requested.valuePolicy)) || !["from_a", "from_b"].includes(String(effective.valuePolicy)))) {
        issues.push(`Stage ${stage.stageId} requires valuePolicy from_a or from_b.`);
      }
      if (stage.actionId === "data.difference" && (!["a_minus_b", "b_minus_a", "symmetric"].includes(String(requested.mode)) || !["a_minus_b", "b_minus_a", "symmetric"].includes(String(effective.mode)))) {
        issues.push(`Stage ${stage.stageId} requires a supported difference mode.`);
      }
      continue;
    }
    if (stage.actionId === "llm.advisor") {
      const stepBindings = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name === "steps");
      const questionBindings = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.name === "question");
      const settings = stage.settings.effective;
      const budget = Number(settings.budgetChars);
      const allowedActions = settings.allowedActions;
      if (stepBindings.length < 1 || stepBindings.length > 10) issues.push(`Stage ${stage.stageId} requires one to ten step-summary inputs.`);
      if (questionBindings.length > 1) issues.push(`Stage ${stage.stageId} accepts at most one question input.`);
      if (!Number.isInteger(budget) || budget < 200 || budget > 32_000) issues.push(`Stage ${stage.stageId} requires a summary budget from 200 to 32000 characters.`);
      const configuredQuestion = typeof settings.question === "string" && Boolean(settings.question.trim());
      if (!configuredQuestion && questionBindings.length !== 1) issues.push(`Stage ${stage.stageId} requires a non-empty question setting or exactly one question input.`);
      if (typeof settings.expectProposal !== "boolean") issues.push(`Stage ${stage.stageId} must declare whether it expects a proposal.`);
      if (allowedActions !== undefined && (!Array.isArray(allowedActions) || allowedActions.some((action) => typeof action !== "string" || !ACTION_SUPPORTED.has(action as never)))) issues.push(`Stage ${stage.stageId} allowedActions must contain only registered action IDs.`);
      if (settings.maxTokens !== undefined && (!Number.isInteger(settings.maxTokens) || Number(settings.maxTokens) < 100 || Number(settings.maxTokens) > 1200)) issues.push(`Stage ${stage.stageId} maxTokens must be an integer from 100 to 1200.`);
      continue;
    }
    if (stage.actionId === "stage2.client") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      if (!bindings.length) issues.push(`Stage ${stage.stageId} requires at least one explicit client Stage-2 source bank.`);
      if (new Set(bindings.map((binding) => binding.name)).size !== bindings.length
        || bindings.some((binding) => !/^source\d{1,2}$/u.test(binding.name))) {
        issues.push(`Stage ${stage.stageId} client Stage-2 inputs must use unique ordered source1…sourceN bindings.`);
      }
      for (const binding of bindings) {
        const source = binding.from.startsWith("stage:") ? stagesById.get(binding.from.slice(6)) : undefined;
        if (!source || !CLIENT_STAGE2_INPUT_ACTIONS.has(source.actionId) || (binding.port ?? "result") !== "result") {
          issues.push(`Stage ${stage.stageId} source '${binding.name}' must reference a supported Stage-2 parameter-bank producer.`);
        }
      }
      continue;
    }
    if (stage.actionId === "text.limit") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const source = bindings.length === 1 && bindings[0].from.startsWith("stage:")
        ? stagesById.get(bindings[0].from.slice(6)) : undefined;
      if (bindings.length !== 1 || bindings[0]?.name !== "text" || bindings[0]?.port !== "result"
        || !source || !TEXT_INPUT_ACTIONS.has(source.actionId)) {
        issues.push(`Stage ${stage.stageId} requires one compatible text input bound to an earlier text producer.`);
      }
      const validSettings = (settings: Record<string, unknown>) => Number.isInteger(settings.maxChars) && Number(settings.maxChars) > 0
        && ["chars", "codepoints", "words"].includes(String(settings.unit))
        && ["hard", "ellipsis", "word_boundary"].includes(String(settings.truncation));
      if (!validSettings(stage.settings.requested) || !validSettings(stage.settings.effective)) {
        issues.push(`Stage ${stage.stageId} requires a positive limit, supported count unit, and truncation policy.`);
      }
      continue;
    }
    if (stage.actionId === "text.assemble") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const validSources = bindings.every((binding) => {
        const source = binding.from.startsWith("stage:") ? stagesById.get(binding.from.slice(6)) : undefined;
        return binding.name === "parts" && binding.port === "result" && Boolean(source && TEXT_INPUT_ACTIONS.has(source.actionId));
      });
      const validSettings = (settings: Record<string, unknown>) => typeof settings.template === "string"
        && typeof settings.separator === "string"
        && ["skip", "placeholder", "error"].includes(String(settings.missingPolicy))
        && typeof settings.includeSourceRefs === "boolean"
        // The current typed output contract is Brief. A dynamic text output would
        // require a graph contract change and is intentionally not exposed here.
        && settings.outputKind === "brief";
      if (bindings.length < 1 || bindings.length > 12 || !validSources) {
        issues.push(`Stage ${stage.stageId} requires one to twelve ordered compatible text inputs.`);
      }
      if (!validSettings(stage.settings.requested) || !validSettings(stage.settings.effective)) {
        issues.push(`Stage ${stage.stageId} requires template, separator, missing policy, source references, and Brief output settings.`);
      }
      continue;
    }
    if (stage.actionId === "data.filter") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const source = bindings.length === 1 && bindings[0]?.from.startsWith("stage:") ? stagesById.get(bindings[0].from.slice(6)) : undefined;
      const inputKind = boundOutputKind(source, bindings[0]?.port);
      const rules = stage.settings.effective.rules;
      if (bindings.length !== 1 || bindings[0]?.name !== "input" || !["parameter-bank", "record-set"].includes(String(inputKind))) {
        issues.push(`Stage ${stage.stageId} requires one compatible parameter-bank input.`);
      }
      if (stage.outputDefinitions.length !== 1 || stage.outputDefinitions[0]?.port !== "result" || stage.outputDefinitions[0]?.kind !== inputKind) issues.push(`Stage ${stage.stageId} output kind must preserve its input kind.`);
      if (!Array.isArray(rules) || !rules.length || (rules as Array<Record<string, unknown>>).some((rule) => typeof rule.field !== "string" || !rule.field.trim() || !["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "not_in", "is_empty", "not_empty"].includes(String(rule.op)))) {
        issues.push(`Stage ${stage.stageId} requires supported filter rules.`);
      }
      continue;
    }
    if (stage.actionId === "data.count") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const source = bindings.length === 1 && bindings[0]?.from.startsWith("stage:") ? stagesById.get(bindings[0].from.slice(6)) : undefined;
      const inputKind = boundOutputKind(source, bindings[0]?.port);
      if (bindings.length !== 1 || bindings[0]?.name !== "input" || !["parameter-bank", "record-set"].includes(String(inputKind))) {
        issues.push(`Stage ${stage.stageId} requires one compatible parameter-bank input.`);
      }
      if (!["scalar", "structured"].includes(String(stage.settings.effective.output)) || !["none", "kind", "validity", "category"].includes(String(stage.settings.effective.groupBy))) issues.push(`Stage ${stage.stageId} has invalid count output/groupBy settings.`);
      continue;
    }
    if (stage.actionId === "data.select") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const source = bindings.length === 1 && bindings[0]?.from.startsWith("stage:") ? stagesById.get(bindings[0].from.slice(6)) : undefined;
      const inputKind = boundOutputKind(source, bindings[0]?.port);
      const mode = stage.settings.effective.mode;
      if (bindings.length !== 1 || bindings[0]?.name !== "input" || !dataSelectAcceptsInputKind(mode, String(inputKind))) issues.push(`Stage ${stage.stageId} requires one input compatible with data.select mode '${String(mode)}'.`);
      for (const [label, settings] of [["requested", stage.settings.requested], ["effective", stage.settings.effective]] as const) {
        for (const problem of validateDataSelectSettings(settings.mode, settings.fields)) issues.push(`Stage ${stage.stageId} ${label} settings: ${problem}`);
      }
      const expectedKind = mode === "parameters_by_name" ? "parameter-bank" : "record-set";
      if (stage.outputDefinitions.length !== 1 || stage.outputDefinitions[0]?.port !== "result" || stage.outputDefinitions[0]?.kind !== expectedKind) issues.push(`Stage ${stage.stageId} mode '${String(mode)}' must output '${expectedKind}'.`);
      continue;
    }
    if (stage.actionId === "data.split") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const binding = bindings[0];
      const source = binding?.from.startsWith("stage:") ? stagesById.get(binding.from.slice(6)) : undefined;
      const inputKind = boundOutputKind(source, binding?.port);
      if (bindings.length !== 1 || binding?.name !== "input" || !["parameter-bank", "record-set"].includes(String(inputKind))) {
        issues.push(`Stage ${stage.stageId} requires one compatible parameter-bank or record-set input.`);
      }
      for (const [label, settings] of [["requested", stage.settings.requested], ["effective", stage.settings.effective]] as const) {
        for (const problem of validateDataSplitChannels(settings.channels)) issues.push(`Stage ${stage.stageId} ${label} settings: ${problem}`);
      }
      const expected = dataSplitOutputDefinitions(stage.settings.effective.channels, ["parameter-bank", "record-set"].includes(String(inputKind)) ? String(inputKind) : "parameter-bank");
      if (JSON.stringify(stage.outputDefinitions) !== JSON.stringify(expected)) issues.push(`Stage ${stage.stageId} outputs must declare each split channel and unmatched using the input kind.`);
      continue;
    }
    if (stage.actionId === "flow.if") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const source = bindings.length === 1 && bindings[0]?.from.startsWith("stage:") ? stagesById.get(bindings[0].from.slice(6)) : undefined;
      if (bindings.length !== 1 || bindings[0]?.name !== "input" || boundOutputKind(source, bindings[0]?.port) !== "parameter-bank") issues.push(`Stage ${stage.stageId} requires one parameter-bank input.`);
      const problem = validateFlowCondition(stage.settings.effective.condition);
      if (problem) issues.push(`Stage ${stage.stageId} condition is invalid: ${problem}.`);
      continue;
    }
    if (stage.actionId === "flow.router") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const source = bindings.length === 1 && bindings[0]?.from.startsWith("stage:") ? stagesById.get(bindings[0].from.slice(6)) : undefined;
      if (bindings.length !== 1 || bindings[0]?.name !== "input" || boundOutputKind(source, bindings[0]?.port) !== "parameter-bank") issues.push(`Stage ${stage.stageId} requires one parameter-bank input.`);
      const rules = stage.settings.effective.rules;
      const fallback = stage.settings.effective.fallbackRoute;
      if (stage.settings.effective.mode !== "first-match" || !Array.isArray(rules) || !rules.length || typeof fallback !== "string" || !fallback.trim()) issues.push(`Stage ${stage.stageId} requires first-match rules and a fallback route.`);
      else {
        const routes = (rules as Array<Record<string, unknown>>).map((rule) => String(rule.route ?? ""));
        const ids = (rules as Array<Record<string, unknown>>).map((rule) => String(rule.id ?? ""));
        if (routes.some((route) => !/^[a-zA-Z][\w-]{0,39}$/u.test(route)) || new Set(routes).size !== routes.length || routes.includes(fallback)) issues.push(`Stage ${stage.stageId} has invalid or duplicate router routes.`);
        if (ids.some((id) => !id) || new Set(ids).size !== ids.length) issues.push(`Stage ${stage.stageId} requires unique non-empty rule IDs.`);
        for (const rule of rules as Array<Record<string, unknown>>) { const problem = validateFlowCondition(rule.condition); if (problem) issues.push(`Stage ${stage.stageId} rule ${String(rule.id)} is invalid: ${problem}.`); }
        const declared = new Set(stage.outputDefinitions.map((output) => output.port));
        if ([...routes, fallback, "decision"].some((port) => !declared.has(port))) issues.push(`Stage ${stage.stageId} output ports must declare each route, fallback, and decision.`);
      }
      continue;
    }
    if (stage.actionId === "flow.join") {
      const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
      const policies = stage.settings.effective.policies;
      if (bindings.length < 1 || bindings.some((binding) => binding.name !== "inputs" || !binding.from.startsWith("stage:"))) issues.push(`Stage ${stage.stageId} requires one or more ordered stage inputs.`);
      if (Array.isArray(policies)) {
        const valid = new Set(bindings.map((binding) => binding.from.slice(6)));
        const policyBindings = (policies as Array<Record<string, unknown>>).map((policy) => String(policy.binding));
        if (policyBindings.length !== valid.size || new Set(policyBindings).size !== policyBindings.length || [...valid].some((binding) => !policyBindings.includes(binding))) issues.push(`Stage ${stage.stageId} requires exactly one join policy for every unique source stage.`);
        for (const policy of policies as Array<Record<string, unknown>>) {
          if (!valid.has(String(policy.binding)) || !["omit", "fail", "default"].includes(String(policy.onSkipped)) || !["omit", "fail", "default"].includes(String(policy.onFailed)) || !["accept", "omit", "fail"].includes(String(policy.onPartial)) || ((policy.onSkipped === "default" || policy.onFailed === "default") && typeof policy.defaultText !== "string")) issues.push(`Stage ${stage.stageId} has an invalid or unbound join policy.`);
        }
      } else issues.push(`Stage ${stage.stageId} requires explicit join policies.`);
      const inputKinds = bindings.map((binding) => boundOutputKind(binding.from.startsWith("stage:") ? stagesById.get(binding.from.slice(6)) : undefined, binding.port));
      const outputKind = inputKinds.every((kind) => kind === inputKinds[0]) ? inputKinds[0] : "record-set";
      if (stage.outputDefinitions.length !== 1 || stage.outputDefinitions[0]?.port !== "result" || stage.outputDefinitions[0]?.kind !== outputKind) issues.push(`Stage ${stage.stageId} result kind must match its compatible inputs (or record-set for mixed kinds).`);
      continue;
    }
    if (stage.actionId !== "data.merge") continue;

    const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
    const names = new Set(bindings.map((binding) => binding.name));
    const legacyR = names.has("qwenBank") || names.has("gemmaBank");
    let mergedKind: string | undefined;
    if (legacyR) {
      if (bindings.length !== 2 || names.size !== 2 || !names.has("qwenBank") || !names.has("gemmaBank")) {
        issues.push(`Stage ${stage.stageId} requires exactly one qwenBank and one gemmaBank input.`);
      }
      for (const binding of bindings) {
        const expectedAction = MERGE_INPUT_ACTIONS[binding.name as keyof typeof MERGE_INPUT_ACTIONS];
        const source = binding.from.startsWith("stage:") ? stagesById.get(binding.from.slice(6)) : undefined;
        if (!expectedAction || !source || source.actionId !== expectedAction || (binding.port ?? "result") !== "result") {
          issues.push(`Stage ${stage.stageId} input '${binding.name}' is incompatible with the supported R merge contract.`);
        }
      }
      mergedKind = "parameter-bank";
    } else {
      if (bindings.length < 2 || bindings.length > 8 || bindings.some((binding) => binding.name !== "sources") || new Set(bindings.map((binding) => binding.from)).size !== bindings.length) {
        issues.push(`Stage ${stage.stageId} requires two to eight unique ordered 'sources' inputs.`);
      }
      const inputKinds = bindings.map((binding) => boundOutputKind(binding.from.startsWith("stage:") ? stagesById.get(binding.from.slice(6)) : undefined, binding.port));
      const group = (kind: string | undefined) => kind === "parameter-bank" ? "parameter-bank"
        : kind === "record-set" ? "record-set"
          : ["brief", "text"].includes(String(kind)) ? "text" : null;
      const groups = inputKinds.map(group);
      if (groups.some((item) => item === null) || !groups.length || groups.some((item) => item !== groups[0])) {
        issues.push(`Stage ${stage.stageId} merge sources must all share one compatible bank, record-set, or text type.`);
      }
      mergedKind = groups[0] === "text" ? "text" : groups[0] ?? undefined;
    }
    if (stage.outputDefinitions.length !== 1 || stage.outputDefinitions[0]?.port !== "result" || stage.outputDefinitions[0]?.kind !== mergedKind) {
      issues.push(`Stage ${stage.stageId} merge output must match its input type '${mergedKind ?? "unknown"}'.`);
    }
    const requested = stage.settings.requested;
    const effective = stage.settings.effective;
    if (!MERGE_POLICIES.has(String(requested.duplicates)) || !MERGE_POLICIES.has(String(requested.conflicts))
      || !MERGE_POLICIES.has(String(effective.duplicates)) || !MERGE_POLICIES.has(String(effective.conflicts))) {
      issues.push(`Stage ${stage.stageId} requires explicit duplicate and conflict policies.`);
    }
    for (const [label, settings] of [["requested", requested], ["effective", effective]] as const) {
      if (settings.textSeparator !== undefined && typeof settings.textSeparator !== "string") issues.push(`Stage ${stage.stageId} ${label} textSeparator must be a string.`);
      if (settings.fieldKey !== undefined && typeof settings.fieldKey !== "string") issues.push(`Stage ${stage.stageId} ${label} fieldKey must be a string.`);
    }
  }

  // Fully typed definitions must pass graph validation; legacy routes with
  // actions that do not yet have typed ports keep their existing validation.
  if (definition.stages.every((stage) => portsForAction(stage.actionId))) {
    issues.push(...validateTypedAutomationGraph(definition.stages));
  }

  return issues;
}

/** The only editable scenario shape currently accepted as a Stage merge source. */
export function isSupportedRMergePlan(plan: AutomationPlanDocument, runScenarioId: string, mergeStageId: string): boolean {
  const actions = ["brief.from_template", "text.qwen.resolved", "text.gemma.awtd", "data.merge"];
  if (plan.scenarioRef.id !== runScenarioId || plan.stages.length !== actions.length
    || plan.stages.some((stage, index) => stage.actionId !== actions[index])) return false;
  const [brief, qwen, gemma, merge] = plan.stages;
  if (!brief || !qwen || !gemma || !merge || merge.stageId !== mergeStageId) return false;
  const bindings = merge.inputBindings.filter((binding) => binding.port !== "order");
  if (bindings.length !== 2) return false;
  const qwenBinding = bindings.find((binding) => binding.name === "qwenBank");
  const gemmaBinding = bindings.find((binding) => binding.name === "gemmaBank");
  return bindings.every((binding) => binding.port === undefined || binding.port === "result")
    && qwenBinding?.from === `stage:${qwen.stageId}`
    && gemmaBinding?.from === `stage:${gemma.stageId}`;
}

/** Restrict Stage import to a typed intersection of two saved parameter-bank outputs. */
export function isSupportedParameterBankIntersectionPlan(plan: AutomationPlanDocument, runScenarioId: string, stageId: string): boolean {
  if (plan.scenarioRef.id !== runScenarioId) return false;
  const stage = plan.stages.find((item) => item.stageId === stageId);
  if (stage?.actionId !== "data.intersection" && stage?.actionId !== "data.difference") return false;
  const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
  if (bindings.length !== 2 || bindings[0]?.name !== "a" || bindings[1]?.name !== "b") return false;
  if (bindings[0].from === bindings[1].from) return false;
  return bindings.every((binding) => {
    if (!binding.from.startsWith("stage:") || (binding.port ?? "result") !== "result") return false;
    const source = plan.stages.find((item) => item.stageId === binding.from.slice(6));
    return Boolean(source && BANK_INPUT_ACTIONS.has(source.actionId));
  });
}

/** Stage-2 server results have a distinct consensus target contract from data.merge. */
export function isSupportedServerStage2Plan(plan: AutomationPlanDocument, runScenarioId: string, stageId: string): boolean {
  if (plan.scenarioRef.id !== runScenarioId) return false;
  const stage = plan.stages.find((item) => item.stageId === stageId);
  if (stage?.actionId !== "stage2.server" || stage.outputDefinitions.length !== 1 || stage.outputDefinitions[0]?.port !== "result" || stage.outputDefinitions[0]?.kind !== "parameter-bank") return false;
  const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
  const stage1 = bindings.filter((binding) => binding.name === "stage1");
  const briefs = bindings.filter((binding) => binding.name === "brief");
  if (!stage1.length || briefs.length > 1 || bindings.some((binding) => binding.name !== "stage1" && binding.name !== "brief")) return false;
  if (stage1.some((binding) => !binding.from.startsWith("stage:") || (binding.port ?? "result") !== "result")) return false;
  if (briefs.some((binding) => !binding.from.startsWith("stage:") || (binding.port ?? "result") !== "result")) return false;
  const sourceIds = [...stage1, ...briefs].map((binding) => binding.from.slice(6));
  if (new Set(sourceIds).size !== sourceIds.length) return false;
  return [...stage1, ...briefs].every((binding) => {
    const source = plan.stages.find((candidate) => candidate.stageId === binding.from.slice(6));
    if (!source) return false;
    return binding.name === "brief"
      ? source.outputDefinitions.some((output) => output.port === "result" && output.kind === "brief")
      : BANK_INPUT_ACTIONS.has(source.actionId) && source.outputDefinitions.some((output) => output.port === "result" && output.kind === "parameter-bank");
  });
}

/** Saved typed data transforms may hand validated parameter-bank outputs to the existing Stage target. */
export function isSupportedParameterBankTransformPlan(plan: AutomationPlanDocument, runScenarioId: string, stageId: string): boolean {
  if (plan.scenarioRef.id !== runScenarioId) return false;
  const stage = plan.stages.find((item) => item.stageId === stageId);
  if (!stage || !["data.filter", "data.split", "data.select", "flow.join"].includes(stage.actionId)) return false;
  const bindings = stage.inputBindings.filter((binding) => binding.port !== "order");
  if (stage.actionId === "data.filter" && (bindings.length !== 1 || bindings[0]?.name !== "input" || !Array.isArray(stage.settings.effective.rules) || stage.settings.effective.rules.length === 0)) return false;
  if (stage.actionId === "data.split") {
    if (bindings.length !== 1 || bindings[0]?.name !== "input" || !Array.isArray(stage.settings.effective.channels) || validateDataSplitChannels(stage.settings.effective.channels).length) return false;
    const expected = dataSplitOutputDefinitions(stage.settings.effective.channels, "parameter-bank").map(({ port, kind }) => ({ port, kind }));
    if (JSON.stringify(stage.outputDefinitions.map(({ port, kind }) => ({ port, kind }))) !== JSON.stringify(expected)) return false;
  } else if (stage.outputDefinitions.length !== 1 || stage.outputDefinitions[0]?.port !== "result" || stage.outputDefinitions[0]?.kind !== "parameter-bank") return false;
  if (stage.actionId === "data.select" && (bindings.length !== 1 || bindings[0]?.name !== "input" || stage.settings.effective.mode !== "parameters_by_name" || !Array.isArray(stage.settings.effective.fields) || stage.settings.effective.fields.length === 0 || !stage.settings.effective.fields.every((field) => typeof field === "string" && field.trim()))) return false;
  if (stage.actionId === "flow.join" && (bindings.length === 0 || bindings.some((binding) => binding.name !== "inputs"))) return false;
  return bindings.every((binding) => {
    if (!binding.from.startsWith("stage:")) return false;
    const source = plan.stages.find((candidate) => candidate.stageId === binding.from.slice(6));
    return Boolean(source?.outputDefinitions.some((output) => output.port === (binding.port ?? "result") && output.kind === "parameter-bank"));
  });
}
