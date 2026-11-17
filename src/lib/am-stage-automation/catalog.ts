import { AM_STAGE_AUTOMATION_PRESETS } from "@/lib/am-stage-automation-library";
import { LEGACY_ACTION_IDS, type AutomationActionId, type AutomationScenarioDefinition, type AutomationStageDefinition } from "./contracts";

const supported = new Set<AutomationActionId>([
  "brief.from_crystal", "brief.from_template",
  "text.limit", "text.assemble",
  "audio.segment", "text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved",
  "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved",
  "stage2.client", "stage2.server", "audio.extract_acoustics", "audio.describe.lfm3", "audio.describe_segments.lfm3", "audio.describe_gaps.lfm3", "audio.transcribe.lfm3",
  "audio.analyze", "audio.analyze_helm", "audio.detect_indic_language", "audio.assess_vocal_timbre", "vocal_allocation.search",
  "text_features.build", "text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query", "llm.advisor",
  "brief.combine_segment_texts", "data.merge", "data.intersection", "data.difference",
  "data.filter", "data.count", "data.select", "data.split", "flow.if", "flow.router", "flow.join", "flowmusic.export", "result.bundle",
]);

const capabilityByAction: Partial<Record<AutomationActionId, string>> = {
  "text.qwen.resolved": "text.qwen.resolved", "text.gemma.awtd": "text.gemma.awtd", "text.gemma.resolved": "text.gemma.resolved",
  "audio.clap.resolved": "audio.clap.resolved", "spec.siglip.resolved": "spec.siglip.resolved",
  "audio.gemma.awtd": "audio.gemma.awtd", "audio.gemma.resolved": "audio.gemma.resolved",
  "audio.extract_acoustics": "side-meta.librosa", "audio.describe.lfm3": "side-meta.lfm3", "audio.describe_segments.lfm3": "side-meta.lfm3", "audio.describe_gaps.lfm3": "side-meta.lfm3", "audio.transcribe.lfm3": "side-meta.lfm3",
  "audio.detect_indic_language": "side-meta.indic", "audio.assess_vocal_timbre": "side-meta.voice",
  "audio.analyze_helm": "side-meta.helm",
};

const outputKind: Record<AutomationActionId, string> = {
  "brief.from_crystal": "brief", "brief.from_template": "brief", "text.limit": "text", "text.assemble": "brief", "audio.analyze": "audio-analysis", "audio.segment": "segment-plan",
  "text.qwen.resolved": "parameter-bank", "text.gemma.awtd": "parameter-bank", "text.gemma.resolved": "parameter-bank",
  "audio.clap.resolved": "parameter-bank", "spec.siglip.resolved": "parameter-bank", "audio.gemma.awtd": "parameter-bank", "audio.gemma.resolved": "parameter-bank",
  "stage2.client": "parameter-bank", "stage2.server": "parameter-bank", "audio.describe.lfm3": "description", "audio.describe_segments.lfm3": "description", "audio.describe_gaps.lfm3": "gap-descriptions", "audio.transcribe.lfm3": "transcription",
  "audio.extract_acoustics": "acoustic-analysis", "audio.detect_indic_language": "language-analysis", "audio.assess_vocal_timbre": "voice-analysis",
  "audio.analyze_helm": "helm-analysis", "flowmusic.export": "flowmusic-timeline", "text_features.build": "text-feature-snapshot", "text_features.compare_rankings": "ranking-variants",
  "text_features.describe_llm": "natural-description", "text_features.reverse_query": "reverse-query", "llm.advisor": "llm-advice", "brief.combine_segment_texts": "brief", "vocal_allocation.search": "vocal-allocation", "data.merge": "parameter-bank", "data.intersection": "parameter-bank", "data.difference": "parameter-bank", "data.filter": "parameter-bank", "data.count": "record-set", "data.select": "record-set", "data.split": "parameter-bank", "flow.if": "decision", "flow.router": "decision", "flow.join": "parameter-bank", "result.bundle": "run-bundle",
};

function makeStage(scenarioId: string, actionId: AutomationActionId, index: number, requiredForGoal = true, overrides: Partial<AutomationStageDefinition> = {}): AutomationStageDefinition {
  const stageId = `${scenarioId}:${String(index + 1).padStart(2, "0")}:${actionId.replaceAll(".", "-")}`;
  return {
    stageId, actionId, title: actionId, role: actionId.split(".")[0], inputBindings: [],
    outputDefinitions: actionId === "vocal_allocation.search"
      ? [{ port: "result", kind: "vocal-allocation", required: requiredForGoal }, { port: "parameters", kind: "parameter-bank", required: requiredForGoal }]
      : [{ port: "result", kind: outputKind[actionId], required: requiredForGoal }],
    settings: { requested: {}, effective: {}, origin: "scenario_default" },
    requiredForGoal, failurePolicy: requiredForGoal ? "fail_run" : "continue", allowedFallbacks: [],
    available: supported.has(actionId),
    ...(!supported.has(actionId) ? { unavailableReason: "No compatible automation adapter is registered." } : {}),
    ...overrides,
  };
}

function addDataBinding(stage: AutomationStageDefinition, name: string, source: AutomationStageDefinition | undefined) {
  if (source && !stage.inputBindings.some((binding) => binding.name === name)) stage.inputBindings.push({ name, from: `stage:${source.stageId}`, port: "result" });
}

function wireAdditionalDataBindings(stages: AutomationStageDefinition[]) {
  const bankActions = new Set(["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server"]);
  stages.forEach((stage, index) => {
    const prior = stages.slice(0, index);
    if (stage.actionId === "text_features.build") {
      prior.filter((source) => bankActions.has(source.actionId)).forEach((source, sourceIndex) => addDataBinding(stage, `parameterBank${sourceIndex + 1}`, source));
      addDataBinding(stage, "segmentPlan", [...prior].reverse().find((source) => source.actionId === "audio.segment"));
    }
    if (["text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query"].includes(stage.actionId)) {
      addDataBinding(stage, "snapshot", [...prior].reverse().find((source) => source.actionId === "text_features.build"));
    }
    if (stage.actionId === "brief.combine_segment_texts") {
      const sources = prior.filter((source) => source.actionId === "text_features.reverse_query" || source.actionId === "text_features.describe_llm" || source.actionId === "text_features.build" || source.actionId === "audio.describe_gaps.lfm3");
      sources.forEach((source, sourceIndex) => addDataBinding(stage, `source${sourceIndex + 1}`, source));
      addDataBinding(stage, "segmentPlan", [...prior].reverse().find((source) => source.actionId === "audio.segment"));
    }
    if (stage.actionId === "audio.describe_gaps.lfm3") {
      addDataBinding(stage, "segmentPlan", [...prior].reverse().find((source) => source.actionId === "audio.segment"));
      addDataBinding(stage, "anchors", [...prior].reverse().find((source) => source.actionId === "text_features.describe_llm"));
    }
    if (stage.actionId === "audio.assess_vocal_timbre") {
      addDataBinding(stage, "helm", [...prior].reverse().find((source) => source.actionId === "audio.analyze_helm"));
    }
    if (["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.gemma.resolved"].includes(stage.actionId)) {
      addDataBinding(stage, "brief", [...prior].reverse().find((source) => ["brief.from_crystal", "brief.from_template", "audio.describe.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"].includes(source.actionId)));
    }
    if (stage.actionId === "stage2.server") {
      addDataBinding(stage, "brief", [...prior].reverse().find((source) => ["brief.from_crystal", "brief.from_template", "audio.describe.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"].includes(source.actionId)));
    }
    if (stage.actionId === "text.gemma.resolved") {
      const identity = [...prior].reverse().find((source) => source.actionId === "text.gemma.awtd");
      addDataBinding(stage, "identityBank", identity);
      addDataBinding(stage, "identityBankB", identity);
    }
    if (stage.actionId === "audio.gemma.resolved") {
      addDataBinding(stage, "identityBank", [...prior].reverse().find((source) => source.actionId === "audio.gemma.awtd"));
      addDataBinding(stage, "clapBank", [...prior].reverse().find((source) => source.actionId === "audio.clap.resolved"));
      addDataBinding(stage, "qwenAnchors", [...prior].reverse().find((source) => source.actionId === "text.qwen.resolved"));
    }
  });
}

