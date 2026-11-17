import { describe, expect, it } from "vitest";
import { AUTOMATION_SCENARIOS } from "./catalog";
import { buildAutomationGraph, compatibleOutputPortForTarget, inputBindingNamesForConnection, portsForStage, topologicalStageOrder, validateTypedAutomationGraph } from "./typed-graph";
import { validateUserScenarioDefinition } from "./scenario-editor";

const R = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "catalogue-bank-merge-r")!;
const I = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "catalogue-bank-set-ops-i")!;
const B = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-audio-fanout-b")!;
const D = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-gemma-two-pass-d")!;
const F = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-persistent-bundle-f")!;
const S = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-catalogue-consensus-s")!;
const O = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-vocal-matrix-o")!;
const T = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-vocal-matrix-t")!;
const Q = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-flowmusic-export-q")!;
const AUDIO_PROFILE = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "audio-analysis-profile")!;

describe("typed Automation graph", () => {
  it("validates every current built-in scenario against the action port graph contracts", () => {
    const incompatibleScenarios = AUTOMATION_SCENARIOS.flatMap((scenario) => {
      const issues = validateTypedAutomationGraph(scenario.stages);
      return issues.length ? [{ scenarioId: scenario.id, issues }] : [];
    });
    expect(incompatibleScenarios).toEqual([]);
  });

  it("requires voice presentation to consume an explicit Helm analysis result", () => {
    const helm = AUDIO_PROFILE.stages.find((stage) => stage.actionId === "audio.analyze_helm")!;
    const voice = AUDIO_PROFILE.stages.find((stage) => stage.actionId === "audio.assess_vocal_timbre")!;
    expect(helm).toBeDefined();
    expect(voice.inputBindings).toContainEqual({ name: "helm", from: `stage:${helm.stageId}`, port: "result" });
    expect(validateTypedAutomationGraph(AUDIO_PROFILE.stages)).toEqual([]);
    expect(validateUserScenarioDefinition(AUDIO_PROFILE)).toEqual([]);

    const invalid = structuredClone(AUDIO_PROFILE.stages);
    invalid.find((stage) => stage.actionId === "audio.assess_vocal_timbre")!.inputBindings = [];
    expect(validateTypedAutomationGraph(invalid).join(" ")).toContain("missing required input 'helm'");
  });

  it("derives R's four typed nodes and preserves the explicit merge input order", () => {
    const graph = buildAutomationGraph(R.stages);
    expect(graph.nodes.map((node) => node.actionId)).toEqual(R.stages.map((stage) => stage.actionId));
    expect(graph.edges.filter((edge) => edge.edgeKind === "data").map(({ from, fromPort, toPort }) => [from, fromPort, toPort])).toEqual([
      [R.stages[0].stageId, "result", "brief"],
      [R.stages[0].stageId, "result", "brief"],
      [R.stages[1].stageId, "result", "qwenBank"],
      [R.stages[2].stageId, "result", "gemmaBank"],
    ]);
    expect(validateTypedAutomationGraph(R.stages)).toEqual([]);
  });

  it("topologically schedules a copied graph while preserving author order for parallel nodes", () => {
    const stages = [R.stages[3], R.stages[2], R.stages[0], R.stages[1]];
    expect(topologicalStageOrder(stages).map((stage) => stage.actionId)).toEqual([
      "brief.from_template", "text.qwen.resolved", "text.gemma.awtd", "data.merge",
    ]);
  });

  it("keeps Q's FlowMusic export connected to the plan and ordered CLAP then SigLIP banks", () => {
    const graph = buildAutomationGraph(Q.stages);
    const exportStage = Q.stages.find((stage) => stage.actionId === "flowmusic.export")!;
    expect(validateTypedAutomationGraph(Q.stages)).toEqual([]);
    expect(exportStage.inputBindings.filter((binding) => binding.name === "banks").map((binding) => Q.stages.find((stage) => `stage:${stage.stageId}` === binding.from)?.actionId)).toEqual(["audio.clap.resolved", "spec.siglip.resolved"]);
    expect(portsForStage(exportStage)?.outputs).toContainEqual({ id: "result", kind: "flowmusic-timeline", required: true });
    expect(graph.edges.filter((edge) => edge.to === exportStage.stageId && edge.edgeKind === "data").map((edge) => [edge.toPort, edge.kind])).toEqual([
      ["segmentPlan", "segment-plan"], ["banks", "parameter-bank"], ["banks", "parameter-bank"],
    ]);
  });

  it("rejects an incompatible port binding and a missing required input", () => {
    const incompatible = structuredClone(R.stages);
    incompatible[3].inputBindings = incompatible[3].inputBindings.map((binding) => binding.name === "qwenBank"
      ? { ...binding, from: `stage:${R.stages[0].stageId}` }
      : binding);
    expect(validateTypedAutomationGraph(incompatible).some((issue) => issue.includes("incompatible types"))).toBe(true);

    const missing = structuredClone(R.stages);
    missing[3].inputBindings = missing[3].inputBindings.filter((binding) => binding.name !== "gemmaBank");
    expect(validateTypedAutomationGraph(missing).some((issue) => issue.includes("missing required input 'gemmaBank'"))).toBe(true);
  });

  it("rejects cyclic connections", () => {
    const cyclic = structuredClone(R.stages);
    cyclic[0].inputBindings = [{ name: "brief", from: `stage:${cyclic[3].stageId}`, port: "result" }];
    expect(validateTypedAutomationGraph(cyclic)).toContain("Graph connections must be acyclic.");
    expect(() => topologicalStageOrder(cyclic)).toThrow(/cycle/);
  });

  it("models scenario I as two typed bank inputs and separate intersection/difference outputs", () => {
    expect(I.stages.map((stage) => stage.actionId)).toEqual([
      "text.qwen.resolved", "text.gemma.awtd", "data.intersection", "data.difference",
    ]);
    expect(validateTypedAutomationGraph(I.stages)).toEqual([]);
    for (const stage of I.stages.slice(2)) {
      expect(stage.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name)).toEqual(["a", "b"]);
    }
  });

  it("preserves B's three typed data edges from one SegmentPlan producer", () => {
    const graph = buildAutomationGraph(B.stages);
    expect(validateTypedAutomationGraph(B.stages)).toEqual([]);
    expect(graph.edges.filter((edge) => edge.edgeKind === "data").map((edge) => [edge.from, edge.to, edge.toPort, edge.kind])).toEqual(
      B.stages.slice(1).map((stage) => [B.stages[0]!.stageId, stage.stageId, "segmentPlan", "segment-plan"]),
    );
  });

  it("types D's explicit Gemma identity and Qwen value-anchor artifact inputs", () => {
    expect(D.stages.map((stage) => stage.actionId)).toEqual([
      "brief.from_template", "text.gemma.awtd", "text.qwen.resolved", "text.gemma.resolved",
    ]);
    expect(validateTypedAutomationGraph(D.stages)).toEqual([]);
    const graph = buildAutomationGraph(D.stages);
    expect(graph.edges.filter((edge) => edge.to === D.stages[3]!.stageId && edge.edgeKind === "data").map((edge) => [edge.toPort, edge.kind])).toEqual([
      ["brief", "brief"], ["identityBank", "parameter-bank"], ["qwenAnchors", "parameter-bank"],
    ]);
  });

  it("declares typed ports for all supported AM2 actions that were previously missing", () => {
    const contracts = [
      ["audio.analyze", "audio-analysis", []],
      ["audio.describe_gaps.lfm3", "gap-descriptions", ["anchors", "segmentPlan"]],
      ["audio.gemma.awtd", "parameter-bank", []],
      ["audio.gemma.resolved", "parameter-bank", ["identityBank"]],
      ["brief.combine_segment_texts", "brief", []],
      ["text_features.compare_rankings", "ranking-variants", ["snapshot"]],
      ["text_features.describe_llm", "natural-description", ["snapshot"]],
      ["text_features.reverse_query", "reverse-query", ["snapshot"]],
    ] as const;
    for (const [actionId, outputKind, requiredInputs] of contracts) {
      const stage = structuredClone(R.stages[0]!);
      stage.actionId = actionId;
      stage.inputBindings = [];
      stage.outputDefinitions = [{ port: "result", kind: outputKind, required: true }];
      const ports = portsForStage(stage)!;
      expect(ports.outputs).toEqual([{ id: "result", kind: outputKind, required: true }]);
      expect(ports.inputs.filter((port) => port.required).map((port) => port.id).sort()).toEqual([...requiredInputs].sort());
    }

    const perWindow = structuredClone(R.stages[0]!);
    perWindow.actionId = "audio.gemma.awtd";
    perWindow.settings.effective.perSegmentResults = true;
    expect(portsForStage(perWindow)?.inputs.find((port) => port.id === "segmentPlan")?.required).toBe(true);
  });

  it("keeps F's server Stage-2 result distinct and connects only declared bundle input kinds", () => {
    expect(validateTypedAutomationGraph(F.stages)).toEqual([]);
    const graph = buildAutomationGraph(F.stages);
    const bundleEdges = graph.edges.filter((edge) => edge.to === F.stages[5]!.stageId && edge.edgeKind === "data");
    expect(bundleEdges.map((edge) => [edge.toPort, edge.kind])).toEqual([
      ["source", "parameter-bank"], ["source", "parameter-bank"],
    ]);
    expect(F.stages[4]!.actionId).toBe("stage2.server");
    expect(F.stages[5]!.actionId).toBe("result.bundle");
  });

  it("keeps S's ordered two-bank Stage-2 inputs typed and distinct from merge", () => {
    expect(validateTypedAutomationGraph(S.stages)).toEqual([]);
    const stage2 = S.stages[3]!;
    expect(stage2.actionId).toBe("stage2.server");
    expect(stage2.inputBindings.filter((binding) => binding.name === "stage1").map((binding) => binding.from)).toEqual([
      `stage:${S.stages[1]!.stageId}`, `stage:${S.stages[2]!.stageId}`,
    ]);
    expect(stage2.actionId).not.toBe("data.merge");
  });

  it("keeps vocal allocation matrix output separate from its typed parameter-bank port", () => {
    for (const scenario of [O, T]) {
      expect(validateTypedAutomationGraph(scenario.stages)).toEqual([]);
      const search = scenario.stages[1]!;
      const filter = scenario.stages[2]!;
      expect(search.outputDefinitions).toEqual([
        { port: "result", kind: "vocal-allocation", required: true },
        { port: "parameters", kind: "parameter-bank", required: true },
      ]);
      expect(filter.inputBindings).toContainEqual({ name: "input", from: `stage:${search.stageId}`, port: "parameters" });
    }
  });

  it("selects the compatible vocal parameter-bank port for a filter connection", () => {
    const search = O.stages.find((stage) => stage.actionId === "vocal_allocation.search")!;
    const filter = O.stages.find((stage) => stage.actionId === "data.filter")!;
    expect(compatibleOutputPortForTarget(filter, search, O.stages, "input")).toBe("parameters");
    expect(compatibleOutputPortForTarget(filter, O.stages[0]!, O.stages, "input")).toBeUndefined();
  });

  it("maps typed connections to the runtime binding names required by their handlers", () => {
    const exportStage = Q.stages.find((stage) => stage.actionId === "flowmusic.export")!;
    const segment = Q.stages.find((stage) => stage.actionId === "audio.segment")!;
    const clap = Q.stages.find((stage) => stage.actionId === "audio.clap.resolved")!;
    const textFeatures = { ...structuredClone(R.stages[3]!), actionId: "text_features.build" as const, inputBindings: [] };
    const advisor = { ...structuredClone(R.stages[3]!), actionId: "llm.advisor" as const, inputBindings: [] };
    const audioAnalysis = { ...structuredClone(R.stages[3]!), actionId: "audio.analyze" as const, inputBindings: [] };
    const resultBundle = { ...structuredClone(R.stages[3]!), actionId: "result.bundle" as const, inputBindings: [] };
    const qwen = R.stages[1]!;
    const gemmaIdentity = R.stages[2]!;
    const brief = R.stages[0]!;
    const gemmaValues = { ...structuredClone(R.stages[3]!), actionId: "text.gemma.resolved" as const, inputBindings: [] };
    const vocalSearch = O.stages.find((stage) => stage.actionId === "vocal_allocation.search")!;

    expect(inputBindingNamesForConnection(exportStage, segment, Q.stages, 1)).toEqual(["segmentPlan"]);
    expect(inputBindingNamesForConnection(exportStage, clap, Q.stages, 2)).toEqual(["banks"]);
    expect(inputBindingNamesForConnection(textFeatures, segment, [...R.stages, segment], 1)).toEqual(["segmentPlan"]);
    expect(inputBindingNamesForConnection(textFeatures, R.stages[1]!, R.stages, 1)).toEqual(["parameterBank1"]);
    expect(inputBindingNamesForConnection(audioAnalysis, segment, [...R.stages, segment], 1)).toEqual(["segmentPlan"]);
    expect(inputBindingNamesForConnection(advisor, R.stages[1]!, R.stages, 1)).toEqual(["steps"]);
    expect(inputBindingNamesForConnection(resultBundle, vocalSearch, O.stages, 1, "parameters")).toEqual(["source"]);
    expect(inputBindingNamesForConnection(R.stages[1]!, brief, R.stages, 1)).toEqual(["brief"]);
    expect(inputBindingNamesForConnection(gemmaValues, gemmaIdentity, R.stages, 1)).toEqual(["identityBank", "identityBankB"]);
    expect(inputBindingNamesForConnection(gemmaValues, qwen, R.stages, 2)).toEqual(["qwenAnchors"]);
    expect(inputBindingNamesForConnection(gemmaValues, brief, R.stages, 3)).toEqual(["brief"]);
  });

  it("routes parseable text artifacts through the shared Brief input contract", () => {
    const qwen = structuredClone(R.stages[1]!);
    const limitedText = {
      ...structuredClone(R.stages[0]!),
      stageId: "text-to-qwen:limited-text",
      actionId: "text.limit" as const,
      inputBindings: [{ name: "text", from: "external:brief" }],
      outputDefinitions: [{ port: "result", kind: "text", required: true }],
    };
    qwen.inputBindings = [{ name: "brief", from: `stage:${limitedText.stageId}`, port: "result" }];
    expect(inputBindingNamesForConnection(qwen, limitedText, [limitedText, qwen], 1)).toEqual(["brief"]);
    expect(validateTypedAutomationGraph([limitedText, qwen])).toEqual([]);
  });

  it("round-trips existing built-in scenario data bindings through the constructor name mapping", () => {
    for (const scenario of AUTOMATION_SCENARIOS) {
      for (const target of scenario.stages) {
        const dataBindings = target.inputBindings.filter((binding) => binding.port !== "order" && binding.from.startsWith("stage:"));
        dataBindings.forEach((binding, index) => {
          const source = scenario.stages.find((stage) => `stage:${stage.stageId}` === binding.from);
          expect(source, `${scenario.id}/${target.stageId}/${binding.name} source`).toBeDefined();
          if (!source) return;
          expect(
            inputBindingNamesForConnection(target, source, scenario.stages, index + 1, binding.port ?? "result"),
            `${scenario.id}/${target.actionId} should reproduce binding '${binding.name}' from ${source.actionId}`,
          ).toContain(binding.name);
        });
      }
    }
  });

  it("rejects a non-bank producer on either set-operation input", () => {
    const invalid = structuredClone(I.stages);
    invalid[2]!.inputBindings[0] = { name: "a", from: `stage:${I.stages[0]!.stageId}`, port: "brief" };
    expect(validateTypedAutomationGraph(invalid).some((issue) => issue.includes("unknown port") || issue.includes("incompatible types"))).toBe(true);
  });

  it("types data.split dynamic channel and unmatched outputs without changing their overlap semantics", () => {
    const qwen = structuredClone(R.stages[1]!);
    qwen.stageId = "split-test:qwen";
    qwen.inputBindings = [];
    const split = {
      ...structuredClone(R.stages[3]!),
      stageId: "split-test:split",
      actionId: "data.split" as const,
      title: "Split rows",
      inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }],
      outputDefinitions: [
        { port: "first", kind: "parameter-bank", required: false },
        { port: "second", kind: "parameter-bank", required: false },
        { port: "unmatched", kind: "parameter-bank", required: false },
      ],
      settings: { requested: { channels: [] }, effective: { channels: [] }, origin: "manual" as const },
    };
    const graph = buildAutomationGraph([qwen, split]);
    expect(portsForStage(split)?.outputs.map(({ id, kind }) => [id, kind])).toEqual([
      ["first", "parameter-bank"], ["second", "parameter-bank"], ["unmatched", "parameter-bank"],
    ]);
    expect(graph.edges.filter((edge) => edge.to === split.stageId).map((edge) => [edge.toPort, edge.kind])).toEqual([["input", "parameter-bank"]]);
    expect(validateTypedAutomationGraph([qwen, split])).toEqual([]);
  });

  it("types data.select output by its mode", () => {
    const qwen = structuredClone(R.stages[1]!);
    qwen.stageId = "select-test:qwen";
    qwen.inputBindings = [];
    const select = {
      ...structuredClone(R.stages[3]!), stageId: "select-test:select", actionId: "data.select" as const,
      inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }],
      outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }],
      settings: { requested: { mode: "parameters_by_name", fields: ["a"] }, effective: { mode: "parameters_by_name", fields: ["a"] }, origin: "manual" as const },
    };
    expect(portsForStage(select)?.outputs.map(({ id, kind }) => [id, kind])).toEqual([["result", "parameter-bank"]]);
    expect(validateTypedAutomationGraph([qwen, select])).toEqual([]);
  });
});
