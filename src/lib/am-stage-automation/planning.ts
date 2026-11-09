import { createHash, randomUUID } from "node:crypto";
import { getArtifactStatuses } from "@/lib/rag-v3/managed-rebuild";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";
import { ACTION_CAPABILITY, ACTION_INDEXES, ACTION_SUPPORTED, AUTOMATION_SCENARIOS } from "./catalog";
import { getConfiguredTextIndexModel } from "@/lib/rag-v3/composite-index";
import { db } from "@/lib/db";
import type { AutomationExternalInputs, AutomationPlanDocument, AutomationScenarioDefinition, AutomationStageDefinition } from "./contracts";
import { AUTOMATION_POLICY, parseBriefTemplateVariables, resolveAutomationTopK, resolveBriefTemplate } from "./policies";

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "null";
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
};
const sha = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
const needsAudio = (id: string) => id.startsWith("audio.") || id.startsWith("spec.") || id === "vocal_allocation.search";
const needsBrief = (id: string) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.gemma.resolved", "stage2.server", "vocal_allocation.search"].includes(id);
const INDEX_READY = new Set(["ready", "built"]);

export interface PlanPreview {
  scenario: { id: string; version: number; title: string; description: string; goal: string };
  plan: AutomationPlanDocument;
  route: Array<AutomationStageDefinition & { readiness: "ready" | "blocked" | "unavailable"; readinessReason?: string }>;
  blockers: Array<{ code: string; message: string; stageId?: string; action?: string }>;
  warnings: string[];
  estimates: { stageCount: number; segmentCount: number | null; durationSeconds: number | null; eta: number | null; confidence: "unknown" | "low" | "medium" | "high"; unknownStageCount: number; forecasts: Array<{ stageId: string; seconds: number | null; lowSeconds: number | null; highSeconds: number | null; sampleCount: number; workUnits: number; basis: "history" | "unknown" }> };
  readiness: { capabilities: Record<string, boolean>; indexes: Record<string, string> };
}