const legacy = AM_STAGE_AUTOMATION_PRESETS.map((preset): AutomationScenarioDefinition => {
  const stages = preset.steps.map((id, index) => makeStage(preset.id, LEGACY_ACTION_IDS[id], index));
  if (preset.unavailableReason) stages.splice(0, stages.length, makeStage(preset.id, "result.bundle", 0, true, { available: false, unavailableReason: preset.unavailableReason.en }));
  if (preset.windowMode) for (const stage of stages) if (stage.actionId === "audio.clap.resolved" || stage.actionId === "spec.siglip.resolved") stage.settings = { requested: { boundaryMode: "beat", countMode: "at_most", maximumCount: preset.maxSegments ?? 15 }, effective: { boundaryMode: "beat", countMode: "at_most", maximumCount: preset.maxSegments ?? 15 }, origin: "scenario_default" };
  const actionIds = stages.map((stage) => stage.actionId);
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    if (["audio.clap.resolved", "spec.siglip.resolved"].includes(stage.actionId)) {
      stage.inputBindings.push({ name: "segmentPlan", from: "external:audio.segmentPlan", port: "result" });
    }
    if (stage.actionId === "text.gemma.resolved") {
      const upstream = [...stages.slice(0, index)].reverse().find((candidate) => candidate.actionId === "text.gemma.awtd");
      if (upstream) stage.inputBindings.push({ name: "identityBank", from: `stage:${upstream.stageId}`, port: "result" });
    }
    if (stage.actionId === "audio.gemma.resolved") {
      const upstream = [...stages.slice(0, index)].reverse().find((candidate) => candidate.actionId === "audio.gemma.awtd");
      if (upstream) stage.inputBindings.push({ name: "identityBank", from: `stage:${upstream.stageId}`, port: "result" });
    }
    if (stage.actionId === "stage2.server") {
      const seed = [...stages.slice(0, index)].reverse().find((candidate) => ["text.qwen.resolved", "text.gemma.resolved"].includes(candidate.actionId));
      if (seed) stage.inputBindings.push({ name: "stage1", from: `stage:${seed.stageId}`, port: "result" });
    }
    if (stage.actionId === "stage2.client") {
      const sources = stages.slice(0, index).filter((candidate) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"].includes(candidate.actionId));
      sources.forEach((source, sourceIndex) => stage.inputBindings.push({ name: `source${sourceIndex + 1}`, from: `stage:${source.stageId}`, port: "result" }));
    }
    if (index) stage.inputBindings.push({ name: "previousStage", from: `stage:${stages[index - 1].stageId}`, port: "order" });
  }
  wireAdditionalDataBindings(stages);
  return {
    id: preset.id, version: 1, title: preset.title.en, description: preset.description.en, goal: preset.goal,
    acceptedInputs: [preset.start], preparationPolicies: { audio: "existing-asset", brief: "existing-or-explicit-policy", ...(preset.maxSegments ? { segmentPlan: { mode: "beat", count: "at_most", maximum: preset.maxSegments } } : {}) },
    stages, defaultSettings: { layerMask: preset.layerMask ?? [], topK: 50 },
    requiredResults: stages.flatMap((stage) => stage.outputDefinitions.filter((output) => output.required).map((output) => output.kind)), optionalResults: [],
    resultDestinations: ["automation-history", "tri-modal-stage"], sourceLegacyPresetId: preset.id,
  };
});

function scenario(id: string, title: string, description: string, goal: string, actions: AutomationActionId[], settings: Record<string, unknown> = {}): AutomationScenarioDefinition {
  const stages = actions.map((actionId, index) => makeStage(id, actionId, index));
  const segmentPolicy = settings.segmentPlan as { boundaryMode?: string; countMode?: string; maximumCount?: number; requestedCount?: number; intervalSeconds?: number } | undefined;
  if (segmentPolicy) {
    const segment = stages.find((stage) => stage.actionId === "audio.segment");
    if (segment) segment.settings = { requested: { ...segmentPolicy }, effective: { ...segmentPolicy }, origin: "scenario_default" };
  }
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    if (index) stage.inputBindings.push({ name: "previousStage", from: `stage:${stages[index - 1].stageId}`, port: "order" });
    if (["audio.clap.resolved", "spec.siglip.resolved"].includes(stage.actionId)) stage.inputBindings.push({ name: "segmentPlan", from: "external:audio.segmentPlan", port: "result" });
    if (stage.actionId === "stage2.server") {
      const seed = [...stages.slice(0, index)].reverse().find((candidate) => ["text.qwen.resolved", "text.gemma.resolved"].includes(candidate.actionId));
      if (seed) stage.inputBindings.push({ name: "stage1", from: `stage:${seed.stageId}`, port: "result" });
    }
    if (stage.actionId === "stage2.client") {
      const sources = stages.slice(0, index).filter((candidate) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"].includes(candidate.actionId));
      sources.forEach((source, sourceIndex) => stage.inputBindings.push({ name: `source${sourceIndex + 1}`, from: `stage:${source.stageId}`, port: "result" }));
    }
  }
  wireAdditionalDataBindings(stages);
  return { id, version: 1, title, description, goal, acceptedInputs: ["empty", "brief_only", "audio_only", "audio_and_brief"], preparationPolicies: { brief: "existing-or-explicit", audio: "existing-asset", segmentation: "automatic", ...(segmentPolicy ? { segmentPlan: { ...segmentPolicy } } : {}) }, stages, defaultSettings: { topK: 50, ...settings }, requiredResults: stages.flatMap((stage) => stage.outputDefinitions.map((item) => item.kind)), optionalResults: [], resultDestinations: ["automation-history", "tri-modal-stage"] };
}

function audioToBriefScenario() {
  const definition = scenario(
    "audio-to-brief",
    "Сборка Brief из аудио",
    "Use Librosa beat-aligned windows, keep Gemma/CLAP/SigLIP and text evidence per fragment, combine every fragment through FreeLLMAPI, then run Qwen and server Stage-2.",
    "audio_to_brief_parameters",
    ["audio.segment", "audio.analyze", "audio.gemma.awtd", "audio.clap.resolved", "spec.siglip.resolved", "text_features.build", "text_features.reverse_query", "text_features.describe_llm", "brief.combine_segment_texts", "text.qwen.resolved", "stage2.server"],
    { segmentPlan: { boundaryMode: "beat", countMode: "at_most", maximumCount: 16, requestedCount: 16, intervalSeconds: 15, locked: true }, topK: 40 },
  );
  for (const stage of definition.stages) {
    if (stage.actionId === "audio.segment") {
      stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, requireBeatAlignment: true }, effective: { ...stage.settings.effective, requireBeatAlignment: true } };
    }
    if (["audio.gemma.awtd", "audio.clap.resolved", "spec.siglip.resolved", "text_features.build"].includes(stage.actionId)) {
      stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, perSegmentResults: true }, effective: { ...stage.settings.effective, perSegmentResults: true } };
      if (stage.actionId === "audio.gemma.awtd") addDataBinding(stage, "segmentPlan", definition.stages.find((candidate) => candidate.actionId === "audio.segment"));
    }
    const topK = stage.actionId === "audio.gemma.awtd" ? 10
      : stage.actionId === "audio.clap.resolved" ? 6
        : stage.actionId === "spec.siglip.resolved" ? 4
          : stage.actionId === "text.qwen.resolved" ? 40 : undefined;
    if (topK !== undefined) stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, topK }, effective: { ...stage.settings.effective, topK } };
  }
  return definition;
}

function audioToBriefGapFillScenario() {
  const definition = scenario(
    "audio-to-brief-gap-fill",
    "Audio → sampled anchors → center gap descriptions → Brief",
    "Build per-node evidence, then ask LFM3 only about undescribed interior nodes bracketed by successful descriptions. Each call sends a centered clip within that node, up to the explicit 8-second setting; adjacent descriptions are context, not audio evidence. No final Stage-2.",
    "audio_to_brief_gap_filled",
    ["audio.segment", "audio.analyze", "audio.gemma.awtd", "audio.clap.resolved", "spec.siglip.resolved", "text_features.build", "text_features.describe_llm", "audio.describe_gaps.lfm3", "brief.combine_segment_texts"],
    { segmentPlan: { boundaryMode: "beat", countMode: "at_most", maximumCount: 16, requestedCount: 16, intervalSeconds: 15, locked: true }, topK: 40, textLlmSampleLimit: 5, gapClipSeconds: 8, briefAssembly: { sources: { reverseQuery: false, interpretations: true, textFeatures: false, trackDraft: false, gapDescriptions: true }, executor: "freellmapi" } },
  );
  for (const stage of definition.stages) {
    if (stage.actionId === "audio.segment") stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, requireBeatAlignment: true }, effective: { ...stage.settings.effective, requireBeatAlignment: true } };
    if (["audio.gemma.awtd", "audio.clap.resolved", "spec.siglip.resolved", "text_features.build"].includes(stage.actionId)) {
      stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, perSegmentResults: true }, effective: { ...stage.settings.effective, perSegmentResults: true } };
    }
    if (stage.actionId === "audio.gemma.awtd") addDataBinding(stage, "segmentPlan", definition.stages.find((candidate) => candidate.actionId === "audio.segment"));
    if (stage.actionId === "audio.describe_gaps.lfm3") stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, gapClipSeconds: 8 }, effective: { ...stage.settings.effective, gapClipSeconds: 8 } };
    if (stage.actionId === "audio.clap.resolved") stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, topK: 6 }, effective: { ...stage.settings.effective, topK: 6 } };
    if (stage.actionId === "spec.siglip.resolved") stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, topK: 4 }, effective: { ...stage.settings.effective, topK: 4 } };
  }
  return definition;
}

