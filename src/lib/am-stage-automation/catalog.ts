import { AM_STAGE_AUTOMATION_PRESETS } from "@/lib/am-stage-automation-library";
import { LEGACY_ACTION_IDS, type AutomationActionId, type AutomationScenarioDefinition, type AutomationStageDefinition } from "./contracts";

const supported = new Set<AutomationActionId>([
  "brief.from_crystal", "brief.from_template",
  "audio.segment", "text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved",
  "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved",
  "stage2.client", "stage2.server", "audio.extract_acoustics", "audio.describe.lfm3", "audio.describe_gaps.lfm3", "audio.transcribe.lfm3",
  "audio.analyze", "audio.analyze_helm", "audio.detect_indic_language", "audio.assess_vocal_timbre", "vocal_allocation.search",
  "text_features.build", "text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query",
  "brief.combine_segment_texts",
]);

const capabilityByAction: Partial<Record<AutomationActionId, string>> = {
  "text.qwen.resolved": "text.qwen.resolved", "text.gemma.awtd": "text.gemma.awtd", "text.gemma.resolved": "text.gemma.resolved",
  "audio.clap.resolved": "audio.clap.resolved", "spec.siglip.resolved": "spec.siglip.resolved",
  "audio.gemma.awtd": "audio.gemma.awtd", "audio.gemma.resolved": "audio.gemma.resolved",
  "audio.extract_acoustics": "side-meta.librosa", "audio.describe.lfm3": "side-meta.lfm3", "audio.describe_gaps.lfm3": "side-meta.lfm3", "audio.transcribe.lfm3": "side-meta.lfm3",
  "audio.detect_indic_language": "side-meta.vakgyata", "audio.assess_vocal_timbre": "side-meta.gender",
  "audio.analyze_helm": "side-meta.helm",
};

const outputKind: Record<AutomationActionId, string> = {
  "brief.from_crystal": "brief", "brief.from_template": "brief", "audio.analyze": "audio-analysis", "audio.segment": "segment-plan",
  "text.qwen.resolved": "parameter-bank", "text.gemma.awtd": "parameter-bank", "text.gemma.resolved": "parameter-bank",
  "audio.clap.resolved": "parameter-bank", "spec.siglip.resolved": "parameter-bank", "audio.gemma.awtd": "parameter-bank", "audio.gemma.resolved": "parameter-bank",
  "stage2.client": "parameter-bank", "stage2.server": "parameter-bank", "audio.describe.lfm3": "description", "audio.describe_gaps.lfm3": "gap-descriptions", "audio.transcribe.lfm3": "transcription",
  "audio.extract_acoustics": "acoustic-analysis", "audio.detect_indic_language": "language-analysis", "audio.assess_vocal_timbre": "voice-analysis",
  "audio.analyze_helm": "helm-analysis", "text_features.build": "text-feature-snapshot", "text_features.compare_rankings": "ranking-variants",
  "text_features.describe_llm": "natural-description", "text_features.reverse_query": "reverse-query", "brief.combine_segment_texts": "brief", "vocal_allocation.search": "vocal-allocation", "result.bundle": "run-bundle",
};

function makeStage(scenarioId: string, actionId: AutomationActionId, index: number, requiredForGoal = true, overrides: Partial<AutomationStageDefinition> = {}): AutomationStageDefinition {
  const stageId = `${scenarioId}:${String(index + 1).padStart(2, "0")}:${actionId.replaceAll(".", "-")}`;
  return {
    stageId, actionId, title: actionId, role: actionId.split(".")[0], inputBindings: [],
    outputDefinitions: [{ port: "result", kind: outputKind[actionId], required: requiredForGoal }],
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

const additional: AutomationScenarioDefinition[] = [
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
  scenario("audio-analysis-profile", "Audio analysis profile", "Run selected audio specialists against the session asset.", "audio_analysis", ["audio.extract_acoustics", "audio.describe.lfm3", "audio.transcribe.lfm3", "audio.detect_indic_language", "audio.assess_vocal_timbre"]),
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
  "audio.gemma.resolved": ["embeddinggemma2_text", "composite"], "stage2.server": ["composite"],
};

export const ACTION_SUPPORTED = supported;
export const ACTION_LABELS = Object.fromEntries(AUTOMATION_SCENARIOS.flatMap((item) => item.stages).map((stage) => [stage.actionId, stage.title])) as Record<string, string>;