export async function buildAutomationPreview(input: {
  scenarioId: string;
  inputs: AutomationExternalInputs;
  overrides?: Record<string, unknown>;
  draftDefinition?: AutomationScenarioDefinition;
}): Promise<PlanPreview> {
  const base = input.draftDefinition ?? AUTOMATION_SCENARIOS.find((item) => item.id === input.scenarioId);
  if (!base) throw new Error("The requested automation scenario does not exist.");
  const inputs = input.inputs;
  const overrides = input.overrides ?? {};
  if (inputs.audioRange) {
    const { startSeconds, endSeconds, durationSeconds } = inputs.audioRange;
    if (!inputs.assetId || inputs.audioRange.assetId !== inputs.assetId) throw new Error("The selected audio range is not bound to the current audio asset.");
    if (![startSeconds, endSeconds, durationSeconds].every(Number.isFinite) || startSeconds < 0 || endSeconds <= startSeconds || Math.abs((endSeconds - startSeconds) - durationSeconds) > 0.05) throw new Error("The audio range is invalid.");
    if (inputs.audioDurationSeconds && endSeconds > inputs.audioDurationSeconds + 0.05) throw new Error("The audio range exceeds the confirmed asset duration.");
  }
  const selectedBrief = typeof inputs.brief === "string" ? inputs.brief.trim() : "";
  const audit = await getArtifactStatuses();
  const indexStatuses = Object.fromEntries(audit.artifacts.map((artifact) => [artifact.kind, artifact.status]));
  const settings = await loadLLMSettings();
  const textIndex = inputs.workspaceSnapshot?.textIndex === "embeddinggemma2" ? "embeddinggemma2" : "qwen3";
  const embeddingModel = await getConfiguredTextIndexModel(textIndex);
  const allStages = base.stages.map((stage) => ({ ...stage, inputBindings: [...stage.inputBindings], outputDefinitions: [...stage.outputDefinitions], settings: { ...stage.settings, requested: { ...stage.settings.requested }, effective: { ...stage.settings.effective } } }));
  const snapshot = inputs.workspaceSnapshot;

  const textSampleLimit = Math.max(1, Math.min(500, Math.trunc(Number(overrides.textLlmSampleLimit ?? 5) || 5)));
  for (const stage of allStages) {
    if (stage.actionId === "text_features.reverse_query" || stage.actionId === "text_features.describe_llm") {
      stage.settings = { ...stage.settings, requested: { ...stage.settings.requested, textLlmSampleLimit: textSampleLimit }, effective: { ...stage.settings.effective, textLlmSampleLimit: textSampleLimit } };
    }
  }

  const consumesSegmentPlan = (stage: AutomationStageDefinition) => ["audio.clap.resolved", "spec.siglip.resolved", "audio.extract_acoustics", "audio.analyze", "audio.describe_gaps.lfm3"].includes(stage.actionId)
    || (["audio.gemma.awtd", "audio.gemma.resolved", "text_features.build"].includes(stage.actionId) && stage.settings.effective.perSegmentResults === true);
  const usesNodes = allStages.some(consumesSegmentPlan);
  const hasSegmentProducer = allStages.some((stage) => stage.actionId === "audio.segment");
  if (usesNodes && !hasSegmentProducer) {
    const insertionIndex = allStages.findIndex(consumesSegmentPlan);
    if (insertionIndex >= 0) {
      const scenarioId = base.id;
      const stageId = `${scenarioId}:auto:audio-segment`;
      const requested = (overrides.segment as Record<string, unknown> | undefined) ?? { boundaryMode: "uniform", countMode: "at_most", maximumCount: AUTOMATION_POLICY.defaultSegmentMaximum, requestedCount: AUTOMATION_POLICY.defaultSegmentMaximum, intervalSeconds: AUTOMATION_POLICY.defaultSegmentIntervalSeconds };
      const maxCount = Number(requested.maximumCount ?? AUTOMATION_POLICY.defaultSegmentMaximum);
      const segmentStage: AutomationStageDefinition = {
        stageId, actionId: "audio.segment", title: "audio.segment", role: "audio", inputBindings: [{ name: "audioRange", from: "external:audioRange" }],
        outputDefinitions: [{ port: "result", kind: "segment-plan", required: true }],
        settings: { requested, effective: { ...requested, maximumCount: Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(maxCount || AUTOMATION_POLICY.defaultSegmentMaximum))) }, origin: "manual" },
        requiredForGoal: true, failurePolicy: "fail_run", allowedFallbacks: [], available: true,
      };
      allStages.splice(insertionIndex, 0, segmentStage);
    }
  }
  const segmentProducer = allStages.find((stage) => stage.actionId === "audio.segment");
  if (segmentProducer) {
    const requested = segmentProducer.settings.requested.locked === true
      ? segmentProducer.settings.requested
      : (overrides.segment as Record<string, unknown> | undefined) ?? segmentProducer.settings.requested;
    segmentProducer.settings = { requested, effective: { ...requested, maximumCount: Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(Number(requested.maximumCount ?? AUTOMATION_POLICY.defaultSegmentMaximum)))) }, origin: Object.keys(overrides).includes("segment") ? "manual" : segmentProducer.settings.origin };
    for (const stage of allStages) {
      if (!consumesSegmentPlan(stage)) continue;
      if (stage.inputBindings.some((binding) => binding.name === "segmentPlan")) {
        stage.inputBindings = stage.inputBindings.map((binding) => binding.name === "segmentPlan" ? { ...binding, from: `stage:${segmentProducer.stageId}` } : binding);
      } else {
        stage.inputBindings.push({ name: "segmentPlan", from: `stage:${segmentProducer.stageId}`, port: "result" });
      }
    }
  }

  const blockers: PlanPreview["blockers"] = [];
  const warnings: string[] = [];
  const briefAssemblyStage = allStages.find((stage) => stage.actionId === "brief.combine_segment_texts");
  if (briefAssemblyStage) {
    const assembly = inputs.briefAssembly ?? { sources: { reverseQuery: true, interpretations: true, textFeatures: false, trackDraft: false }, executor: "freellmapi" as const };
    const segmentSourcesSelected = assembly.sources.reverseQuery || assembly.sources.interpretations || assembly.sources.textFeatures || assembly.sources.gapDescriptions === true;
    if (!segmentSourcesSelected && !assembly.sources.trackDraft) blockers.push({ code: "BRIEF_SOURCE_REQUIRED", message: "Select at least one segment evidence source or a saved track-description draft.", stageId: briefAssemblyStage.stageId });
    if (assembly.sources.trackDraft && (!assembly.trackDraft?.sessionId || !assembly.trackDraft.text.trim() || !["en", "ru"].includes(assembly.trackDraft.language))) blockers.push({ code: "TRACK_DRAFT_SOURCE_MISSING", message: "The selected track-description source needs a saved EN/RU description from an AM-Stage snapshot.", stageId: briefAssemblyStage.stageId });
    const boundActions = briefAssemblyStage.inputBindings.filter((binding) => binding.port !== "order").map((binding) => allStages.find((stage) => stage.stageId === binding.from.slice(6))?.actionId);
    for (const [enabled, actionId, label] of [[assembly.sources.reverseQuery, "text_features.reverse_query", "Reverse Query"], [assembly.sources.interpretations, "text_features.describe_llm", "interpretations"], [assembly.sources.textFeatures, "text_features.build", "text features"], [assembly.sources.gapDescriptions === true, "audio.describe_gaps.lfm3", "center gap descriptions"]] as const) {
      if (enabled && !boundActions.includes(actionId)) blockers.push({ code: "BRIEF_SOURCE_BINDING_MISSING", message: `Selected ${label} has no explicit bound producer stage. Add that stage before Brief assembly.`, stageId: briefAssemblyStage.stageId });
      if (enabled && boundActions.filter((boundAction) => boundAction === actionId).length > 1) blockers.push({ code: "BRIEF_SOURCE_BINDING_AMBIGUOUS", message: `Selected ${label} has multiple bound producers. Keep one producer for this source category so no results are silently omitted.`, stageId: briefAssemblyStage.stageId });
    }
    if (assembly.executor === "ollama_model" && !assembly.model?.trim()) blockers.push({ code: "BRIEF_OLLAMA_MODEL_REQUIRED", message: "Choose an installed Ollama model for this Brief operation.", stageId: briefAssemblyStage.stageId });
  }
  if (base.id === "audio-to-brief" && (!inputs.audioRange || inputs.audioRange.durationSeconds <= 120)) {
    blockers.push({ code: "AUDIO_TO_BRIEF_REQUIRES_LONG_AUDIO", message: "This route requires a selected audio range longer than 2 minutes." });
  }
  const selectedArtifactIds = [...new Set(inputs.selectedArtifactIds ?? [])];
  if (selectedArtifactIds.length) {
    const selectedArtifacts = await db.automationArtifact.findMany({
      where: { id: { in: selectedArtifactIds } },
      select: { id: true, kind: true },
    });
    const foundIds = new Set(selectedArtifacts.map((artifact) => artifact.id));
    const missingCount = selectedArtifactIds.filter((id) => !foundIds.has(id)).length;
    if (missingCount) blockers.push({ code: "ARTIFACT_REFERENCE_MISSING", message: `${missingCount} selected artifact reference(s) no longer exist. Refresh run history and choose available artifacts.` });
    if (selectedArtifacts.some((artifact) => artifact.kind !== "parameter-bank")) blockers.push({ code: "ARTIFACT_SCHEMA_INCOMPATIBLE", message: "Text-feature inputs must be parameter-bank artifacts." });
  }
  const capabilities: Record<string, boolean> = {};
  const route = allStages.map((stage) => {
    let readiness: "ready" | "blocked" | "unavailable" = "ready";
    let readinessReason: string | undefined;
    if (!stage.available || !ACTION_SUPPORTED.has(stage.actionId)) {
      readiness = "unavailable"; readinessReason = stage.unavailableReason ?? "No adapter is registered for this action.";
      blockers.push({ code: "ACTION_UNAVAILABLE", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
    }
    const selectedDuration = inputs.audioRange?.durationSeconds ?? 0;
    const maxWindowSeconds = stage.actionId === "audio.analyze_helm" ? 10 : ["audio.describe.lfm3", "audio.transcribe.lfm3", "audio.detect_indic_language", "audio.assess_vocal_timbre"].includes(stage.actionId) ? 30 : null;
    if (maxWindowSeconds !== null && selectedDuration > maxWindowSeconds) {
      readiness = "blocked"; readinessReason = `${stage.actionId} currently accepts up to ${maxWindowSeconds} seconds per call; split the selected range or choose a shorter range.`;
      blockers.push({ code: "AUDIO_WINDOW_TOO_LONG", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
    }
    if (needsAudio(stage.actionId) && !inputs.assetId) {
      readiness = readiness === "unavailable" ? readiness : "blocked"; readinessReason = "Select or restore a persistent audio asset.";
      blockers.push({ code: "AUDIO_REQUIRED", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
    }
    if (needsAudio(stage.actionId) && !inputs.audioRange) {
      readiness = readiness === "unavailable" ? readiness : "blocked"; readinessReason = "Choose a valid audio range for this stage.";
      blockers.push({ code: "AUDIO_RANGE_REQUIRED", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
    }
    if (needsBrief(stage.actionId) && !selectedBrief && stage.actionId !== "text_features.build") {
      const preparationStageExists = allStages.slice(0, allStages.indexOf(stage)).some((item) => ["brief.from_crystal", "brief.from_template", "audio.describe.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"].includes(item.actionId));
      if (!preparationStageExists) {
        readiness = readiness === "unavailable" ? readiness : "blocked"; readinessReason = "Enter a Brief or select an explicit preparation method.";
        blockers.push({ code: "BRIEF_REQUIRED", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
      }
    }
    if (stage.actionId === "brief.from_template" && !String(snapshot?.templateBrief ?? "").trim()) {
      readiness = "blocked"; readinessReason = "Enter a template Brief before starting this route.";
      blockers.push({ code: "TEMPLATE_BRIEF_REQUIRED", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
    }
    if (stage.actionId === "brief.from_template" && String(snapshot?.templateBrief ?? "").trim()) {
      try {
        const variables = parseBriefTemplateVariables(String(snapshot?.templateVariablesText ?? ""));
        const unresolved = resolveBriefTemplate(String(snapshot?.templateBrief), variables).unresolved;
        if (unresolved.length) { readiness = "blocked"; readinessReason = "Template substitutions missing values: " + unresolved.join(", ") + "."; blockers.push({ code: "TEMPLATE_VARIABLES_REQUIRED", message: readinessReason, stageId: stage.stageId, action: stage.actionId }); }
      } catch (error) { readiness = "blocked"; readinessReason = error instanceof Error ? error.message : String(error); blockers.push({ code: "TEMPLATE_VARIABLES_INVALID", message: readinessReason, stageId: stage.stageId, action: stage.actionId }); }
    }
    if (["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "stage2.server"].includes(stage.actionId) && snapshot?.searchMode === "transition" && !String(snapshot.queryB ?? "").trim()) {
      readiness = "blocked"; readinessReason = "Transition mode requires both Query A and Query B.";
      blockers.push({ code: "TRANSITION_QUERY_B_REQUIRED", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
    }
    const capability = ACTION_CAPABILITY[stage.actionId];
    if (capability) {
      const enabled = capabilityIsEnabled(settings.capabilityRegistry, capability);
      capabilities[capability] = enabled;
      if (!enabled) {
        readiness = readiness === "unavailable" ? readiness : "blocked"; readinessReason = `${capability} is disabled in Settings.`;
        blockers.push({ code: "CAPABILITY_DISABLED", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
      }
    }
    for (const index of ACTION_INDEXES[stage.actionId] ?? []) {
      const status = indexStatuses[index] ?? "missing";
      if (!INDEX_READY.has(status)) {
        readiness = readiness === "unavailable" ? readiness : "blocked"; readinessReason = `${index} index is ${status}; check Service Bay.`;
        blockers.push({ code: "INDEX_NOT_READY", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
      }
    }
    if (["text.gemma.resolved", "audio.gemma.resolved"].includes(stage.actionId)) {
      for (const extraCapability of ["text.gemma.resolved", "text.qwen.resolved"]) {
        const enabled = capabilityIsEnabled(settings.capabilityRegistry, extraCapability);
        capabilities[extraCapability] = enabled;
        if (!enabled) {
          readiness = readiness === "unavailable" ? readiness : "blocked";
          readinessReason = `${extraCapability} is required for identity-to-value resolution.`;
          blockers.push({ code: "CAPABILITY_DISABLED", message: readinessReason, stageId: stage.stageId, action: stage.actionId });
        }
      }
    }
    return { ...stage, readiness, ...(readinessReason ? { readinessReason } : {}) };
  });

  const addStageBlocker = (stageId: string, code: string, message: string) => {
    if (blockers.some((item) => item.stageId === stageId && item.code === code)) return;
    blockers.push({ code, message, stageId });
    const row = route.find((item) => item.stageId === stageId);
    if (row && row.readiness !== "unavailable") { row.readiness = "blocked"; row.readinessReason = message; }
  };
  const stagePosition = new Map(allStages.map((stage, index) => [stage.stageId, index]));
  for (const [index, stage] of allStages.entries()) {
    if (stage.requiredForGoal && stage.failurePolicy === "continue") addStageBlocker(stage.stageId, "REQUIRED_STAGE_CANNOT_CONTINUE", "A required stage cannot use the continue-on-failure policy. Mark it optional or fail the run.");
    for (const binding of stage.inputBindings) {
      if (binding.from.startsWith("stage:")) {
        const sourceId = binding.from.slice("stage:".length);
        const sourceIndex = stagePosition.get(sourceId);
        if (sourceIndex === undefined) addStageBlocker(stage.stageId, "DEPENDENCY_SOURCE_MISSING", `Input '${binding.name}' refers to a missing stage.`);
        else if (sourceIndex >= index) addStageBlocker(stage.stageId, "DEPENDENCY_ORDER_INVALID", `Input '${binding.name}' must refer to an earlier stage; execution-order links do not provide data.`);
        else if (binding.port !== "order" && !allStages[sourceIndex].outputDefinitions.some((output) => output.port === (binding.port ?? "result"))) addStageBlocker(stage.stageId, "DEPENDENCY_PORT_MISSING", `Input '${binding.name}' refers to an output port the source stage does not produce.`);
        else if (binding.port !== "order") {
          const sourceAction = allStages[sourceIndex].actionId;
          const compatible = binding.name === "segmentPlan" ? sourceAction === "audio.segment"
            : binding.name === "anchors" && stage.actionId === "audio.describe_gaps.lfm3" ? sourceAction === "text_features.describe_llm"
            : binding.name === "brief" ? ["brief.from_crystal", "brief.from_template", "audio.describe.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"].includes(sourceAction)
            : binding.name === "snapshot" ? sourceAction === "text_features.build"
              : binding.name.startsWith("source") && stage.actionId === "brief.combine_segment_texts" ? ["text_features.reverse_query", "text_features.describe_llm", "text_features.build", "audio.describe_gaps.lfm3"].includes(sourceAction)
              : binding.name === "identityBank" ? sourceAction === (stage.actionId === "text.gemma.resolved" ? "text.gemma.awtd" : "audio.gemma.awtd")
                : binding.name === "identityBankB" ? stage.actionId === "text.gemma.resolved" && sourceAction === "text.gemma.awtd"
                : binding.name === "stage1" ? ["text.qwen.resolved", "text.gemma.resolved"].includes(sourceAction)
                  : binding.name.startsWith("source") && stage.actionId === "stage2.client" ? ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"].includes(sourceAction)
                    : binding.name.startsWith("parameterBank") && stage.actionId === "text_features.build" ? ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server"].includes(sourceAction)
                      : true;
          if (!compatible) addStageBlocker(stage.stageId, "DEPENDENCY_SCHEMA_INCOMPATIBLE", `Input '${binding.name}' cannot consume the result produced by ${sourceAction}.`);
        }
      } else if (binding.from.startsWith("external:")) {
        const externalName = binding.from.slice("external:".length);
        if (externalName !== "audioRange") addStageBlocker(stage.stageId, "EXTERNAL_INPUT_UNKNOWN", `Input '${binding.name}' refers to an unsupported external input.`);
        else if (binding.name !== "audioRange" || stage.actionId !== "audio.segment") addStageBlocker(stage.stageId, "EXTERNAL_INPUT_SCHEMA_INCOMPATIBLE", `External audio range cannot be bound to '${binding.name}' on ${stage.actionId}.`);
      }
    }
    const dataSources = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from.startsWith("stage:")).map((binding) => allStages[stagePosition.get(binding.from.slice(6)) ?? -1]).filter(Boolean);
    if (stage.actionId === "audio.describe_gaps.lfm3") {
      if (!dataSources.some((source) => source.actionId === "text_features.describe_llm" && stage.inputBindings.some((binding) => binding.name === "anchors" && binding.from === `stage:${source.stageId}`))) {
        addStageBlocker(stage.stageId, "GAP_ANCHORS_REQUIRED", "Center gap descriptions need a bound per-node Describe features result as their left/right text anchors.");
      }
      const requestedClip = Number(stage.settings.effective.gapClipSeconds ?? 8);
      if (!Number.isFinite(requestedClip) || requestedClip < 0.25 || requestedClip > 30) addStageBlocker(stage.stageId, "GAP_CLIP_DURATION_INVALID", "Central audio clip duration must be between 0.25 and 30 seconds.");
    }
    if (stage.actionId === "stage2.client" && !dataSources.some((source) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"].includes(source.actionId) && stage.inputBindings.some((binding) => binding.port !== "order" && binding.from === `stage:${source.stageId}` && binding.name.startsWith("source")))) {
      addStageBlocker(stage.stageId, "CLIENT_STAGE2_INPUT_REQUIRED", "Select at least one earlier text, CLAP, or SigLIP parameter bank for client Stage-2.");
    }
    if (stage.actionId === "stage2.server" && !dataSources.some((source) => ["text.qwen.resolved", "text.gemma.resolved"].includes(source.actionId) && stage.inputBindings.some((binding) => binding.port !== "order" && binding.from === `stage:${source.stageId}` && binding.name === "stage1"))) {
      addStageBlocker(stage.stageId, "SERVER_STAGE2_SEED_REQUIRED", "Select an earlier Qwen or resolved Gemma text bank as the Stage-1 seed.");
    }
    if (stage.actionId === "text_features.build" && !(snapshot?.parameters?.length) && !dataSources.some((source) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server"].includes(source.actionId) && stage.inputBindings.some((binding) => binding.port !== "order" && binding.from === `stage:${source.stageId}` && binding.name.startsWith("parameterBank")))) {
      addStageBlocker(stage.stageId, "TEXT_FEATURE_SOURCE_REQUIRED", "Select completed parameter-bank artifacts or select source artifacts from run history before building text features.");
    }
    if (["text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query"].includes(stage.actionId) && !dataSources.some((source) => source.actionId === "text_features.build" && stage.inputBindings.some((binding) => binding.port !== "order" && binding.from === `stage:${source.stageId}` && binding.name === "snapshot"))) {
      addStageBlocker(stage.stageId, "TEXT_FEATURE_SNAPSHOT_REQUIRED", "Select an earlier Build text features stage as the snapshot input.");
    }
    const matchingIdentityAction = stage.actionId === "text.gemma.resolved" ? "text.gemma.awtd" : "audio.gemma.awtd";
    const hasIdentityA = dataSources.some((source) => source.actionId === matchingIdentityAction && stage.inputBindings.some((binding) => binding.name === "identityBank" && binding.port !== "order" && binding.from === `stage:${source.stageId}`));
    if (["text.gemma.resolved", "audio.gemma.resolved"].includes(stage.actionId) && !hasIdentityA) {
      addStageBlocker(stage.stageId, "GEMMA_IDENTITY_REQUIRED", "Resolved Gemma values require the matching earlier AWTD identity bank.");
    }
    if (stage.actionId === "text.gemma.resolved" && snapshot?.searchMode === "transition" && !dataSources.some((source) => source.actionId === "text.gemma.awtd" && stage.inputBindings.some((binding) => binding.name === "identityBankB" && binding.port !== "order" && binding.from === `stage:${source.stageId}`))) {
      addStageBlocker(stage.stageId, "GEMMA_TRANSITION_SECOND_IDENTITY_REQUIRED", "Gemma Transition Resolved requires the Query B AWTD artifact as a separate data input.");
    }
    if (needsBrief(stage.actionId) && !selectedBrief) {
    const hasDerivedBrief = dataSources.some((source) => ["brief.from_crystal", "brief.from_template", "audio.describe.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"].includes(source.actionId));
      if (!hasDerivedBrief) addStageBlocker(stage.stageId, "BRIEF_DATA_BINDING_REQUIRED", "This search has no explicit Brief input or earlier stage that produces a Brief.");
    }
  }

  if (inputs.audioRange && !inputs.audioRange.assetId) blockers.push({ code: "AUDIO_RANGE_UNBOUND", message: "Audio range must be attached to a persistent audio asset." });
  const durationSeconds = inputs.audioRange?.durationSeconds ?? null;
  const segmentRequest = segmentProducer?.settings.requested.locked === true
    ? segmentProducer.settings.effective
    : (overrides.segment as Record<string, unknown> | undefined) ?? segmentProducer?.settings.effective ?? {};
  const countLimit = Number(segmentRequest.maximumCount ?? AUTOMATION_POLICY.defaultSegmentMaximum);
  const intervalSeconds = Number(segmentRequest.intervalSeconds ?? AUTOMATION_POLICY.defaultSegmentIntervalSeconds);
  const countMode = segmentRequest.countMode === "exact" ? "exact" : segmentRequest.countMode === "automatic" ? "automatic" : "at_most";
  const requestedCount = Number(segmentRequest.requestedCount ?? countLimit);
  const estimatedCount = usesNodes && durationSeconds !== null
    ? countMode === "exact" ? Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(requestedCount))) : Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(countLimit), Math.ceil(durationSeconds / Math.max(0.1, intervalSeconds))))
    : null;
  const requestedTopK = Number(overrides.topK ?? inputs.workspaceSnapshot?.topK ?? base.defaultSettings.topK ?? AUTOMATION_POLICY.defaultTopK);
  const topKDecision = resolveAutomationTopK({ requested: requestedTopK, automatic: inputs.workspaceSnapshot?.autoTopK === true, requestCount: usesNodes ? estimatedCount ?? 1 : 1 });
  for (const stage of allStages) {
    const stageTopK = Number(stage.settings.requested.topK ?? requestedTopK);
    const stageTopKDecision = resolveAutomationTopK({ requested: stageTopK, automatic: inputs.workspaceSnapshot?.autoTopK === true, requestCount: usesNodes ? estimatedCount ?? 1 : 1 });
    stage.settings.requested = { ...stage.settings.requested, topK: stageTopK };
    stage.settings.effective = { ...stage.settings.effective, topK: stageTopKDecision.effective };
    stage.settings.origin = stage.settings.origin === "manual" ? "manual" : stageTopKDecision.origin;
  }
  for (const stage of allStages) {
    const indexKinds = ACTION_INDEXES[stage.actionId] ?? (stage.actionId.startsWith("text.") ? ["composite"] : []);
    const bindings = indexKinds.map((kind) => {
      const artifact = audit.artifacts.find((item) => item.kind === kind);
      return { kind, model: artifact?.model ?? (kind === "composite" ? embeddingModel : null), fingerprint: artifact?.fingerprint ?? null };
    });
    const modelId = bindings.map((item) => `${item.kind}:${item.model ?? "missing"}`).join("|") || null;
    const fingerprint = bindings.map((item) => `${item.kind}:${item.fingerprint ?? "missing"}`).join("|") || null;
    const unit = ["audio.clap.resolved", "spec.siglip.resolved", "audio.extract_acoustics", "audio.analyze"].includes(stage.actionId) ? "window" : stage.actionId === "audio.gemma.awtd" || stage.actionId === "audio.gemma.resolved" ? "audio_chunk" : "call";
    const metricClass = sha({ actionId: stage.actionId, modelId, fingerprint, unit, transition: snapshot?.searchMode === "transition" && stage.actionId.startsWith("text.") });
    stage.settings.effective = { ...stage.settings.effective, metricClass, metricUnit: unit, metricModel: modelId, metricFingerprint: fingerprint };
  }
  if (!inputs.brief && base.id === "crystal-to-text") warnings.push("Crystal choice is a preparation stage and will be recorded before text retrieval.");

  const dependencyRows = allStages.flatMap((stage) => stage.inputBindings.filter((binding) => binding.from.startsWith("stage:")).map((binding) => ({ from: binding.from.slice(6), to: stage.stageId, kind: binding.port === "order" ? "order" as const : "data" as const, ...(binding.port === "order" ? {} : { port: binding.port }) })));
  const historicalAttempts = await db.automationAttempt.findMany({ where: { status: "succeeded" }, orderBy: { finishedAt: "desc" }, take: 500, include: { stage: { select: { actionId: true } } } });
  const samplesByClass = new Map<string, Array<{ perUnit: number; duration: number; units: number }>>();
  for (const attempt of historicalAttempts) {
    try {
      const config = JSON.parse(attempt.effectiveConfigJson) as Record<string, unknown>;
      const metrics = JSON.parse(attempt.metricsJson ?? "{}") as Record<string, unknown>;
      const metricClass = String(config.metricClass ?? metrics.metricClass ?? "");
      const duration = Number(metrics.wallDurationMs);
      const units = Math.max(1, Number(metrics.workUnits ?? 1));
      if (!metricClass || !Number.isFinite(duration) || duration <= 0) continue;
      const list = samplesByClass.get(metricClass) ?? [];
      list.push({ perUnit: duration / units, duration, units }); samplesByClass.set(metricClass, list);
    } catch { /* Ignore legacy attempts without compatible metrics. */ }
  }
  const workUnitsFor = (stage: AutomationStageDefinition) => {
    if (["audio.clap.resolved", "spec.siglip.resolved", "audio.extract_acoustics", "audio.analyze"].includes(stage.actionId)) return Math.max(1, estimatedCount ?? 1);
    if (["audio.gemma.awtd", "audio.gemma.resolved"].includes(stage.actionId)) return Math.max(1, Math.ceil((durationSeconds ?? 1) / 20));
    if (stage.actionId.startsWith("text.") && snapshot?.searchMode === "transition") return 2;
    return 1;
  };
  const forecasts = allStages.map((stage) => {
    const metricClass = String(stage.settings.effective.metricClass ?? "");
    const samples = samplesByClass.get(metricClass) ?? [];
    if (!samples.length) return { stageId: stage.stageId, seconds: null as number | null, lowSeconds: null as number | null, highSeconds: null as number | null, sampleCount: 0, workUnits: workUnitsFor(stage), basis: "unknown" as const };
    const sorted = samples.map((sample) => sample.perUnit).sort((a, b) => a - b);
    const percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
    const units = workUnitsFor(stage);
    return { stageId: stage.stageId, seconds: percentile(0.5) * units / 1000, lowSeconds: percentile(0.25) * units / 1000, highSeconds: percentile(0.75) * units / 1000, sampleCount: samples.length, workUnits: units, basis: "history" as const };
  });
  const knownForecasts = forecasts.filter((forecast) => forecast.seconds !== null);
  const estimatedExecutionSeconds = knownForecasts.reduce((sum, item) => sum + (item.seconds ?? 0), 0);
  const unknownStageCount = forecasts.length - knownForecasts.length;
  const estimateConfidence = knownForecasts.length === 0 ? "unknown" as const : unknownStageCount > 0 || knownForecasts.some((item) => item.sampleCount < 3) ? "low" as const : knownForecasts.some((item) => item.sampleCount < 10) ? "medium" as const : "high" as const;
  const document = {
    schemaVersion: 1, id: randomUUID(), scenarioRef: { id: base.id, version: base.version }, goal: base.goal,
    externalInputs: inputs,
    searchContext: { ...(inputs.workspaceSnapshot ?? {}), topK: topKDecision.effective, topKRequested: topKDecision.requested, topKOrigin: topKDecision.origin, topKReason: topKDecision.reason, ...(Object.keys(overrides).length ? { overrides } : {}) },
    modelBindings: { textIndex: { indexId: textIndex, modelId: embeddingModel, registryOrigin: "current-capability-registry" }, selectedActionIndexes: Object.fromEntries([...new Set(allStages.flatMap((stage) => ACTION_INDEXES[stage.actionId] ?? []))].map((kind) => { const index = audit.artifacts.find((item) => item.kind === kind); return [kind, { kind, status: indexStatuses[kind] ?? "missing", modelId: index?.model ?? null, fingerprint: index?.fingerprint ?? null }]; })) }, preparationPolicies: base.preparationPolicies, stages: allStages, dependencies: dependencyRows,
    resourcePolicies: { concurrency: "single-active-run", modelSlot: "shared", onBusy: "wait-cancellable" },
    budgetPolicies: { segmentCount: estimatedCount, textLlmSampleLimit: textSampleLimit, topK: topKDecision.effective, topKRequested: topKDecision.requested, topKOrigin: topKDecision.origin, topKReason: topKDecision.reason, candidateBudget: AUTOMATION_POLICY.candidateBudget },
    resultRequirements: base.requiredResults, previewEstimates: { durationSeconds, segmentCount: estimatedCount, estimatedExecutionSeconds: knownForecasts.length ? estimatedExecutionSeconds : null, unknownStageCount, confidence: estimateConfidence, forecasts },
    fingerprint: "" as string, createdAt: new Date().toISOString(),
  };
  const fingerprint = sha({ ...document, id: "", createdAt: "", fingerprint: "" });
  const plan: AutomationPlanDocument = { ...document, fingerprint };
  return { scenario: { id: base.id, version: base.version, title: base.title, description: base.description, goal: base.goal }, plan, route, blockers, warnings, estimates: { stageCount: allStages.length, segmentCount: estimatedCount, durationSeconds, eta: knownForecasts.length ? estimatedExecutionSeconds : null, confidence: estimateConfidence, unknownStageCount, forecasts }, readiness: { capabilities, indexes: indexStatuses } };
}

export function validateScenarioDefinition(input: AutomationScenarioDefinition): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const stage of input.stages) {
    if (!stage.stageId.trim() || ids.has(stage.stageId)) issues.push(`Duplicate or empty stageId: ${stage.stageId || "(empty)"}`);
    ids.add(stage.stageId);
    if (!stage.actionId) issues.push(`Stage ${stage.stageId} has no actionId.`);
  }
  for (const stage of input.stages) for (const binding of stage.inputBindings) if (binding.from.startsWith("stage:") && !ids.has(binding.from.slice(6))) issues.push(`Stage ${stage.stageId} references missing stage ${binding.from.slice(6)}.`);
  const graph = new Map(input.stages.map((stage) => [stage.stageId, stage.inputBindings.filter((binding) => binding.from.startsWith("stage:")).map((binding) => binding.from.slice(6))]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => { if (visiting.has(id)) return false; if (visited.has(id)) return true; visiting.add(id); for (const next of graph.get(id) ?? []) if (!visit(next)) return false; visiting.delete(id); visited.add(id); return true; };
  for (const id of graph.keys()) if (!visit(id)) { issues.push("Scenario dependencies contain a cycle."); break; }
  return issues;
}