function createCountIfJoinScenario(): AutomationScenarioDefinition {
  const id = "demo-k-count-if-join";
  const qwen = makeStage(id, "text.qwen.resolved", 0, true, { settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" } });
  const count = makeStage(id, "data.count", 1, true, { inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }], settings: { requested: { output: "scalar", groupBy: "none" }, effective: { output: "scalar", groupBy: "none" }, origin: "scenario_default" } });
  const condition = { left: { type: "binding", binding: "input", property: "count" }, op: "gt", right: { type: "literal", value: 5 } };
  const branch = makeStage(id, "flow.if", 2, true, { inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }], outputDefinitions: [{ port: "then", kind: "parameter-bank", required: false }, { port: "else", kind: "parameter-bank", required: false }, { port: "decision", kind: "decision", required: true }], settings: { requested: { condition }, effective: { condition }, origin: "scenario_default" } });
  const filter = makeStage(id, "data.filter", 3, true, { inputBindings: [{ name: "input", from: `stage:${branch.stageId}`, port: "then" }], settings: { requested: { rules: [{ field: "similarity", op: "gt", value: 0.5 }] }, effective: { rules: [{ field: "similarity", op: "gt", value: 0.5 }] }, origin: "scenario_default" } });
  const join = makeStage(id, "flow.join", 4, true, { inputBindings: [{ name: "inputs", from: `stage:${filter.stageId}`, port: "result" }, { name: "inputs", from: `stage:${branch.stageId}`, port: "else" }], settings: { requested: { policies: [{ binding: filter.stageId, onSkipped: "omit", onFailed: "omit", onPartial: "accept" }, { binding: branch.stageId, onSkipped: "omit", onFailed: "omit", onPartial: "accept" }] }, effective: { policies: [{ binding: filter.stageId, onSkipped: "omit", onFailed: "omit", onPartial: "accept" }, { binding: branch.stageId, onSkipped: "omit", onFailed: "omit", onPartial: "accept" }] }, origin: "scenario_default" } });
  return { id, version: 1, title: "K · Count → if/else → join", description: "Count Qwen-bank rows; if count > 5 filter similarity > 0.5, otherwise pass the bank through; join in declared order with omit policies for skipped/failed inputs.", goal: "user_chain", acceptedInputs: ["brief"], preparationPolicies: {}, stages: [qwen, count, branch, filter, join], defaultSettings: {}, requiredResults: ["parameter-bank", "record-set"], optionalResults: ["decision"], resultDestinations: ["automation-history", "tri-modal-stage"] };
}

function createRouterFallbackScenario(): AutomationScenarioDefinition {
  const id = "demo-l-router-fallback";
  const qwen = makeStage(id, "text.qwen.resolved", 0, true, { settings: { requested: { topK: 10 }, effective: { topK: 10 }, origin: "scenario_default" } });
  const rules = [
    { id: "small", route: "small", title: "Small (<4)", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "lt", right: { type: "literal", value: 4 } } },
    { id: "medium", route: "medium", title: "Medium (4–7)", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "lte", right: { type: "literal", value: 7 } } },
    { id: "large", route: "large", title: "Large (>7)", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "gt", right: { type: "literal", value: 7 } } },
  ];
  const router = makeStage(id, "flow.router", 1, true, { inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }], outputDefinitions: [...rules.map((rule) => ({ port: rule.route, kind: "parameter-bank", required: false })), { port: "fallback", kind: "parameter-bank", required: false }, { port: "decision", kind: "decision", required: true }], settings: { requested: { mode: "first-match", rules, fallbackRoute: "fallback" }, effective: { mode: "first-match", rules, fallbackRoute: "fallback" }, origin: "scenario_default" } });
  const filter = makeStage(id, "data.filter", 2, true, { inputBindings: [{ name: "input", from: `stage:${router.stageId}`, port: "small" }], settings: { requested: { rules: [{ field: "similarity", op: "gt", value: 0 }] }, effective: { rules: [{ field: "similarity", op: "gt", value: 0 }] }, origin: "scenario_default" } });
  const counts = ["medium", "large", "fallback"].map((port, index) => makeStage(id, "data.count", index + 3, true, { inputBindings: [{ name: "input", from: `stage:${router.stageId}`, port }], settings: { requested: { output: "scalar", groupBy: "none" }, effective: { output: "scalar", groupBy: "none" }, origin: "scenario_default" } }));
  return { id, version: 1, title: "L · Ordered router with fallback", description: "Route the Qwen bank using ordered first-match rules: small <4, medium ≤7, large >7; fallback is used only when no rule matches. Only the selected branch runs.", goal: "user_chain", acceptedInputs: ["brief"], preparationPolicies: {}, stages: [qwen, router, filter, ...counts], defaultSettings: {}, requiredResults: ["decision"], optionalResults: ["parameter-bank", "record-set"], resultDestinations: ["automation-history"] };
}

function createUniversalStepScenario(): AutomationScenarioDefinition {
  const id = "demo-m-universal-step";
  const qwen = makeStage(id, "text.qwen.resolved", 0, true, { settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" } });
  const filter = makeStage(id, "data.filter", 1, true, { inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }], settings: { requested: { rules: [{ field: "similarity", op: "gt", value: 0.4 }] }, effective: { rules: [{ field: "similarity", op: "gt", value: 0.4 }] }, origin: "scenario_default" } });
  const count = makeStage(id, "data.count", 2, true, { inputBindings: [{ name: "input", from: `stage:${filter.stageId}`, port: "result" }], settings: { requested: { output: "structured", groupBy: "category" }, effective: { output: "structured", groupBy: "category" }, origin: "scenario_default" } });
  const summary = makeStage(id, "data.select", 3, true, { title: "C · Summary", inputBindings: [{ name: "input", from: `stage:${filter.stageId}`, port: "result" }], settings: { requested: { mode: "summary" }, effective: { mode: "summary" }, origin: "scenario_default" } });
  return { id, version: 1, title: "M · Filter → count + summary", description: "Run Qwen, retain rows with similarity > 0.4, then emit the AM2 structured category count and a record-set summary as separate artifacts.", goal: "user_chain", acceptedInputs: ["brief"], preparationPolicies: {}, stages: [qwen, filter, count, summary], defaultSettings: {}, requiredResults: ["record-set"], optionalResults: ["parameter-bank"], resultDestinations: ["automation-history"] };
}

function createAudioFanOutScenario(): AutomationScenarioDefinition {
  const id = "am2-audio-fanout-b";
  const segment = makeStage(id, "audio.segment", 0, true, {
    title: "Prepare six audio windows",
    settings: { requested: { boundaryMode: "uniform", countMode: "exact", requestedCount: 6, maximumCount: 6, intervalSeconds: 1 }, effective: { boundaryMode: "uniform", countMode: "exact", requestedCount: 6, maximumCount: 6, intervalSeconds: 1 }, origin: "scenario_default" },
  });
  const clap = makeStage(id, "audio.clap.resolved", 1, true, {
    title: "CLAP per-window parameter bank",
    inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }],
    settings: { requested: { topK: 8, perSegmentResults: true }, effective: { topK: 8, perSegmentResults: true }, origin: "scenario_default" },
  });
  const siglip = makeStage(id, "spec.siglip.resolved", 2, true, {
    title: "SigLIP per-window parameter bank",
    inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }],
    settings: { requested: { topK: 8, perSegmentResults: true }, effective: { topK: 8, perSegmentResults: true }, origin: "scenario_default" },
  });
  const descriptions = makeStage(id, "audio.describe_segments.lfm3", 3, true, {
    title: "LFM3 descriptions on three sampled windows",
    inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }],
    settings: { requested: { sampleLimit: 3 }, effective: { sampleLimit: 3 }, origin: "scenario_default" },
  });
  return {
    id, version: 1,
    title: "B · Audio → six windows → CLAP + SigLIP + sampled LFM3",
    description: "Preserves AM2 B's six-window audio fan-out: CLAP and SigLIP retrieve per window and LFM3 describes three sampled windows. The main runtime selects those windows deterministically across the plan, including endpoints.",
    goal: "audio_parameters",
    acceptedInputs: ["assetId", "audioRange"],
    preparationPolicies: { segmentation: "uniform-six", retrieval: "per-window", descriptionSampling: "am2-even-spread-endpoints" },
    stages: [segment, clap, siglip, descriptions],
    defaultSettings: {},
    requiredResults: ["segment-plan", "parameter-bank", "description"],
    optionalResults: [],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  };
}

