import { describe, expect, it } from "vitest";
import { ACTION_CAPABILITY, ACTION_SUPPORTED, AUTOMATION_SCENARIOS } from "./catalog";
import { DEFAULT_CAPABILITY_REGISTRY } from "@/lib/capability-registry";

const BANK_ACTIONS = new Set([
  "text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved",
  "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server",
]);

describe("Automation route data bindings", () => {
  it("maps audio specialists to the capability IDs checked by their server route", () => {
    for (const actionId of ["audio.analyze_helm", "audio.assess_vocal_timbre", "audio.detect_indic_language"] as const) {
      const capabilityId = ACTION_CAPABILITY[actionId];
      expect(capabilityId).toBeDefined();
      expect(DEFAULT_CAPABILITY_REGISTRY.capabilities).toHaveProperty(capabilityId!);
    }
    expect(ACTION_CAPABILITY["audio.analyze_helm"]).toBe("side-meta.helm");
    expect(ACTION_CAPABILITY["audio.assess_vocal_timbre"]).toBe("side-meta.voice");
    expect(ACTION_CAPABILITY["audio.detect_indic_language"]).toBe("side-meta.indic");
  });

  it("binds all stage data inputs to an earlier producer and keeps order-only links separate", () => {
    for (const scenario of AUTOMATION_SCENARIOS) {
      const positions = new Map(scenario.stages.map((stage, index) => [stage.stageId, index]));
      for (const [index, stage] of scenario.stages.entries()) {
        for (const binding of stage.inputBindings) {
          if (!binding.from.startsWith("stage:")) continue;
          const sourceIndex = positions.get(binding.from.slice(6));
          expect(sourceIndex, `${scenario.id}/${stage.actionId}:${binding.name} source exists`).toBeDefined();
          expect(sourceIndex!, `${scenario.id}/${stage.actionId}:${binding.name} source precedes consumer`).toBeLessThan(index);
          if (binding.port === "order") continue;
          const source = scenario.stages[sourceIndex!];
          expect(source.outputDefinitions.some((output) => output.port === (binding.port ?? "result")), `${scenario.id}/${binding.name} output port exists`).toBe(true);
          if (binding.name === "brief") {
            expect(["brief.from_crystal", "brief.from_template", "text.assemble", "audio.describe.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts", "data.merge"]).toContain(source.actionId);
            if (source.actionId === "data.merge") {
              expect(scenario.id).toBe("am2-two-briefs-merge-qwen-h");
              expect(source.outputDefinitions.find((output) => output.port === (binding.port ?? "result"))?.kind).toBe("text");
            }
          }
          if (binding.name === "snapshot") expect(source.actionId).toBe("text_features.build");
          if (binding.name === "identityBank") expect(source.actionId).toBe(stage.actionId === "text.gemma.resolved" ? "text.gemma.awtd" : "audio.gemma.awtd");
          if (binding.name === "identityBankB") expect(source.actionId).toBe("text.gemma.awtd");
          if (binding.name === "qwenAnchors") {
            expect(["text.gemma.resolved", "audio.gemma.resolved"]).toContain(stage.actionId);
            expect(source.actionId).toBe("text.qwen.resolved");
          }
          if (binding.name === "stage1") expect(["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved"]).toContain(source.actionId);
          if (binding.name.startsWith("source") && stage.actionId === "brief.combine_segment_texts") expect(["text_features.reverse_query", "text_features.describe_llm", "text_features.build", "audio.describe_gaps.lfm3"]).toContain(source.actionId);
          else if (binding.name === "sources" && stage.actionId === "data.merge" && scenario.id === "am2-two-briefs-merge-qwen-h") expect(["brief.from_template", "brief.from_crystal"]).toContain(source.actionId);
          else if (binding.name === "source" && stage.actionId === "result.bundle") expect(BANK_ACTIONS.has(source.actionId)).toBe(true);
          else if (binding.name.startsWith("source")) expect(["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"]).toContain(source.actionId);
          if (binding.name.startsWith("parameterBank")) expect(BANK_ACTIONS.has(source.actionId)).toBe(true);
        }
      }
    }
  });

  it("exposes no/client/server/both Stage-2 routes for Brief and Audio + Brief, plus audio-only bank choices", () => {
    for (const prefix of ["brief-to-parameters", "audio-and-brief"]) {
      const modes = ["none", "client", "server", "both"];
      for (const mode of modes) {
        const id = mode === "none" ? prefix : `${prefix}-${mode}-stage2`;
        const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === id);
        expect(scenario, id).toBeDefined();
        if (mode === "none") continue;
        const actions = scenario!.stages.map((stage) => stage.actionId);
        if (mode === "client" || mode === "both") expect(actions).toContain("stage2.client");
        if (mode === "server" || mode === "both") expect(actions).toContain("stage2.server");
      }
    }
    expect(AUTOMATION_SCENARIOS.some((item) => item.id === "audio-to-clap")).toBe(true);
    expect(AUTOMATION_SCENARIOS.some((item) => item.id === "audio-to-siglip")).toBe(true);
    expect(AUTOMATION_SCENARIOS.some((item) => item.id === "brief-to-gemma-awtd")).toBe(true);
    expect(AUTOMATION_SCENARIOS.some((item) => item.id === "brief-to-gemma-values")).toBe(true);
    expect(AUTOMATION_SCENARIOS.some((item) => item.id === "audio-to-gemma-awtd")).toBe(true);
  });

  it("feeds the reverse-query result as the subsequent search Brief", () => {
    const route = AUTOMATION_SCENARIOS.find((item) => item.id === "audio-reverse-query")!;
    const reverse = route.stages.find((stage) => stage.actionId === "text_features.reverse_query")!;
    const qwen = route.stages.find((stage) => stage.actionId === "text.qwen.resolved")!;
    expect(reverse.inputBindings.some((binding) => binding.name === "snapshot" && binding.from === `stage:${route.stages.find((stage) => stage.actionId === "text_features.build")!.stageId}`)).toBe(true);
    expect(qwen.inputBindings.some((binding) => binding.name === "brief" && binding.from === `stage:${reverse.stageId}`)).toBe(true);
  });

  it("defines the complete audio-only Brief-to-Qwen route with locked beat windows and separate model stages", () => {
    const route = AUTOMATION_SCENARIOS.find((item) => item.id === "audio-to-brief")!;
    expect(route.title).toBe("Сборка Brief из аудио");
    expect(route.preparationPolicies.segmentPlan).toMatchObject({ boundaryMode: "beat", countMode: "at_most", maximumCount: 16, locked: true });
    expect(route.stages.map((stage) => stage.actionId)).toEqual([
      "audio.segment", "audio.analyze", "audio.gemma.awtd", "audio.clap.resolved", "spec.siglip.resolved",
      "text_features.build", "text_features.reverse_query", "text_features.describe_llm", "brief.combine_segment_texts",
      "text.qwen.resolved", "stage2.server",
    ]);
    for (const [actionId, topK] of [["audio.gemma.awtd", 10], ["audio.clap.resolved", 6], ["spec.siglip.resolved", 4], ["text.qwen.resolved", 40]] as const) {
      const stage = route.stages.find((item) => item.actionId === actionId)!;
      expect(stage.settings.effective.topK).toBe(topK);
    }
    const combine = route.stages.find((stage) => stage.actionId === "brief.combine_segment_texts")!;
    expect(combine.inputBindings.map((binding) => binding.name)).toEqual(expect.arrayContaining(["segmentPlan", "source1", "source2"]));
    const qwen = route.stages.find((stage) => stage.actionId === "text.qwen.resolved")!;
    expect(qwen.inputBindings.some((binding) => binding.name === "brief" && binding.from === `stage:${combine.stageId}`)).toBe(true);
    const stage2 = route.stages.find((stage) => stage.actionId === "stage2.server")!;
    expect(stage2.inputBindings.some((binding) => binding.name === "stage1" && binding.from === `stage:${qwen.stageId}`)).toBe(true);
  });

  it("defines B as a six-window fan-out with explicit CLAP, SigLIP, and sampled LFM3 inputs", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-audio-fanout-b")!;
    expect(ACTION_SUPPORTED.has("audio.describe_segments.lfm3")).toBe(true);
    expect(scenario.stages.map((stage) => stage.actionId)).toEqual([
      "audio.segment", "audio.clap.resolved", "spec.siglip.resolved", "audio.describe_segments.lfm3",
    ]);
    expect(scenario.stages[0]!.settings.effective).toMatchObject({
      boundaryMode: "uniform", countMode: "exact", requestedCount: 6, maximumCount: 6,
    });
    for (const stage of scenario.stages.slice(1)) {
      expect(stage.inputBindings).toEqual([{ name: "segmentPlan", from: `stage:${scenario.stages[0]!.stageId}`, port: "result" }]);
      expect(stage.inputBindings.some((binding) => binding.port === "order")).toBe(false);
    }
    expect(scenario.stages[1]!.settings.effective).toMatchObject({ topK: 8, perSegmentResults: true });
    expect(scenario.stages[2]!.settings.effective).toMatchObject({ topK: 8, perSegmentResults: true });
    expect(scenario.stages[3]!.settings.effective.sampleLimit).toBe(3);
  });

  it("maps G to five ordered windows with independent sampled LFM3 and CLAP consumers, without production delay switches", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-audio-late-response-g")!;
    const [segment, description, clap] = scenario.stages;
    expect(scenario.stages.map((stage) => stage.actionId)).toEqual([
      "audio.segment", "audio.describe_segments.lfm3", "audio.clap.resolved",
    ]);
    expect(segment!.settings.effective).toMatchObject({ boundaryMode: "uniform", countMode: "exact", requestedCount: 5, maximumCount: 5 });
    expect(description!.inputBindings).toEqual([{ name: "segmentPlan", from: `stage:${segment!.stageId}`, port: "result" }]);
    expect(description!.settings.effective.sampleLimit).toBe(5);
    expect(clap!.inputBindings).toEqual([{ name: "segmentPlan", from: `stage:${segment!.stageId}`, port: "result" }]);
    expect(clap!.settings.effective).toMatchObject({ topK: 6, perSegmentResults: true });
    expect(JSON.stringify(scenario)).not.toMatch(/testDelayMs|testFailure/u);
    expect(scenario.requiredResults).toEqual(["segment-plan", "description", "parameter-bank"]);
  });

  it("defines C as a production-safe checkpointed CLAP route without test failure switches", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-audio-resume-c")!;
    expect(scenario.stages.map((stage) => stage.actionId)).toEqual(["audio.segment", "audio.clap.resolved"]);
    expect(scenario.stages[0]!.settings.effective).toMatchObject({ boundaryMode: "uniform", countMode: "exact", requestedCount: 4, maximumCount: 4 });
    expect(scenario.stages[1]!.inputBindings).toContainEqual({ name: "segmentPlan", from: `stage:${scenario.stages[0]!.stageId}`, port: "result" });
    expect(scenario.stages[1]!.settings.effective).toMatchObject({ topK: 6, perSegmentResults: true, checkpointSegments: true });
    expect(JSON.stringify(scenario)).not.toMatch(/testFailure|testDelayMs/u);
  });

  it("defines center gap fill after per-node descriptions and before Brief without Stage-2", () => {
    const route = AUTOMATION_SCENARIOS.find((item) => item.id === "audio-to-brief-gap-fill")!;
    const actions = route.stages.map((stage) => stage.actionId);
    expect(actions).toContain("audio.describe_gaps.lfm3");
    expect(actions.at(-1)).toBe("brief.combine_segment_texts");
    expect(actions).not.toContain("stage2.server");
    const gap = route.stages.find((stage) => stage.actionId === "audio.describe_gaps.lfm3")!;
    expect(gap.inputBindings.map((binding) => [binding.name, binding.from])).toEqual(expect.arrayContaining([
      ["segmentPlan", expect.stringContaining(":audio-segment")],
      ["anchors", expect.stringContaining(":text_features-describe_llm")],
    ]));
    expect(gap.settings.effective.gapClipSeconds).toBe(8);
  });
});

