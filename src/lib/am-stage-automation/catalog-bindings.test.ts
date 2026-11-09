import { describe, expect, it } from "vitest";
import { AUTOMATION_SCENARIOS } from "./catalog";

const BANK_ACTIONS = new Set([
  "text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved",
  "audio.gemma.awtd", "audio.gemma.resolved", "stage2.client", "stage2.server",
]);

describe("Automation route data bindings", () => {
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
          if (binding.name === "brief") expect(["brief.from_crystal", "brief.from_template", "audio.describe.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"]).toContain(source.actionId);
          if (binding.name === "snapshot") expect(source.actionId).toBe("text_features.build");
          if (binding.name === "identityBank") expect(source.actionId).toBe(stage.actionId === "text.gemma.resolved" ? "text.gemma.awtd" : "audio.gemma.awtd");
          if (binding.name === "identityBankB") expect(source.actionId).toBe("text.gemma.awtd");
          if (binding.name === "stage1") expect(["text.qwen.resolved", "text.gemma.resolved"]).toContain(source.actionId);
          if (binding.name.startsWith("source") && stage.actionId === "brief.combine_segment_texts") expect(["text_features.reverse_query", "text_features.describe_llm", "text_features.build", "audio.describe_gaps.lfm3"]).toContain(source.actionId);
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