function createLateResponseScenario(): AutomationScenarioDefinition {
  const id = "am2-audio-late-response-g";
  const segment = makeStage(id, "audio.segment", 0, true, {
    title: "Prepare five ordered audio windows",
    settings: { requested: { boundaryMode: "uniform", countMode: "exact", requestedCount: 5, maximumCount: 5 }, effective: { boundaryMode: "uniform", countMode: "exact", requestedCount: 5, maximumCount: 5 }, origin: "scenario_default" },
  });
  const descriptions = makeStage(id, "audio.describe_segments.lfm3", 1, true, {
    title: "Describe five windows with LFM3",
    inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }],
    settings: { requested: { sampleLimit: 5 }, effective: { sampleLimit: 5 }, origin: "scenario_default" },
  });
  const clap = makeStage(id, "audio.clap.resolved", 2, true, {
    title: "Retrieve CLAP parameters per window",
    inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }],
    settings: { requested: { topK: 6, perSegmentResults: true }, effective: { topK: 6, perSegmentResults: true }, origin: "scenario_default" },
  });
  return {
    id, version: 1,
    title: "G · Five audio windows → LFM3 + CLAP",
    description: "Map AM2 G to five ordered windows with independent per-window LFM3 descriptions and CLAP retrieval. Delayed Run-detail responses are guarded by the existing Run selection identity; no artificial delay setting is exposed.",
    goal: "audio_parameters",
    acceptedInputs: ["assetId", "audioRange"],
    preparationPolicies: { segmentation: "uniform-five-exact", descriptionSampling: "all-five-windows", retrieval: "clap-top-six-per-window", lateResponse: "run-selection-identity-guard" },
    stages: [segment, descriptions, clap],
    defaultSettings: {},
    requiredResults: ["segment-plan", "description", "parameter-bank"],
    optionalResults: [],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  };
}

function createAudioLayersScenario(): AutomationScenarioDefinition {
  const id = "am2-audio-layers-p";
  const segment = makeStage(id, "audio.segment", 0, true, {
    title: "Prepare eight audio windows",
    settings: { requested: { boundaryMode: "uniform", countMode: "exact", requestedCount: 8, maximumCount: 8, intervalSeconds: 3 }, effective: { boundaryMode: "uniform", countMode: "exact", requestedCount: 8, maximumCount: 8, intervalSeconds: 3 }, origin: "scenario_default" },
  });
  const clap = makeStage(id, "audio.clap.resolved", 1, true, {
    title: "CLAP per-window bank",
    inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }],
    settings: { requested: { topK: 10, perSegmentResults: true }, effective: { topK: 10, perSegmentResults: true }, origin: "scenario_default" },
  });
  const siglip = makeStage(id, "spec.siglip.resolved", 2, true, {
    title: "SigLIP per-window bank",
    inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }],
    settings: { requested: { topK: 10, perSegmentResults: true }, effective: { topK: 10, perSegmentResults: true }, origin: "scenario_default" },
  });
  const consensus = makeStage(id, "stage2.client", 3, true, {
    title: "CLAP + SigLIP Stage-2 consensus",
    inputBindings: [
      { name: "source1", from: `stage:${clap.stageId}`, port: "result" },
      { name: "source2", from: `stage:${siglip.stageId}`, port: "result" },
    ],
    settings: { requested: { consensusTopK: 64, consensusCentroidPercent: 50 }, effective: { consensusTopK: 64, consensusCentroidPercent: 50 }, origin: "scenario_default" },
  });
  return {
    id, version: 1, title: "P · Audio → windows → CLAP/SigLIP → Stage-2",
    description: "Create eight ordered windows, retrieve per-window CLAP and SigLIP banks, then run the existing client Stage-2 consensus. The existing Stage historical view is a read-only timeline/audio target; it does not merge these banks into Stage parameters.",
    goal: "audio_parameters", acceptedInputs: ["assetId", "audioRange"],
    preparationPolicies: { segmentation: "uniform-eight", retrieval: "ordered-per-window", stage2: "client-consensus", stageTarget: "historical-read-only" },
    stages: [segment, clap, siglip, consensus], defaultSettings: {},
    requiredResults: ["segment-plan", "parameter-bank"], optionalResults: [],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  };
}

function createVocalMatrixScenario(id: string, title: string, query: string): AutomationScenarioDefinition {
  const sourceVariant = id.endsWith("-o") ? "O" : "T";
  const variantNote = sourceVariant === "T"
    ? " AM2 T's fixed 649-record active-catalogue scope is not reproduced: the main handler searches its existing Genesis library filtered to vocal-matrix parameters, so exact candidate-set equivalence is not claimed."
    : " The main handler searches its existing Genesis library filtered to vocal-matrix parameters."
  const brief = makeStage(id, "brief.from_template", 0);
  brief.settings = { requested: { templateBrief: query }, effective: { templateBrief: query }, origin: "scenario_default" };
  const search = makeStage(id, "vocal_allocation.search", 1);
  search.inputBindings = [
    { name: "previousStage", from: `stage:${brief.stageId}`, port: "order" },
    { name: "brief", from: `stage:${brief.stageId}`, port: "result" },
  ];
  search.settings = { requested: { topK: 40 }, effective: { topK: 40 }, origin: "scenario_default" };
  const filter = makeStage(id, "data.filter", 2);
  filter.inputBindings = [
    { name: "previousStage", from: `stage:${search.stageId}`, port: "order" },
    { name: "input", from: `stage:${search.stageId}`, port: "parameters" },
  ];
  filter.settings = { requested: { rules: [{ field: "source", op: "eq", value: "lexical" }] }, effective: { rules: [{ field: "source", op: "eq", value: "lexical" }] }, origin: "scenario_default" };
  return {
    id, version: 1, title, description: `Preserves AM2 ${sourceVariant}'s vocal matrix plus parameter-bank outputs and explicit-assignment filter.${variantNote} The main vocal_allocation.search contract requires a template Brief query, so this scenario includes a required brief.from_template input; that runtime prerequisite is intentional.`,
    goal: "user_chain", acceptedInputs: [], preparationPolicies: { vocalAssignments: "explicit-slots", selection: "source-equals-lexical" },
    stages: [brief, search, filter], defaultSettings: { topK: 40 }, requiredResults: ["vocal-allocation", "parameter-bank"], optionalResults: ["brief"],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  };
}

