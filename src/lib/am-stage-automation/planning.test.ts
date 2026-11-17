import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationScenarioDefinition, AutomationStageDefinition } from "./contracts";

vi.mock("@/lib/rag-v3/managed-rebuild", () => ({ getArtifactStatuses: vi.fn(async () => ({ artifacts: [] })) }));
vi.mock("@/lib/llm/factory", () => ({ loadLLMSettings: vi.fn(async () => ({ capabilityRegistry: {} })) }));
vi.mock("@/lib/capability-registry", () => ({ capabilityIsEnabled: vi.fn(() => true) }));
vi.mock("@/lib/rag-v3/composite-index", () => ({ getConfiguredTextIndexModel: vi.fn(async () => "qwen3-embedding:0.6b") }));
vi.mock("@/lib/db", () => ({ db: { automationAttempt: { findMany: vi.fn(async () => []) }, automationArtifact: { findMany: vi.fn(async () => []) } } }));

import { buildAutomationPreview, validateScenarioDefinition } from "./planning";
import { AUTOMATION_SCENARIOS } from "./catalog";
import { capabilityIsEnabled } from "@/lib/capability-registry";

function stage(stageId: string, actionId: AutomationStageDefinition["actionId"], bindings: AutomationStageDefinition["inputBindings"] = [], overrides: Partial<AutomationStageDefinition> = {}): AutomationStageDefinition {
  const typedOutputKind: Partial<Record<AutomationStageDefinition["actionId"], string>> = {
    "brief.from_template": "brief", "brief.from_crystal": "brief", "text.limit": "text", "text.assemble": "brief",
    "text.qwen.resolved": "parameter-bank", "text.gemma.awtd": "parameter-bank", "data.merge": "parameter-bank", "data.intersection": "parameter-bank", "data.difference": "parameter-bank",
  };
  return {
    stageId, actionId, title: actionId, role: "test", inputBindings: bindings,
    outputDefinitions: [{ port: "result", kind: typedOutputKind[actionId] ?? (actionId.startsWith("text.") || actionId.startsWith("audio.") || actionId.startsWith("spec.") || actionId.startsWith("stage2.") ? "parameter-bank" : "other"), required: true }],
    settings: { requested: {}, effective: {}, origin: "scenario_default" }, requiredForGoal: true,
    failurePolicy: "fail_run", allowedFallbacks: [], available: true, ...overrides,
  };
}

function scenario(stages: AutomationStageDefinition[]): AutomationScenarioDefinition {
  return { id: "preview-test", version: 1, title: "Preview test", description: "", goal: "test", acceptedInputs: [], preparationPolicies: {}, stages, defaultSettings: { topK: 10 }, requiredResults: [], optionalResults: [], resultDestinations: [] };
}

async function blockers(stages: AutomationStageDefinition[], extra: Record<string, unknown> = {}) {
  const preview = await buildAutomationPreview({
    scenarioId: "preview-test", draftDefinition: scenario(stages),
    inputs: { brief: "test query", workspaceSnapshot: { searchMode: "single" }, ...extra },
  });
  return preview.blockers.map((item) => item.code);
}