describe("AM2 A/D scenario mappings", () => {
  it("maps A to a templated Brief followed by Qwen resolved retrieval", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-template-qwen-a")!;
    expect(scenario.stages.map((stage) => stage.actionId)).toEqual(["brief.from_template", "text.qwen.resolved"]);
    expect(scenario.stages[0]!.settings.effective.templateBrief).toContain("{{mood}}");
    expect(scenario.stages[0]!.settings.effective.templateBrief).toContain("{{space}}");
    expect(scenario.stages[1]!.settings.effective.topK).toBe(10);
    expect(scenario.stages[1]!.inputBindings).toContainEqual({ name: "brief", from: `stage:${scenario.stages[0]!.stageId}`, port: "result" });
  });

  it("maps D as distinct Gemma AWTD and resolved passes with an explicit artifact binding", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-gemma-two-pass-d")!;
    expect(scenario.stages.map((stage) => stage.actionId)).toEqual(["brief.from_template", "text.gemma.awtd", "text.qwen.resolved", "text.gemma.resolved"]);
    expect(scenario.stages[3]!.inputBindings).toContainEqual({ name: "identityBank", from: `stage:${scenario.stages[1]!.stageId}`, port: "result" });
    expect(scenario.stages[3]!.inputBindings).toContainEqual({ name: "qwenAnchors", from: `stage:${scenario.stages[2]!.stageId}`, port: "result" });
    expect(scenario.stages[3]!.inputBindings).toContainEqual({ name: "brief", from: `stage:${scenario.stages[0]!.stageId}`, port: "result" });
    expect(scenario.stages[1]!.settings.effective.topK).toBe(8);
    expect(scenario.stages[2]!.settings.effective.topK).toBe(10);
    expect(scenario.stages[3]!.settings.effective.topK).toBe(8);
  });

  it("maps F's Stage-2 output separately and bundles the selected Gemma and Stage-2 artifact references", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-persistent-bundle-f")!;
    expect(scenario.stages.map((stage) => stage.actionId)).toEqual([
      "brief.from_template", "text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "stage2.server", "result.bundle",
    ]);
    expect(scenario.stages[4]!.inputBindings).toContainEqual({ name: "stage1", from: `stage:${scenario.stages[1]!.stageId}`, port: "result" });
    expect(scenario.stages[5]!.inputBindings.filter((binding) => binding.name === "source").map((binding) => binding.from)).toEqual([
      `stage:${scenario.stages[3]!.stageId}`, `stage:${scenario.stages[4]!.stageId}`,
    ]);
  });
});