function createFlowmusicExportScenario(): AutomationScenarioDefinition {
  const id = "am2-flowmusic-export-q";
  const segment = makeStage(id, "audio.segment", 0, true, { settings: { requested: { boundaryMode: "uniform", countMode: "exact", requestedCount: 6, maximumCount: 6, intervalSeconds: 3 }, effective: { boundaryMode: "uniform", countMode: "exact", requestedCount: 6, maximumCount: 6, intervalSeconds: 3 }, origin: "scenario_default" } });
  const clap = makeStage(id, "audio.clap.resolved", 1, true, { inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }], settings: { requested: { topK: 8, perSegmentResults: true }, effective: { topK: 8, perSegmentResults: true }, origin: "scenario_default" } });
  const siglip = makeStage(id, "spec.siglip.resolved", 2, true, { inputBindings: [{ name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" }], settings: { requested: { topK: 8, perSegmentResults: true }, effective: { topK: 8, perSegmentResults: true }, origin: "scenario_default" } });
  const exportStage = makeStage(id, "flowmusic.export", 3, true, { inputBindings: [
    { name: "previousStage", from: `stage:${siglip.stageId}`, port: "order" },
    { name: "segmentPlan", from: `stage:${segment.stageId}`, port: "result" },
    { name: "banks", from: `stage:${clap.stageId}`, port: "result" },
    { name: "banks", from: `stage:${siglip.stageId}`, port: "result" },
  ], settings: { requested: { blend: false, clapWeight: 0.5, vocalMatrix: true }, effective: { blend: false, clapWeight: 0.5, vocalMatrix: true }, origin: "scenario_default" } });
  return {
    id, version: 1, title: "Q · Export FLOWMUSIC_PRIORITY_TIMELINE_V1",
    description: "Create a schema-valid, downloadable timeline artifact from one SegmentPlan and ordered per-window CLAP then SigLIP banks. This export does not edit Stage layers or timeline tracks.",
    goal: "user_chain", acceptedInputs: ["assetId", "audioRange"], preparationPolicies: { audio: "existing-asset", segmentation: "uniform-six", retrieval: "per-window", output: "export-artifact-only" },
    stages: [segment, clap, siglip, exportStage], defaultSettings: {}, requiredResults: ["flowmusic-timeline"], optionalResults: [], resultDestinations: ["automation-history"],
  };
}

const additional: AutomationScenarioDefinition[] = [
  {
    id: "am2-qwen-reapply-e", version: 1,
    title: "E · Qwen bank → re-apply after manual Stage edits",
    description: "Run a Qwen retrieval, Apply its resolved artifact to the existing Qwen3 ParameterBank, make a manual value edit and a deletion, then explicitly Apply the same artifact again. The existing add-missing policy preserves manual values and tombstones; save the Stage session with its current revision to persist the result.",
    goal: "user_chain",
    acceptedInputs: ["templateVariables", "brief"],
    preparationPolicies: { template: "explicit-variables", retrieval: "qwen-text", stageApply: "existing-qwen3-bank-add-missing" },
    stages: [
      {
        ...makeStage("am2-qwen-reapply-e", "brief.from_template", 0),
        settings: { requested: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, effective: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-qwen-reapply-e", "text.qwen.resolved", 1),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-qwen-reapply-e:01:brief-from_template", port: "order" },
          { name: "brief", from: "stage:am2-qwen-reapply-e:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" },
      },
    ],
    defaultSettings: {}, requiredResults: ["parameter-bank"], optionalResults: [], resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "am2-audio-resume-c", version: 1,
    title: "C · Audio retrieval with segment checkpoints",
    description: "Run CLAP for four ordered audio windows. If a window fails, Continue reuses successful window results and retries the failed window through the main executor.",
    goal: "audio_parameters",
    acceptedInputs: ["audio_only"],
    preparationPolicies: { audio: "existing-asset", segmentation: "four-uniform-windows", resume: "reuse-matching-segment-checkpoints" },
    stages: [
      {
        ...makeStage("am2-audio-resume-c", "audio.segment", 0),
        settings: { requested: { boundaryMode: "uniform", countMode: "exact", requestedCount: 4, maximumCount: 4 }, effective: { boundaryMode: "uniform", countMode: "exact", requestedCount: 4, maximumCount: 4 }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-audio-resume-c", "audio.clap.resolved", 1),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-audio-resume-c:01:audio-segment", port: "order" },
          { name: "segmentPlan", from: "stage:am2-audio-resume-c:01:audio-segment", port: "result" },
        ],
        settings: { requested: { topK: 6, perSegmentResults: true, checkpointSegments: true }, effective: { topK: 6, perSegmentResults: true, checkpointSegments: true }, origin: "scenario_default" },
      },
    ],
    defaultSettings: {}, requiredResults: ["parameter-bank"], optionalResults: [], resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  createCountIfJoinScenario(),
  createRouterFallbackScenario(),
  createUniversalStepScenario(),
  createAudioFanOutScenario(),
  createLateResponseScenario(),
  createAudioLayersScenario(),
  createVocalMatrixScenario("am2-vocal-matrix-o", "O · Vocal allocation → explicit selected bank", "Three layers: lead in classical Latin with VGUT and DRV1; high choir in Ancient Greek with VCLR and RVB1; whisper in Aramaic with VWSP and DLY1. I=8, S=7, E=5, A=9."),
  createVocalMatrixScenario("am2-vocal-matrix-t", "T · Vocal matrix → explicit assignments", "Lead in Latin with VGUT and DRV1; high choir in Ancient Greek with VCLR and RVB1; whisper in Aramaic with VWSP and DLY1. I=9, S=6, E=4, A=8."),
  createFlowmusicExportScenario(),
  (() => {
    const id = "am2-llm-advisor-n";
    const qwen = makeStage(id, "text.qwen.resolved", 0, true, { settings: { requested: { topK: 8 }, effective: { topK: 8 }, origin: "scenario_default" } });
    const snapshot = makeStage(id, "text_features.build", 1, true, { inputBindings: [
      { name: "previousStage", from: `stage:${qwen.stageId}`, port: "order" },
      { name: "parameterBank1", from: `stage:${qwen.stageId}`, port: "result" },
    ] });
    const advisor = makeStage(id, "llm.advisor", 2, true, { inputBindings: [
      { name: "previousStage", from: `stage:${snapshot.stageId}`, port: "order" },
      { name: "steps", from: `stage:${qwen.stageId}`, port: "result" },
      { name: "steps", from: `stage:${snapshot.stageId}`, port: "result" },
    ], settings: { requested: { question: "Какие следующие шаги ускорят достижение цели сценария?", budgetChars: 3000, expectProposal: true, allowedActions: ["audio.segment", "data.intersection", "text.limit", "stage2.client"] }, effective: { question: "Какие следующие шаги ускорят достижение цели сценария?", budgetChars: 3000, expectProposal: true, allowedActions: ["audio.segment", "data.intersection", "text.limit", "stage2.client"] }, origin: "scenario_default" } });
    const limit = makeStage(id, "text.limit", 3, false, { inputBindings: [
      { name: "previousStage", from: `stage:${advisor.stageId}`, port: "order" },
      { name: "text", from: `stage:${advisor.stageId}`, port: "result" },
    ], settings: { requested: { maxChars: 400, unit: "chars", truncation: "ellipsis" }, effective: { maxChars: 400, unit: "chars", truncation: "ellipsis" }, origin: "scenario_default" } });
    return { id, version: 1, title: "N · Run summary → local LLM advisor", description: "Summarize the Qwen bank and text-feature snapshot for the configured local Ollama advisor. Suggestions and optional proposals are saved as non-executable artifacts; nothing is run automatically.", goal: "user_chain", acceptedInputs: ["brief"], preparationPolicies: { advisor: "ollama-local-only", proposal: "non-executable" }, stages: [qwen, snapshot, advisor, limit], defaultSettings: { topK: 8 }, requiredResults: ["llm-advice"], optionalResults: ["text"], resultDestinations: ["automation-history"] } satisfies AutomationScenarioDefinition;
  })(),
  {
    id: "am2-template-qwen-a", version: 1,
    title: "A · Template Brief → Qwen resolved bank",
    description: "Resolve explicit mood/space template variables, then retrieve the Qwen parameter bank from that Brief.",
    goal: "parameter_bank",
    acceptedInputs: ["templateVariables", "brief"],
    preparationPolicies: { template: "explicit-variables", retrieval: "qwen-text" },
    stages: [
      {
        ...makeStage("am2-template-qwen-a", "brief.from_template", 0),
        settings: { requested: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, effective: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-template-qwen-a", "text.qwen.resolved", 1),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-template-qwen-a:01:brief-from_template", port: "order" },
          { name: "brief", from: "stage:am2-template-qwen-a:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 10 }, effective: { topK: 10 }, origin: "scenario_default" },
      },
    ],
    defaultSettings: { topK: 10 }, requiredResults: ["parameter-bank"], optionalResults: ["brief"],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "am2-gemma-two-pass-d", version: 1,
    title: "D · Gemma AWTD + Qwen anchors → resolved values",
    description: "Run Gemma identity retrieval and Qwen value retrieval separately, then resolve Gemma identities using the explicit saved Qwen artifact; both passes remain inspectable.",
    goal: "parameter_bank",
    acceptedInputs: ["templateVariables", "brief"],
    preparationPolicies: { brief: "template-with-explicit-variables", gemma: "identity-then-values" },
    stages: [
      {
        ...makeStage("am2-gemma-two-pass-d", "brief.from_template", 0),
        settings: { requested: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, effective: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-gemma-two-pass-d", "text.gemma.awtd", 1),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-gemma-two-pass-d:01:brief-from_template", port: "order" },
          { name: "brief", from: "stage:am2-gemma-two-pass-d:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 8 }, effective: { topK: 8 }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-gemma-two-pass-d", "text.qwen.resolved", 2),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-gemma-two-pass-d:02:text-gemma-awtd", port: "order" },
          { name: "brief", from: "stage:am2-gemma-two-pass-d:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 10 }, effective: { topK: 10 }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-gemma-two-pass-d", "text.gemma.resolved", 3),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-gemma-two-pass-d:03:text-qwen-resolved", port: "order" },
          { name: "brief", from: "stage:am2-gemma-two-pass-d:01:brief-from_template", port: "result" },
          { name: "identityBank", from: "stage:am2-gemma-two-pass-d:02:text-gemma-awtd", port: "result" },
          { name: "qwenAnchors", from: "stage:am2-gemma-two-pass-d:03:text-qwen-resolved", port: "result" },
        ],
        settings: { requested: { topK: 8 }, effective: { topK: 8 }, origin: "scenario_default" },
      },
    ],
    defaultSettings: { topK: 8 }, requiredResults: ["parameter-bank"], optionalResults: [],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "am2-catalogue-consensus-s", version: 1,
    title: "S · Qwen + Gemma AWTD → server Stage-2 consensus",
    description: "Run Qwen and Gemma AWTD from one Brief, then seed the existing server Stage-2 consensus with both ordered banks. This remains distinct from data.merge.",
    goal: "user_chain",
    acceptedInputs: ["templateVariables", "brief"],
    preparationPolicies: { template: "explicit-variables", stage2: "multi-bank-centroid-consensus", output: "distinct-server-stage2" },
    stages: [
      { ...makeStage("am2-catalogue-consensus-s", "brief.from_template", 0), settings: { requested: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, effective: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, origin: "scenario_default" } },
      { ...makeStage("am2-catalogue-consensus-s", "text.qwen.resolved", 1), inputBindings: [
        { name: "previousStage", from: "stage:am2-catalogue-consensus-s:01:brief-from_template", port: "order" },
        { name: "brief", from: "stage:am2-catalogue-consensus-s:01:brief-from_template", port: "result" },
      ], settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" } },
      { ...makeStage("am2-catalogue-consensus-s", "text.gemma.awtd", 2), inputBindings: [
        { name: "previousStage", from: "stage:am2-catalogue-consensus-s:02:text-qwen-resolved", port: "order" },
        { name: "brief", from: "stage:am2-catalogue-consensus-s:01:brief-from_template", port: "result" },
      ], settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" } },
      { ...makeStage("am2-catalogue-consensus-s", "stage2.server", 3), inputBindings: [
        { name: "previousStage", from: "stage:am2-catalogue-consensus-s:03:text-gemma-awtd", port: "order" },
        { name: "brief", from: "stage:am2-catalogue-consensus-s:01:brief-from_template", port: "result" },
        { name: "stage1", from: "stage:am2-catalogue-consensus-s:02:text-qwen-resolved", port: "result" },
        { name: "stage1", from: "stage:am2-catalogue-consensus-s:03:text-gemma-awtd", port: "result" },
      ], settings: { requested: { stage2TopK: 8 }, effective: { stage2TopK: 8 }, origin: "scenario_default" } },
    ],
    defaultSettings: { topK: 12, stage2TopK: 8 }, requiredResults: ["parameter-bank"], optionalResults: ["brief"],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "am2-persistent-bundle-f", version: 1,
    title: "F · Qwen + Gemma + Stage-2 → durable artifact bundle",
    description: "Run separate Qwen and Gemma passes, preserve server Stage-2 as its own result, and create a durable bundle that references both selected artifacts.",
    goal: "user_chain",
    acceptedInputs: ["templateVariables", "brief"],
    preparationPolicies: { template: "explicit-variables", valueResolution: "explicit-qwen-artifact", consensus: "stage2-server-distinct-from-merge", persistence: "artifact-references" },
    stages: [
      {
        ...makeStage("am2-persistent-bundle-f", "brief.from_template", 0),
        settings: { requested: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, effective: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-persistent-bundle-f", "text.qwen.resolved", 1),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-persistent-bundle-f:01:brief-from_template", port: "order" },
          { name: "brief", from: "stage:am2-persistent-bundle-f:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 10 }, effective: { topK: 10 }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-persistent-bundle-f", "text.gemma.awtd", 2),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-persistent-bundle-f:02:text-qwen-resolved", port: "order" },
          { name: "brief", from: "stage:am2-persistent-bundle-f:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 8 }, effective: { topK: 8 }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-persistent-bundle-f", "text.gemma.resolved", 3),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-persistent-bundle-f:03:text-gemma-awtd", port: "order" },
          { name: "brief", from: "stage:am2-persistent-bundle-f:01:brief-from_template", port: "result" },
          { name: "identityBank", from: "stage:am2-persistent-bundle-f:03:text-gemma-awtd", port: "result" },
          { name: "qwenAnchors", from: "stage:am2-persistent-bundle-f:02:text-qwen-resolved", port: "result" },
        ],
        settings: { requested: { topK: 8 }, effective: { topK: 8 }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-persistent-bundle-f", "stage2.server", 4),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-persistent-bundle-f:04:text-gemma-resolved", port: "order" },
          { name: "brief", from: "stage:am2-persistent-bundle-f:01:brief-from_template", port: "result" },
          { name: "stage1", from: "stage:am2-persistent-bundle-f:02:text-qwen-resolved", port: "result" },
        ],
      },
      {
        ...makeStage("am2-persistent-bundle-f", "result.bundle", 5),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-persistent-bundle-f:05:stage2-server", port: "order" },
          { name: "source", from: "stage:am2-persistent-bundle-f:04:text-gemma-resolved", port: "result" },
          { name: "source", from: "stage:am2-persistent-bundle-f:05:stage2-server", port: "result" },
        ],
      },
    ],
    defaultSettings: { topK: 10 }, requiredResults: ["run-bundle"], optionalResults: ["parameter-bank", "brief"],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "am2-two-briefs-assemble-qwen-h", version: 2,
    title: "H · Template + crystal Brief → text.assemble → Qwen (main variant)",
    description: "Assemble an explicitly templated Brief and selected crystal Brief into one Brief in stable input order, then use it in the main Qwen retrieval action. This is the main text.assemble variant; the separate AM2-compatible H scenario uses data.merge text union semantics.",
    goal: "user_chain",
    acceptedInputs: ["templateVariables", "crystal", "brief"],
    preparationPolicies: { template: "explicit-variables", crystal: "explicit-selection", assembly: "ordered-parts" },
    stages: [
      {
        ...makeStage("am2-two-briefs-assemble-qwen-h", "brief.from_template", 0), inputBindings: [],
        settings: { requested: { templateBrief: "Ambient cue with {{mood}} texture and {{space}} space" }, effective: { templateBrief: "Ambient cue with {{mood}} texture and {{space}} space" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-two-briefs-assemble-qwen-h", "brief.from_crystal", 1),
        inputBindings: [{ name: "previousStage", from: "stage:am2-two-briefs-assemble-qwen-h:01:brief-from_template", port: "order" }],
      },
      {
        ...makeStage("am2-two-briefs-assemble-qwen-h", "text.assemble", 2),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-two-briefs-assemble-qwen-h:02:brief-from_crystal", port: "order" },
          { name: "parts", from: "stage:am2-two-briefs-assemble-qwen-h:01:brief-from_template", port: "result" },
          { name: "parts", from: "stage:am2-two-briefs-assemble-qwen-h:02:brief-from_crystal", port: "result" },
        ],
        settings: { requested: { template: "", separator: "\\n", missingPolicy: "error", includeSourceRefs: false, outputKind: "brief" }, effective: { template: "", separator: "\\n", missingPolicy: "error", includeSourceRefs: false, outputKind: "brief" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-two-briefs-assemble-qwen-h", "text.qwen.resolved", 3),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-two-briefs-assemble-qwen-h:03:text-assemble", port: "order" },
          { name: "brief", from: "stage:am2-two-briefs-assemble-qwen-h:03:text-assemble", port: "result" },
        ],
        settings: { requested: { topK: 10 }, effective: { topK: 10 }, origin: "scenario_default" },
      },
    ],
    defaultSettings: {}, requiredResults: ["parameter-bank"], optionalResults: ["brief"], resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "am2-text-limit-assemble-j", version: 1,
    title: "J · Limit + assemble → Brief",
    description: "Limit a template Brief by an explicit unit and truncation policy, then assemble it with an explicitly selected crystal Brief in stable input order.",
    goal: "brief_assembly",
    acceptedInputs: ["templateVariables", "crystal", "brief"],
    preparationPolicies: { template: "explicit-variables", crystal: "explicit-selection", assembly: "ordered-parts" },
    stages: [
      {
        ...makeStage("am2-text-limit-assemble-j", "brief.from_template", 0),
        inputBindings: [],
        settings: { requested: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space, wide stereo image, slow evolving harmonic bed, gentle sidechain motion and a soft analog tail" }, effective: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space, wide stereo image, slow evolving harmonic bed, gentle sidechain motion and a soft analog tail" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-text-limit-assemble-j", "brief.from_crystal", 1),
        inputBindings: [{ name: "previousStage", from: "stage:am2-text-limit-assemble-j:01:brief-from_template", port: "order" }],
      },
      {
        ...makeStage("am2-text-limit-assemble-j", "text.limit", 2),
        inputBindings: [{ name: "text", from: "stage:am2-text-limit-assemble-j:01:brief-from_template", port: "result" }],
        settings: { requested: { maxChars: 14, unit: "words", truncation: "word_boundary" }, effective: { maxChars: 14, unit: "words", truncation: "word_boundary" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-text-limit-assemble-j", "text.assemble", 3),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-text-limit-assemble-j:03:text-limit", port: "order" },
          { name: "parts", from: "stage:am2-text-limit-assemble-j:03:text-limit", port: "result" },
          { name: "parts", from: "stage:am2-text-limit-assemble-j:02:brief-from_crystal", port: "result" },
        ],
        settings: { requested: { template: "", separator: "\\n", missingPolicy: "skip", includeSourceRefs: true, outputKind: "brief" }, effective: { template: "", separator: "\\n", missingPolicy: "skip", includeSourceRefs: true, outputKind: "brief" }, origin: "scenario_default" },
      },
    ],
    defaultSettings: {},
    requiredResults: ["brief"], optionalResults: ["text"],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "am2-two-briefs-merge-qwen-h", version: 1,
    title: "H · Template + crystal Brief → text merge → Qwen (AM2 variant)",
    description: "Merge a template Brief and a selected crystal Brief as ordered text inputs using the existing data.merge handler, then pass its text result to Qwen. This preserves the AM2 H union/text-separator behavior and is distinct from the main text.assemble variant.",
    goal: "user_chain",
    acceptedInputs: ["templateVariables", "crystal", "brief"],
    preparationPolicies: { template: "explicit-variables", crystal: "explicit-selection", merge: "ordered-text-union" },
    stages: [
      {
        ...makeStage("am2-two-briefs-merge-qwen-h", "brief.from_template", 0),
        settings: { requested: { templateBrief: "Ambient cue with {{mood}} texture and {{space}} space" }, effective: { templateBrief: "Ambient cue with {{mood}} texture and {{space}} space" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-two-briefs-merge-qwen-h", "brief.from_crystal", 1),
        inputBindings: [{ name: "previousStage", from: "stage:am2-two-briefs-merge-qwen-h:01:brief-from_template", port: "order" }],
      },
      {
        ...makeStage("am2-two-briefs-merge-qwen-h", "data.merge", 2),
        outputDefinitions: [{ port: "result", kind: "text", required: true }],
        inputBindings: [
          { name: "previousStage", from: "stage:am2-two-briefs-merge-qwen-h:02:brief-from_crystal", port: "order" },
          { name: "sources", from: "stage:am2-two-briefs-merge-qwen-h:01:brief-from_template", port: "result" },
          { name: "sources", from: "stage:am2-two-briefs-merge-qwen-h:02:brief-from_crystal", port: "result" },
        ],
        settings: { requested: { duplicates: "keep_first", conflicts: "keep_first", textSeparator: "\\n" }, effective: { duplicates: "keep_first", conflicts: "keep_first", textSeparator: "\\n" }, origin: "scenario_default" },
      },
      {
        ...makeStage("am2-two-briefs-merge-qwen-h", "text.qwen.resolved", 3),
        inputBindings: [
          { name: "previousStage", from: "stage:am2-two-briefs-merge-qwen-h:03:data-merge", port: "order" },
          { name: "brief", from: "stage:am2-two-briefs-merge-qwen-h:03:data-merge", port: "result" },
        ],
        settings: { requested: { topK: 10 }, effective: { topK: 10 }, origin: "scenario_default" },
      },
    ],
    defaultSettings: {}, requiredResults: ["parameter-bank"], optionalResults: ["text"], resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "catalogue-bank-set-ops-i", version: 1,
    title: "I · Qwen + Gemma → Intersection + Difference",
    description: "Compare Qwen and Gemma parameter banks by technical_name. The intersection keeps Qwen values by default; A\\B is preserved as a separate artifact.",
    goal: "parameter_bank_set_operations",
    acceptedInputs: ["brief"],
    preparationPolicies: { searchMode: "single", bankKey: "technical_name" },
    stages: [
      {
        ...makeStage("catalogue-bank-set-ops-i", "text.qwen.resolved", 0),
        inputBindings: [],
        settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" },
      },
      {
        ...makeStage("catalogue-bank-set-ops-i", "text.gemma.awtd", 1),
        inputBindings: [],
        settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" },
      },
      {
        ...makeStage("catalogue-bank-set-ops-i", "data.intersection", 2),
        inputBindings: [
          { name: "a", from: "stage:catalogue-bank-set-ops-i:01:text-qwen-resolved", port: "result" },
          { name: "b", from: "stage:catalogue-bank-set-ops-i:02:text-gemma-awtd", port: "result" },
        ],
        settings: { requested: { valuePolicy: "from_a" }, effective: { valuePolicy: "from_a" }, origin: "scenario_default" },
      },
      {
        ...makeStage("catalogue-bank-set-ops-i", "data.difference", 3),
        inputBindings: [
          { name: "a", from: "stage:catalogue-bank-set-ops-i:01:text-qwen-resolved", port: "result" },
          { name: "b", from: "stage:catalogue-bank-set-ops-i:02:text-gemma-awtd", port: "result" },
        ],
        settings: { requested: { mode: "a_minus_b" }, effective: { mode: "a_minus_b" }, origin: "scenario_default" },
      },
    ],
    defaultSettings: { topK: 12 },
    requiredResults: ["parameter-bank"], optionalResults: [],
    resultDestinations: ["automation-history", "tri-modal-stage"],
  },
  {
    id: "catalogue-bank-merge-r", version: 1,
    title: "R · Template → Qwen + Gemma → Merge",
    description: "Two text parameter banks from one resolved template Brief, merged in Qwen-then-Gemma order using keep_first for duplicate keys and conflicting values.",
    goal: "parameter_bank_merge",
    acceptedInputs: ["templateVariables", "brief"],
    preparationPolicies: { brief: "template-with-explicit-variables", searchMode: "single" },
    stages: [
      {
        ...makeStage("catalogue-bank-merge-r", "brief.from_template", 0),
        inputBindings: [],
        settings: {
          requested: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" },
          effective: { templateBrief: "Ambient electronic cue with {{mood}} texture and {{space}} space" },
          origin: "scenario_default",
        },
      },
      {
        ...makeStage("catalogue-bank-merge-r", "text.qwen.resolved", 1),
        inputBindings: [
          { name: "previousStage", from: "stage:catalogue-bank-merge-r:01:brief-from_template", port: "order" },
          { name: "brief", from: "stage:catalogue-bank-merge-r:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 12 }, effective: { topK: 12 }, origin: "scenario_default" },
      },
      {
        ...makeStage("catalogue-bank-merge-r", "text.gemma.awtd", 2),
        inputBindings: [
          { name: "previousStage", from: "stage:catalogue-bank-merge-r:02:text-qwen-resolved", port: "order" },
          { name: "brief", from: "stage:catalogue-bank-merge-r:01:brief-from_template", port: "result" },
        ],
        settings: { requested: { topK: 8 }, effective: { topK: 8 }, origin: "scenario_default" },
      },
      {
        ...makeStage("catalogue-bank-merge-r", "data.merge", 3),
        inputBindings: [
          { name: "previousStage", from: "stage:catalogue-bank-merge-r:03:text-gemma-awtd", port: "order" },
          { name: "qwenBank", from: "stage:catalogue-bank-merge-r:02:text-qwen-resolved", port: "result" },
          { name: "gemmaBank", from: "stage:catalogue-bank-merge-r:03:text-gemma-awtd", port: "result" },
        ],
        settings: { requested: { duplicates: "keep_first", conflicts: "keep_first" }, effective: { duplicates: "keep_first", conflicts: "keep_first" }, origin: "scenario_default" },
      },
    ],
    defaultSettings: { topK: 50 },
    requiredResults: ["parameter-bank"], optionalResults: ["brief"],
    resultDestinations: ["automation-history"],
  },
  scenario("template-to-parameters", "Template Brief → Qwen parameters", "Use the explicit saved-template text supplied in the workbench, then retrieve a separate Qwen bank.", "brief_parameters", ["brief.from_template", "text.qwen.resolved"]),
  scenario("brief-to-parameters", "Brief → Qwen parameters", "Retrieve a Qwen parameter bank from an explicit Brief.", "brief_parameters", ["text.qwen.resolved"]),
  scenario("brief-to-gemma-awtd", "Brief → Gemma text AWTD", "Retrieve and preserve the Gemma text identity bank without claiming value resolution.", "brief_parameters", ["text.gemma.awtd"]),
  scenario("brief-to-gemma-values", "Brief → Gemma AWTD → Resolved", "Reuse the explicit Gemma AWTD bank for value resolution; do not repeat its retrieval.", "brief_parameters", ["text.gemma.awtd", "text.gemma.resolved"]),
  scenario("brief-to-gemma-values-client-stage2", "Brief → Gemma values → client Stage-2", "Resolve the Gemma AWTD bank, then smooth its explicit result.", "brief_parameters_stage2", ["text.gemma.awtd", "text.gemma.resolved", "stage2.client"]),
  scenario("brief-to-gemma-values-server-stage2", "Brief → Gemma values → server Stage-2", "Resolve the Gemma AWTD bank, then run server Stage-2 from that seed.", "brief_parameters_stage2", ["text.gemma.awtd", "text.gemma.resolved", "stage2.server"]),
  scenario("brief-to-gemma-values-both-stage2", "Brief → Gemma values → client + server Stage-2", "Keep client smoothing and seed-based server retrieval separate.", "brief_parameters_stage2", ["text.gemma.awtd", "text.gemma.resolved", "stage2.client", "stage2.server"]),
  scenario("brief-to-parameters-client-stage2", "Brief → Qwen → client Stage-2", "Smooth the explicit Qwen result using the existing client consensus algorithm; no second search.", "brief_parameters_stage2", ["text.qwen.resolved", "stage2.client"]),
  scenario("brief-to-parameters-server-stage2", "Brief → Qwen → server Stage-2", "Run a second indexed search using the explicit Qwen Stage-1 seed.", "brief_parameters_stage2", ["text.qwen.resolved", "stage2.server"]),
  scenario("brief-to-parameters-both-stage2", "Brief → Qwen → client + server Stage-2", "Keep client smoothing and the separate seed-based server retrieval as distinct results.", "brief_parameters_stage2", ["text.qwen.resolved", "stage2.client", "stage2.server"]),
  scenario("audio-to-parameters", "Audio → CLAP + SigLIP parameters", "Prepare bounded windows and retrieve audio and spectrogram parameter banks.", "audio_parameters", ["audio.segment", "audio.clap.resolved", "spec.siglip.resolved"], { segment: { boundaryMode: "uniform", countMode: "automatic", maximumCount: 15 } }),
  scenario("audio-to-clap", "Audio → CLAP parameters", "Prepare bounded windows and retrieve only the CLAP audio bank.", "audio_parameters", ["audio.segment", "audio.clap.resolved"], { segment: { boundaryMode: "uniform", countMode: "automatic", maximumCount: 15 } }),
  scenario("audio-to-siglip", "Audio → SigLIP parameters", "Prepare bounded windows and retrieve only the SigLIP spectrogram bank.", "audio_parameters", ["audio.segment", "spec.siglip.resolved"], { segment: { boundaryMode: "uniform", countMode: "automatic", maximumCount: 15 } }),
  scenario("audio-to-gemma-awtd", "Audio → Gemma audio AWTD", "Search the saved audio and preserve the Gemma audio identity bank without a value pass.", "audio_parameters", ["audio.gemma.awtd"]),
  scenario("audio-to-parameters-client-stage2", "Audio → CLAP + SigLIP → client Stage-2", "Smooth explicit audio/spectrogram frames with the client consensus algorithm.", "audio_parameters_stage2", ["audio.segment", "audio.clap.resolved", "spec.siglip.resolved", "stage2.client"], { segment: { boundaryMode: "uniform", countMode: "automatic", maximumCount: 15 } }),
  scenario("audio-and-brief", "Audio + Brief → Qwen + CLAP + SigLIP", "Use the explicit Brief with bounded audio windows and preserve each retrieval bank.", "multimodal_parameters", ["audio.segment", "text.qwen.resolved", "audio.clap.resolved", "spec.siglip.resolved"]),
  scenario("audio-and-brief-client-stage2", "Audio + Brief → banks → client Stage-2", "Retain Qwen, CLAP and SigLIP banks separately, then smooth their selected frames.", "multimodal_parameters_stage2", ["audio.segment", "text.qwen.resolved", "audio.clap.resolved", "spec.siglip.resolved", "stage2.client"]),
  scenario("audio-and-brief-server-stage2", "Audio + Brief → banks → server Stage-2", "Retain Qwen, CLAP and SigLIP banks separately; server Stage-2 uses only the explicit Qwen seed.", "multimodal_parameters_stage2", ["audio.segment", "text.qwen.resolved", "audio.clap.resolved", "spec.siglip.resolved", "stage2.server"]),
  scenario("audio-and-brief-both-stage2", "Audio + Brief → banks → client + server Stage-2", "Run client smoothing over selected banks and a distinct server retrieval from the Qwen seed.", "multimodal_parameters_stage2", ["audio.segment", "text.qwen.resolved", "audio.clap.resolved", "spec.siglip.resolved", "stage2.client", "stage2.server"]),
  scenario("audio-analysis-profile", "Audio analysis profile", "Run selected audio specialists against the session asset; Helm gates voice presentation.", "audio_analysis", ["audio.extract_acoustics", "audio.describe.lfm3", "audio.transcribe.lfm3", "audio.detect_indic_language", "audio.analyze_helm", "audio.assess_vocal_timbre"]),
  scenario("crystal-to-text", "Crystal → Brief → Qwen", "Use an explicitly selected crystal or randomizer policy, then retrieve text parameters.", "crystal_parameters", ["brief.from_crystal", "text.qwen.resolved"]),
  scenario("parameters-to-text", "Parameters → text features", "Build an immutable text-feature snapshot from explicitly selected parameter artifacts.", "parameter_description", ["text_features.build", "text_features.compare_rankings"]),
  scenario("audio-description-to-parameters", "Audio description → parameters", "Describe an audio range, then use the derived description for text retrieval.", "audio_description_parameters", ["audio.describe.lfm3", "text.qwen.resolved"]),
  scenario("audio-reverse-query", "Audio → CLAP → Reverse Query → Qwen", "Retrieve audio parameters, derive a query with provenance, then run a separate text retrieval.", "audio_reverse_query", ["audio.segment", "audio.clap.resolved", "text_features.build", "text_features.reverse_query", "text.qwen.resolved"]),
  audioToBriefScenario(),
  audioToBriefGapFillScenario(),
  scenario("vocal-allocation", "Vocal Allocation Matrix", "Run the existing vocal allocation search and preserve its clean macro output.", "vocal_allocation", ["vocal_allocation.search"]),
];

export const AUTOMATION_SCENARIOS: AutomationScenarioDefinition[] = [...legacy, ...additional];

export const ACTION_CAPABILITY: Partial<Record<AutomationActionId, string>> = capabilityByAction;
export const ACTION_INDEXES: Partial<Record<AutomationActionId, string[]>> = {
  "text.qwen.resolved": ["composite"], "text.gemma.awtd": ["embeddinggemma2_text"], "text.gemma.resolved": ["embeddinggemma2_text", "composite"],
  "audio.clap.resolved": ["clap"], "spec.siglip.resolved": ["siglip"], "audio.gemma.awtd": ["embeddinggemma2_text"],
  "audio.gemma.resolved": ["embeddinggemma2_text", "composite"], "stage2.server": ["composite"], "vocal_allocation.search": ["composite"],
};

export const ACTION_SUPPORTED = supported;
export const ACTION_LABELS = Object.fromEntries(AUTOMATION_SCENARIOS.flatMap((item) => item.stages).map((stage) => [stage.actionId, stage.title])) as Record<string, string>;