describe("Automation preview data-binding validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the disabled Helm negative case out of runnable scenarios and blocks planning", async () => {
    vi.mocked(capabilityIsEnabled).mockReturnValue(false);
    const definition = scenario([stage("helm", "audio.analyze_helm")]);
    const preview = await buildAutomationPreview({
      scenarioId: definition.id,
      draftDefinition: definition,
      inputs: {
        assetId: "helm-fixture-audio",
        audioDurationSeconds: 8,
        audioRange: { assetId: "helm-fixture-audio", startSeconds: 0, endSeconds: 8, durationSeconds: 8 },
      },
    });

    expect(preview.blockers.map((item) => item.code)).toContain("CAPABILITY_DISABLED");
    expect(preview.route[0]?.readiness).toBe("blocked");
    expect(AUTOMATION_SCENARIOS.some((item) => item.id.includes("neg-4") || item.title.includes("NEG-4"))).toBe(false);
  });

  it("blocks a FlowMusic export whose two bank bindings are not ordered CLAP then SigLIP", async () => {
    const flowmusic = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-flowmusic-export-q")!;
    const stages = structuredClone(flowmusic.stages);
    const exportStage = stages.find((item) => item.actionId === "flowmusic.export")!;
    const banks = exportStage.inputBindings.filter((binding) => binding.name === "banks");
    const first = banks[0]!;
    const second = banks[1]!;
    exportStage.inputBindings = exportStage.inputBindings.map((binding) => binding === first ? { ...binding, from: second.from } : binding === second ? { ...binding, from: first.from } : binding);
    const preview = await buildAutomationPreview({
      scenarioId: flowmusic.id, draftDefinition: { ...flowmusic, stages },
      inputs: { assetId: "fixed-audio", audioDurationSeconds: 60, audioRange: { assetId: "fixed-audio", startSeconds: 0, endSeconds: 60, durationSeconds: 60 } },
    });
    expect(preview.blockers.map((item) => item.code)).toContain("FLOWMUSIC_BINDINGS_INVALID");
  });

  it("blocks invalid FlowMusic settings in the executable planner preview", async () => {
    const flowmusic = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-flowmusic-export-q")!;
    const stages = structuredClone(flowmusic.stages);
    const exportStage = stages.find((item) => item.actionId === "flowmusic.export")!;
    exportStage.settings.effective.clapWeight = 1.01;
    const preview = await buildAutomationPreview({
      scenarioId: flowmusic.id, draftDefinition: { ...flowmusic, stages },
      inputs: { assetId: "fixed-audio", audioDurationSeconds: 60, audioRange: { assetId: "fixed-audio", startSeconds: 0, endSeconds: 60, durationSeconds: 60 } },
    });
    expect(preview.blockers.map((item) => item.code)).toContain("FLOWMUSIC_CLAP_WEIGHT_INVALID");
  });

  it("blocks missing, forward, and unknown output-port references", async () => {
    expect(await blockers([stage("consumer", "stage2.client", [{ name: "source1", from: "stage:missing" }])])).toContain("DEPENDENCY_SOURCE_MISSING");
    expect(await blockers([stage("consumer", "stage2.client", [{ name: "source1", from: "stage:later" }]), stage("later", "text.qwen.resolved")])).toContain("DEPENDENCY_ORDER_INVALID");
    expect(await blockers([stage("producer", "text.qwen.resolved"), stage("consumer", "stage2.client", [{ name: "source1", from: "stage:producer", port: "not-emitted" }])])).toContain("DEPENDENCY_PORT_MISSING");
  });

  it("blocks incompatible Brief schemas, unsupported external inputs, and required continue-on-error", async () => {
    expect(await blockers([stage("producer", "text.qwen.resolved"), stage("consumer", "text.qwen.resolved", [{ name: "brief", from: "stage:producer" }])])).toContain("DEPENDENCY_SCHEMA_INCOMPATIBLE");
    expect(await blockers([stage("consumer", "stage2.client", [{ name: "source1", from: "external:deleted-artifact" }])])).toContain("EXTERNAL_INPUT_UNKNOWN");
    expect(await blockers([stage("consumer", "stage2.client", [], { failurePolicy: "continue" })])).toContain("REQUIRED_STAGE_CANNOT_CONTINUE");
  });

  it("allows a gap-description artifact as an explicit Brief assembly source", async () => {
    const route = [
      stage("segment", "audio.segment"),
      stage("snapshot", "text_features.build"),
      stage("anchors", "text_features.describe_llm", [{ name: "snapshot", from: "stage:snapshot" }]),
      stage("gaps", "audio.describe_gaps.lfm3", [
        { name: "segmentPlan", from: "stage:segment" },
        { name: "anchors", from: "stage:anchors" },
      ]),
      stage("combine", "brief.combine_segment_texts", [
        { name: "segmentPlan", from: "stage:segment" },
        { name: "source1", from: "stage:gaps" },
        { name: "source2", from: "stage:anchors" },
      ]),
    ];
    const preview = await buildAutomationPreview({
      scenarioId: "preview-test",
      draftDefinition: scenario(route),
      inputs: {
        assetId: "asset-a",
        audioDurationSeconds: 60,
        audioRange: { assetId: "asset-a", startSeconds: 0, endSeconds: 60, durationSeconds: 60 },
        briefAssembly: { sources: { reverseQuery: false, interpretations: true, textFeatures: false, trackDraft: false, gapDescriptions: true }, executor: "freellmapi" },
      },
    });
    expect(preview.blockers.map((item) => item.code)).not.toContain("DEPENDENCY_SCHEMA_INCOMPATIBLE");
  });

  it("requires the typed segment-plan producer and rejects unsupported external segment plans", async () => {
    const invalidPlan = await blockers([stage("producer", "text.qwen.resolved"), stage("consumer", "stage2.client", [{ name: "segmentPlan", from: "stage:producer" }])]);
    expect(invalidPlan).toContain("DEPENDENCY_SCHEMA_INCOMPATIBLE");
    expect(await blockers([stage("consumer", "stage2.client", [{ name: "segmentPlan", from: "external:audio.segmentPlan" }])])).toContain("EXTERNAL_INPUT_UNKNOWN");
  });

  it("preserves the R branch and blocks missing or incompatible merge inputs", async () => {
    const brief = stage("brief", "brief.from_template", [], { settings: { requested: { templateBrief: "R" }, effective: { templateBrief: "R" }, origin: "scenario_default" } });
    const qwen = stage("qwen", "text.qwen.resolved", [{ name: "brief", from: "stage:brief", port: "result" }]);
    const gemma = stage("gemma", "text.gemma.awtd", [{ name: "brief", from: "stage:brief", port: "result" }]);
    const merge = stage("merge", "data.merge", [
      { name: "qwenBank", from: "stage:qwen", port: "result" },
      { name: "gemmaBank", from: "stage:gemma", port: "result" },
    ], { settings: { requested: { duplicates: "keep_first", conflicts: "keep_first" }, effective: { duplicates: "keep_first", conflicts: "keep_first" }, origin: "scenario_default" } });
    const valid = await blockers([brief, qwen, gemma, merge]);
    expect(valid).not.toContain("MERGE_INPUT_INVALID");

    const missing = await blockers([brief, qwen, gemma, { ...merge, inputBindings: merge.inputBindings.filter((binding) => binding.name !== "gemmaBank") }]);
    expect(missing).toContain("MERGE_INPUT_INVALID");
    const incompatible = await blockers([brief, qwen, gemma, { ...merge, inputBindings: merge.inputBindings.map((binding) => binding.name === "gemmaBank" ? { ...binding, from: "stage:qwen" } : binding) }]);
    expect(incompatible).toContain("MERGE_INPUT_INVALID");
  });

  it("previews edited R parameters and merge input order from the saved scenario contract", async () => {
    const definition = structuredClone(AUTOMATION_SCENARIOS.find((item) => item.id === "catalogue-bank-merge-r")!);
    const brief = definition.stages.find((item) => item.actionId === "brief.from_template")!;
    brief.settings.requested.templateBrief = "{{mood}} in {{space}}";
    brief.settings.effective.templateBrief = "{{mood}} in {{space}}";
    const qwen = definition.stages.find((item) => item.actionId === "text.qwen.resolved")!;
    qwen.settings.requested.topK = 7;
    qwen.settings.effective.topK = 7;
    const merge = definition.stages.find((item) => item.actionId === "data.merge")!;
    const orderBinding = merge.inputBindings.filter((binding) => binding.port === "order");
    const dataBindings = merge.inputBindings.filter((binding) => binding.port !== "order").reverse();
    merge.inputBindings = [...orderBinding, ...dataBindings];
    merge.settings.requested.conflicts = "keep_last";
    merge.settings.effective.conflicts = "keep_last";

    const preview = await buildAutomationPreview({
      scenarioId: definition.id,
      draftDefinition: definition,
      inputs: { workspaceSnapshot: { templateVariables: { mood: "calm", space: "wide" }, templateVariablesText: "mood=calm\nspace=wide", searchMode: "single" } },
    });
    expect(preview.plan.stages.find((item) => item.actionId === "brief.from_template")?.settings.effective.templateBrief).toBe("{{mood}} in {{space}}");
    expect(preview.plan.stages.find((item) => item.actionId === "text.qwen.resolved")?.settings.effective.topK).toBe(7);
    const plannedMerge = preview.plan.stages.find((item) => item.actionId === "data.merge")!;
    expect(plannedMerge.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name)).toEqual(["gemmaBank", "qwenBank"]);
    expect(plannedMerge.settings.effective.conflicts).toBe("keep_last");
    expect(preview.plan.externalInputs.workspaceSnapshot?.templateVariables).toEqual({ mood: "calm", space: "wide" });
    expect(preview.plan.externalInputs.workspaceSnapshot?.templateVariablesText).toBe("mood=calm\nspace=wide");
  });

  it("blocks a retrieval stage when a prior Brief exists but is not actually bound", async () => {
    const definition = structuredClone(AUTOMATION_SCENARIOS.find((item) => item.id === "catalogue-bank-merge-r")!);
    const qwen = definition.stages.find((item) => item.actionId === "text.qwen.resolved")!;
    qwen.inputBindings = qwen.inputBindings.filter((binding) => binding.name !== "brief");

    const preview = await buildAutomationPreview({
      scenarioId: definition.id,
      draftDefinition: definition,
      inputs: { workspaceSnapshot: { templateVariables: { mood: "calm", space: "wide" }, searchMode: "single" } },
    });

    expect(preview.blockers).toContainEqual(expect.objectContaining({
      code: "BRIEF_DATA_BINDING_REQUIRED",
      stageId: qwen.stageId,
    }));
    expect(preview.route.find((stage) => stage.stageId === qwen.stageId)?.readiness).toBe("blocked");
    expect(preview.route.find((stage) => stage.stageId === qwen.stageId)?.readinessReason).toContain("Brief");
  });

  it("previews the ordered J text transform and blocks invalid bindings or policies", async () => {
    const j = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-text-limit-assemble-j")!;
    const preview = await buildAutomationPreview({
      scenarioId: j.id,
      draftDefinition: structuredClone(j),
      inputs: { crystalId: "test-crystal", brief: "Crystal brief", workspaceSnapshot: { templateVariables: { mood: "nocturnal", space: "wide" } } },
    });
    expect(preview.plan.stages.map((item) => item.actionId)).toEqual(["brief.from_template", "brief.from_crystal", "text.limit", "text.assemble"]);
    expect(preview.plan.stages[3]!.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.from)).toEqual([
      `stage:${preview.plan.stages[2]!.stageId}`, `stage:${preview.plan.stages[1]!.stageId}`,
    ]);
    expect(preview.blockers.map((item) => item.code)).not.toContain("TEXT_OPERATION_INPUT_INVALID");

    const invalid = structuredClone(j);
    invalid.stages[2]!.inputBindings = [];
    invalid.stages[3]!.settings.effective.missingPolicy = "discard";
    const invalidPreview = await buildAutomationPreview({ scenarioId: j.id, draftDefinition: invalid, inputs: { crystalId: "test-crystal", brief: "Crystal brief", workspaceSnapshot: { templateVariables: { mood: "nocturnal", space: "wide" } } } });
    expect(invalidPreview.blockers.map((item) => item.code)).toContain("TEXT_OPERATION_INPUT_INVALID");
  });

  it("previews H assembly as a typed Brief input to Qwen", async () => {
    const h = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-two-briefs-assemble-qwen-h")!;
    const preview = await buildAutomationPreview({ scenarioId: h.id, draftDefinition: structuredClone(h), inputs: { crystalId: "test-crystal", brief: "Crystal phrase", workspaceSnapshot: { templateVariables: { mood: "soft", space: "close" } } } });
    expect(preview.plan.stages.map((item) => item.actionId)).toEqual(["brief.from_template", "brief.from_crystal", "text.assemble", "text.qwen.resolved"]);
    expect(preview.plan.stages[3]!.inputBindings.find((binding) => binding.name === "brief")?.from).toBe(`stage:${preview.plan.stages[2]!.stageId}`);
    expect(preview.blockers.map((item) => item.code)).not.toContain("TEXT_OPERATION_INPUT_INVALID");
    expect(preview.blockers.map((item) => item.code)).not.toContain("DEPENDENCY_SCHEMA_INCOMPATIBLE");
  });

  it("previews AM2 H merge as text consumed by Qwen without conflating it with assemble", async () => {
    const h = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-two-briefs-merge-qwen-h")!;
    const preview = await buildAutomationPreview({ scenarioId: h.id, draftDefinition: structuredClone(h), inputs: { crystalId: "test-crystal", brief: "Crystal phrase", workspaceSnapshot: { templateVariables: { mood: "soft", space: "close" } } } });
    expect(preview.plan.stages.map((item) => item.actionId)).toEqual(["brief.from_template", "brief.from_crystal", "data.merge", "text.qwen.resolved"]);
    expect(preview.plan.stages[2]!.outputDefinitions).toContainEqual({ port: "result", kind: "text", required: true });
    expect(preview.plan.stages[3]!.inputBindings.find((binding) => binding.name === "brief")?.from).toBe(`stage:${preview.plan.stages[2]!.stageId}`);
    expect(preview.blockers.map((item) => item.code)).not.toContain("MERGE_INPUT_INVALID");
    expect(preview.blockers.map((item) => item.code)).not.toContain("DEPENDENCY_SCHEMA_INCOMPATIBLE");
  });

  it("previews E through the existing Qwen executor before the separate Stage re-apply", async () => {
    const e = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-qwen-reapply-e")!;
    const preview = await buildAutomationPreview({ scenarioId: e.id, draftDefinition: structuredClone(e), inputs: { workspaceSnapshot: { templateVariables: { mood: "soft", space: "close" } } } });
    expect(preview.plan.stages.map((item) => item.actionId)).toEqual(["brief.from_template", "text.qwen.resolved"]);
    expect(preview.blockers.map((item) => item.code)).not.toContain("BRIEF_DATA_BINDING_REQUIRED");
    expect(preview.blockers.map((item) => item.code)).not.toContain("TEMPLATE_VARIABLES_REQUIRED");
  });

  it("previews a split fan-out only with valid channel rules and typed dynamic outputs", async () => {
    const qwen = stage("split-qwen", "text.qwen.resolved");
    const channels = [
      { name: "even", rule: { type: "by_index_modulo", modulus: 2, remainder: 0 } },
      { name: "selected", rule: { type: "index_range", from: 0, to: 2 } },
    ];
    const split = stage("split", "data.split", [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }], {
      outputDefinitions: [
        { port: "even", kind: "parameter-bank", required: false },
        { port: "selected", kind: "parameter-bank", required: false },
        { port: "unmatched", kind: "parameter-bank", required: false },
      ],
      settings: { requested: { channels }, effective: { channels }, origin: "manual" },
    });
    const preview = await buildAutomationPreview({ scenarioId: "preview-test", draftDefinition: scenario([qwen, split]), inputs: { brief: "test query" } });
    expect(preview.blockers.map((item) => item.code)).not.toContain("DATA_SPLIT_INPUT_INVALID");
    expect(preview.plan.stages[1]?.outputDefinitions.map((output) => output.port)).toEqual(["even", "selected", "unmatched"]);

    const invalid = structuredClone(split);
    invalid.settings.effective.channels = [{ name: "unmatched", rule: { type: "by_index_modulo", modulus: 0, remainder: 0 } }];
    const invalidPreview = await buildAutomationPreview({ scenarioId: "preview-test", draftDefinition: scenario([qwen, invalid]), inputs: { brief: "test query" } });
    expect(invalidPreview.blockers.map((item) => item.code)).toContain("DATA_SPLIT_INPUT_INVALID");
  });

  it("previews data.select parameter mode and blocks missing names or a mismatched output", async () => {
    const qwen = stage("select-source", "text.qwen.resolved", [], { outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }] });
    const select = stage("select-parameters", "data.select", [{ name: "input", from: "stage:select-source", port: "result" }], {
      outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }],
      settings: { requested: { mode: "parameters_by_name", fields: ["tempo"] }, effective: { mode: "parameters_by_name", fields: ["tempo"] }, origin: "manual" },
    });
    const valid = await buildAutomationPreview({ scenarioId: "preview-test", draftDefinition: scenario([qwen, select]), inputs: { brief: "test", workspaceSnapshot: { searchMode: "single" } } });
    expect(valid.blockers.map((item) => item.code)).not.toContain("DATA_SELECT_INPUT_INVALID");

    const invalid = structuredClone(select);
    invalid.settings.requested.fields = [];
    invalid.settings.effective.fields = [];
    invalid.outputDefinitions = [{ port: "result", kind: "record-set", required: true }];
    const blocked = await buildAutomationPreview({ scenarioId: "preview-test", draftDefinition: scenario([qwen, invalid]), inputs: { brief: "test", workspaceSnapshot: { searchMode: "single" } } });
    expect(blocked.blockers.map((item) => item.code)).toContain("DATA_SELECT_INPUT_INVALID");
  });

  it("blocks audio stages without a range and rejects an unbound or out-of-duration range", async () => {
    expect(await blockers([stage("audio", "audio.clap.resolved")])).toContain("AUDIO_RANGE_REQUIRED");
    const { buildAutomationPreview } = await import("./planning");
    const draftDefinition = scenario([stage("audio", "audio.clap.resolved")]);
    await expect(buildAutomationPreview({ scenarioId: draftDefinition.id, draftDefinition, inputs: { assetId: "asset-a", audioDurationSeconds: 8, audioRange: { assetId: "asset-b", startSeconds: 0, endSeconds: 3, durationSeconds: 3 } } })).rejects.toThrow("not bound to the current audio asset");
    await expect(buildAutomationPreview({ scenarioId: draftDefinition.id, draftDefinition, inputs: { assetId: "asset-a", audioDurationSeconds: 8, audioRange: { assetId: "asset-a", startSeconds: 0, endSeconds: 9, durationSeconds: 9 } } })).rejects.toThrow("exceeds the confirmed asset duration");
  });

  it("requires explicit compatible Client and Server Stage-2 inputs", async () => {
    expect(await blockers([stage("client", "stage2.client")])).toContain("CLIENT_STAGE2_INPUT_REQUIRED");
    expect(await blockers([stage("seed", "audio.clap.resolved"), stage("server", "stage2.server", [{ name: "stage1", from: "stage:seed" }])])).toContain("SERVER_STAGE2_SEED_REQUIRED");
    expect(await blockers([stage("seed", "text.qwen.resolved"), stage("server", "stage2.server", [{ name: "stage1", from: "stage:seed" }])])).not.toContain("SERVER_STAGE2_SEED_REQUIRED");
  });

  it("blocks ambiguous duplicate Brief source producers and requires the selected saved draft", async () => {
    const route = [
      stage("reverse-a", "text_features.reverse_query"),
      stage("reverse-b", "text_features.reverse_query"),
      stage("combine", "brief.combine_segment_texts", [
        { name: "source1", from: "stage:reverse-a" }, { name: "source2", from: "stage:reverse-b" },
      ]),
    ];
    const ambiguous = await blockers(route, { briefAssembly: { sources: { reverseQuery: true, interpretations: false, textFeatures: false, trackDraft: false }, executor: "freellmapi" } });
    expect(ambiguous).toContain("BRIEF_SOURCE_BINDING_AMBIGUOUS");
    const missingDraft = await blockers([stage("combine", "brief.combine_segment_texts")], { briefAssembly: { sources: { reverseQuery: false, interpretations: false, textFeatures: false, trackDraft: true }, executor: "freellmapi" } });
    expect(missingDraft).toContain("TRACK_DRAFT_SOURCE_MISSING");
    const withSavedDraft = await blockers([stage("combine", "brief.combine_segment_texts")], { briefAssembly: { sources: { reverseQuery: false, interpretations: false, textFeatures: false, trackDraft: true }, executor: "freellmapi", trackDraft: { sessionId: "saved-session", language: "en", text: "Saved description", snapshotUpdatedAt: "2026-11-09T00:00:00.000Z" } } });
    expect(withSavedDraft).not.toContain("BRIEF_SOURCE_REQUIRED");
    expect(withSavedDraft).not.toContain("TRACK_DRAFT_SOURCE_MISSING");
  });

  it("requires audio longer than two minutes and preserves the preset beat-window contract", async () => {
    const audioScenario = AUTOMATION_SCENARIOS.find((item) => item.id === "audio-to-brief")!;
    const previewFor = (durationSeconds: number, overrides?: Record<string, unknown>) => buildAutomationPreview({
      scenarioId: audioScenario.id,
      inputs: { assetId: "approved-import-asset", audioDurationSeconds: durationSeconds, audioRange: { assetId: "approved-import-asset", startSeconds: 0, endSeconds: durationSeconds, durationSeconds } },
      overrides,
    });
    const tooShort = await previewFor(120);
    expect(tooShort.blockers.map((item) => item.code)).toContain("AUDIO_TO_BRIEF_REQUIRES_LONG_AUDIO");
    const readyLength = await previewFor(121, { segment: { boundaryMode: "uniform", maximumCount: 2, intervalSeconds: 60 } });
    expect(readyLength.blockers.map((item) => item.code)).not.toContain("AUDIO_TO_BRIEF_REQUIRES_LONG_AUDIO");
    expect(readyLength.estimates.segmentCount).toBe(9);
    expect(readyLength.plan.stages.find((item) => item.actionId === "audio.segment")?.settings.effective).toMatchObject({ boundaryMode: "beat", maximumCount: 16, requireBeatAlignment: true });
  });

  it("requires matching Gemma AWTD A/B artifacts and a built text-feature snapshot", async () => {
    const awtd = stage("awtd", "text.gemma.awtd");
    expect(await blockers([stage("resolved", "text.gemma.resolved")])).toContain("GEMMA_IDENTITY_REQUIRED");
    expect(await blockers([awtd, stage("resolved", "text.gemma.resolved", [{ name: "identityBank", from: "stage:awtd" }])], { workspaceSnapshot: { searchMode: "transition" } })).toContain("GEMMA_TRANSITION_SECOND_IDENTITY_REQUIRED");
    expect(await blockers([stage("build", "text_features.build")])).toContain("TEXT_FEATURE_SOURCE_REQUIRED");
    expect(await blockers([stage("compare", "text_features.compare_rankings")])).toContain("TEXT_FEATURE_SNAPSHOT_REQUIRED");
  });

  it("rejects deleted artifact references and non-bank artifacts before preview", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.automationArtifact.findMany).mockResolvedValueOnce([{ id: "still-there", kind: "parameter-bank" }] as never);
    const missing = await blockers([stage("build", "text_features.build")], { selectedArtifactIds: ["still-there", "deleted"] });
    expect(missing).toContain("ARTIFACT_REFERENCE_MISSING");

    vi.mocked(db.automationArtifact.findMany).mockResolvedValueOnce([{ id: "description", kind: "description" }] as never);
    expect(await blockers([stage("build", "text_features.build")], { selectedArtifactIds: ["description"] })).toContain("ARTIFACT_SCHEMA_INCOMPATIBLE");
  });

  it("rejects cycles and missing scenario references before persistence", () => {
    const cycle = scenario([stage("a", "text.qwen.resolved", [{ name: "brief", from: "stage:b" }]), stage("b", "text.qwen.resolved", [{ name: "brief", from: "stage:a" }])]);
    expect(validateScenarioDefinition(cycle)).toContain("Scenario dependencies contain a cycle.");
    expect(validateScenarioDefinition(scenario([stage("a", "text.qwen.resolved", [{ name: "brief", from: "stage:missing" }])]))).toContain("Stage a references missing stage missing.");
  });
});
