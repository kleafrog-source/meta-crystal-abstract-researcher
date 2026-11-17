import { describe, expect, it } from "vitest";
import { AUTOMATION_SCENARIOS } from "./catalog";
import { validateUserScenarioDefinition } from "./scenario-editor";
import { buildAutomationGraph, portsForStage, validateTypedAutomationGraph } from "./typed-graph";
import { smoothAutomationFrames } from "./client-stage2";

const P = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-audio-layers-p")!;

describe("P audio layers and historical Stage target", () => {
  it("keeps eight-window retrieval banks ordered into a separate Stage-2 consensus artifact", () => {
    expect(P.stages.map((stage) => stage.actionId)).toEqual([
      "audio.segment", "audio.clap.resolved", "spec.siglip.resolved", "stage2.client",
    ]);
    expect(P.stages[0]!.settings.effective).toMatchObject({ boundaryMode: "uniform", countMode: "exact", requestedCount: 8, maximumCount: 8 });
    for (const stage of P.stages.slice(1, 3)) {
      expect(stage.settings.effective).toMatchObject({ topK: 10, perSegmentResults: true });
      expect(stage.inputBindings.filter((binding) => binding.port !== "order")).toEqual([
        { name: "segmentPlan", from: `stage:${P.stages[0]!.stageId}`, port: "result" },
      ]);
    }
    const consensus = P.stages[3]!;
    expect(consensus.inputBindings.filter((binding) => binding.port !== "order")).toEqual([
      { name: "source1", from: `stage:${P.stages[1]!.stageId}`, port: "result" },
      { name: "source2", from: `stage:${P.stages[2]!.stageId}`, port: "result" },
    ]);
    expect(portsForStage(consensus)?.inputs.map((port) => port.id)).toEqual(["source1", "source2"]);
    expect(buildAutomationGraph(P.stages).edges.filter((edge) => edge.to === consensus.stageId && edge.edgeKind === "data").map((edge) => [edge.toPort, edge.kind])).toEqual([
      ["source1", "parameter-bank"], ["source2", "parameter-bank"],
    ]);
    expect(validateTypedAutomationGraph(P.stages)).toEqual([]);
    expect(validateUserScenarioDefinition(P)).toEqual([]);
    expect(P.preparationPolicies.stageTarget).toBe("historical-read-only");
    expect(P.description).toContain("does not merge these banks into Stage parameters");
  });

  it("rejects removal or reordering to an incompatible source for client Stage-2", () => {
    const missing = structuredClone(P);
    missing.stages[3]!.inputBindings = missing.stages[3]!.inputBindings.filter((binding) => binding.port === "order");
    expect(validateUserScenarioDefinition(missing).join(" ")).toContain("at least one explicit client Stage-2 source bank");
    expect(validateTypedAutomationGraph(missing.stages)).toEqual([]);

    const incompatible = structuredClone(P);
    incompatible.stages[3]!.inputBindings[0]!.from = `stage:${incompatible.stages[0]!.stageId}`;
    expect(validateUserScenarioDefinition(incompatible).join(" ")).toContain("supported Stage-2 parameter-bank producer");
    expect(validateTypedAutomationGraph(incompatible.stages).join(" ")).toContain("incompatible types");
  });

  it("feeds ordered segmented CLAP and SigLIP banks into client Stage-2", () => {
    const windows = Array.from({ length: 8 }, (_, index) => ({ id: `segment-${index + 1}`, startSeconds: index * 3, endSeconds: (index + 1) * 3 }));
    const parameters = () => [{ technical_name: "tempo_bpm", title: "Tempo", category: "Rhythm", ui_element: "Range" as const, min_value: 40, max_value: 220, current_value: 120, suggested_value: 120, similarity: 0.9 }];
    const result = smoothAutomationFrames([
      { actionId: "audio.clap.resolved", segmentRefs: windows, data: { schema: "am_stage_segment_bank_v1", segments: windows.map((window) => ({ ...window, parameters: parameters() })) } },
      { actionId: "spec.siglip.resolved", segmentRefs: windows, data: { schema: "am_stage_segment_bank_v1", segments: windows.map((window) => ({ ...window, parameters: parameters() })) } },
    ]);
    expect(result).toHaveLength(16);
    expect(result.map((row) => [row.automation_segment, row.consensus_frame, row.technical_name, row.current_value])).toEqual(
      windows.flatMap((window) => ["audio.clap.resolved", "spec.siglip.resolved"].map((actionId) => [window.id, actionId, "tempo_bpm", 120])),
    );
  });

  it("rejects malformed segmented banks instead of emitting an empty consensus", () => {
    expect(() => smoothAutomationFrames([
      {
        actionId: "audio.clap.resolved",
        segmentRefs: [],
        data: { schema: "am_stage_segment_bank_v1", segments: [{ id: 42, parameters: [] }] },
      },
    ])).toThrow(/explicit text, CLAP, or SigLIP result artifacts/u);
  });
});
