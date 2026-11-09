import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationScenarioDefinition, AutomationStageDefinition } from "./contracts";

vi.mock("@/lib/rag-v3/managed-rebuild", () => ({ getArtifactStatuses: vi.fn(async () => ({ artifacts: [] })) }));
vi.mock("@/lib/llm/factory", () => ({ loadLLMSettings: vi.fn(async () => ({ capabilityRegistry: {} })) }));
vi.mock("@/lib/capability-registry", () => ({ capabilityIsEnabled: vi.fn(() => true) }));
vi.mock("@/lib/rag-v3/composite-index", () => ({ getConfiguredTextIndexModel: vi.fn(async () => "qwen3-embedding:0.6b") }));
vi.mock("@/lib/db", () => ({ db: { automationAttempt: { findMany: vi.fn(async () => []) }, automationArtifact: { findMany: vi.fn(async () => []) } } }));

import { buildAutomationPreview, validateScenarioDefinition } from "./planning";
import { AUTOMATION_SCENARIOS } from "./catalog";

function stage(stageId: string, actionId: AutomationStageDefinition["actionId"], bindings: AutomationStageDefinition["inputBindings"] = [], overrides: Partial<AutomationStageDefinition> = {}): AutomationStageDefinition {
  return {
    stageId, actionId, title: actionId, role: "test", inputBindings: bindings,
    outputDefinitions: [{ port: "result", kind: actionId.startsWith("text.") || actionId.startsWith("audio.") || actionId.startsWith("spec.") || actionId.startsWith("stage2.") ? "parameter-bank" : "other", required: true }],
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
