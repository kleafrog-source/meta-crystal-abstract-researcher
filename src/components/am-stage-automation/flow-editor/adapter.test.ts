import { describe, expect, it } from "vitest";
import { ACTION_SUPPORTED, AUTOMATION_SCENARIOS } from "@/lib/am-stage-automation/catalog";
import { AUTOMATION_ACTION_IDS, type AutomationActionId } from "@/lib/am-stage-automation/contracts";
import { cloneStagesForScenarioEditor, removeDraftStage } from "@/lib/am-stage-automation/scenario-editor";
import { buildAutomationGraph } from "@/lib/am-stage-automation/typed-graph";
import { actionSpec, canConnect, graphForCanvas, normalizeEditorLayout, removeEditorEdgeBinding, validateEditorConnections } from "./adapter";
import { PALETTE_ORDER } from "./adapter";
import type { AutomationScenarioDefinition } from "@/lib/am-stage-automation/contracts";
import { applyNodeflowParameter } from "./parameters";

const builtin = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "catalogue-bank-merge-r")!;

describe("AM2 nodeflow adapter to the main Automation contract", () => {
  it("maps the built-in R graph without changing the built-in definition", () => {
    const before = JSON.stringify(builtin);
    const graph = graphForCanvas(buildAutomationGraph(builtin.stages));
    expect(graph.nodes.filter((node) => node.type === "operation").map((node) => node.stage.actionId)).toEqual([
      "brief.from_template", "text.qwen.resolved", "text.gemma.awtd", "data.merge",
    ]);
    expect(graph.edges.filter((edge) => edge.kind === "data")).toHaveLength(4);
    expect(validateEditorConnections(builtin.stages, buildAutomationGraph(builtin.stages))).toEqual([]);
    expect(JSON.stringify(builtin)).toBe(before);
  });

  it("round-trips user node positions as optional scenario metadata", () => {
    const positions = Object.fromEntries(builtin.stages.map((stage, index) => [stage.stageId, { x: 80 + index * 320, y: 50 + (index % 2) * 180 }]));
    const definition: AutomationScenarioDefinition = {
      ...structuredClone(builtin),
      id: "user-layout-test",
      editorLayout: { schemaVersion: 1, positions },
    };
    const loaded = JSON.parse(JSON.stringify(definition)) as AutomationScenarioDefinition;
    expect(normalizeEditorLayout(loaded.stages, loaded.editorLayout?.positions, buildAutomationGraph(loaded.stages))).toEqual(positions);
    const legacy = structuredClone(builtin);
    delete legacy.editorLayout;
    const legacyGraph = buildAutomationGraph(legacy.stages);
    expect(normalizeEditorLayout(legacy.stages, undefined, legacyGraph)).toEqual(
      Object.fromEntries(legacyGraph.nodes.map((node) => [node.id, { x: node.x, y: node.y }])),
    );
  });

  it("accepts a compatible Qwen-to-merge port and rejects a Brief-to-bank port", () => {
    const stages = structuredClone(builtin.stages);
    const merge = stages.find((stage) => stage.actionId === "data.merge")!;
    merge.inputBindings = merge.inputBindings.filter((binding) => binding.name !== "qwenBank" && binding.port !== "order");
    const graph = graphForCanvas(buildAutomationGraph(stages));
    const brief = stages.find((stage) => stage.actionId === "brief.from_template")!;
    const qwen = stages.find((stage) => stage.actionId === "text.qwen.resolved")!;
    expect(canConnect(graph, qwen.stageId, "result", merge.stageId, "qwenBank")).toMatchObject({ ok: true });
    expect(canConnect(graph, brief.stageId, "result", merge.stageId, "qwenBank")).toMatchObject({ ok: false, code: "KIND_MISMATCH" });
    const gemma = stages.find((stage) => stage.actionId === "text.gemma.awtd")!;
    expect(canConnect(graph, gemma.stageId, "result", merge.stageId, "qwenBank")).toMatchObject({ ok: false, code: "MERGE_SOURCE_ROLE_MISMATCH" });
  });

  it("removes a node together with its bindings and preserves the remaining merge order", () => {
    const copy = cloneStagesForScenarioEditor(builtin.stages, "draft-test");
    const qwenId = copy.find((stage) => stage.actionId === "text.qwen.resolved")!.stageId;
    const merge = copy.find((stage) => stage.actionId === "data.merge")!;
    const originalOrder = merge.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name);
    const next = removeDraftStage(copy, qwenId);
    expect(next.some((stage) => stage.stageId === qwenId)).toBe(false);
    expect(next.flatMap((stage) => stage.inputBindings).some((binding) => binding.from === `stage:${qwenId}`)).toBe(false);
    const remainingMerge = next.find((stage) => stage.actionId === "data.merge")!;
    expect(remainingMerge.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name)).toEqual(originalOrder.filter((name) => name !== "qwenBank"));
    expect(builtin.stages.find((stage) => stage.actionId === "data.merge")?.inputBindings.map((binding) => binding.name)).toContain("qwenBank");
  });

  it("removes a visible order/data/external graph edge by its original binding identity", () => {
    const stages = structuredClone(builtin.stages);
    const graph = graphForCanvas(buildAutomationGraph(stages), stages);
    const orderEdge = graph.edges.find((edge) => edge.kind === "order")!;
    const beforeOrder = stages.find((stage) => stage.stageId === orderEdge.to)!.inputBindings.length;
    const afterOrder = removeEditorEdgeBinding(stages, orderEdge);
    expect(afterOrder.find((stage) => stage.stageId === orderEdge.to)!.inputBindings).toHaveLength(beforeOrder - 1);
    expect(stages.find((stage) => stage.stageId === orderEdge.to)!.inputBindings).toHaveLength(beforeOrder);
    const dataEdge = graph.edges.find((edge) => edge.kind === "data")!;
    const beforeData = stages.find((stage) => stage.stageId === dataEdge.to)!.inputBindings.length;
    expect(removeEditorEdgeBinding(stages, dataEdge).find((stage) => stage.stageId === dataEdge.to)!.inputBindings).toHaveLength(beforeData - 1);
  });

  it("keeps merge input order and stage parameters in the serializable scenario sent to planning", () => {
    const copy = structuredClone(builtin);
    const merge = copy.stages.find((stage) => stage.actionId === "data.merge")!;
    const order = merge.inputBindings.filter((binding) => binding.port !== "order");
    merge.inputBindings = [
      ...merge.inputBindings.filter((binding) => binding.port === "order"),
      ...order.reverse(),
    ];
    merge.settings.requested.conflicts = "keep_last";
    merge.settings.effective.conflicts = "keep_last";
    const saved = JSON.parse(JSON.stringify(copy)) as AutomationScenarioDefinition;
    const savedMerge = saved.stages.find((stage) => stage.actionId === "data.merge")!;
    expect(savedMerge.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name)).toEqual(["gemmaBank", "qwenBank"]);
    expect(savedMerge.settings.effective.conflicts).toBe("keep_last");
    expect(builtin.stages.find((stage) => stage.actionId === "data.merge")?.settings.effective.conflicts).toBe("keep_first");
  });

  it("renders every builtin definition without dropping opaque stages, bindings, or layout", () => {
    for (const scenario of AUTOMATION_SCENARIOS) {
      const before = JSON.stringify(scenario);
      const graph = graphForCanvas(buildAutomationGraph(scenario.stages), scenario.stages);
      expect(graph.nodes.filter((node) => node.type === "operation").map((node) => node.id)).toEqual(scenario.stages.map((stage) => stage.stageId));
      const expectedEdges = scenario.stages.reduce((sum, stage) => sum + stage.inputBindings.filter((binding) => binding.from.startsWith("stage:") || binding.from.startsWith("external:")).length, 0);
      expect(graph.edges.filter((edge) => !edge.derived)).toHaveLength(expectedEdges);
      expect(graph.nodes.filter((node) => node.type === "operation").map((node) => node.stage.actionId)).toEqual(scenario.stages.map((stage) => stage.actionId));
      for (const stage of scenario.stages) {
        const spec = actionSpec(stage.actionId, stage, scenario.stages);
        expect(spec.actionId).toBe(stage.actionId);
        expect(typeof spec.editable).toBe("boolean");
        if (!spec.editable) expect(spec.readOnlyReason).toBeTruthy();
        for (const binding of stage.inputBindings.filter((item) => item.from.startsWith("stage:") || item.from.startsWith("external:"))) {
          const external = binding.from.startsWith("external:");
          const raw = external ? binding.from.slice("external:".length) : "";
          const outputPort = binding.port ?? (raw.toLowerCase().includes("audio") || raw.toLowerCase().includes("asset") ? "audio" : "brief");
          expect(graph.edges.some((edge) => !edge.derived && edge.bindingFrom === binding.from && edge.bindingName === binding.name && edge.bindingPort === (binding.port ?? (external ? outputPort : "result")) && edge.to === stage.stageId)).toBe(true);
        }
      }
      expect(JSON.stringify(scenario)).toBe(before);
    }
  });

  it("round-trips every builtin definition through the editor graph without losing contract fields", async () => {
    const { serializeNodeflowScenario } = await import("./scenario-serializer");
    for (const scenario of AUTOMATION_SCENARIOS) {
      const before = JSON.stringify(scenario);
      const graph = graphForCanvas(buildAutomationGraph(scenario.stages), scenario.stages);
      const visibleStages = graph.nodes.filter((node) => node.type === "operation").map((node) => node.stage);
      const positions = Object.fromEntries(scenario.stages.map((stage, index) => [stage.stageId, { x: 120 + index * 17, y: 90 + index * 23 }]));
      const templateVariablesText = typeof scenario.defaultSettings.templateVariablesText === "string" ? scenario.defaultSettings.templateVariablesText : "";
      const roundTripped = serializeNodeflowScenario(scenario, {
        id: scenario.id,
        version: scenario.version,
        title: scenario.title,
        stages: visibleStages,
        positions,
        templateVariablesText,
      });

      const expected = structuredClone(scenario);
      expected.defaultSettings.templateVariablesText = templateVariablesText;
      expected.editorLayout = { schemaVersion: 1, positions };
      expect(roundTripped).toEqual(expected);
      expect(JSON.stringify(scenario)).toBe(before);
    }
  });

  it("distinguishes runtime support from editor support for every action contract", () => {
    for (const actionId of AUTOMATION_ACTION_IDS) {
      const spec = actionSpec(actionId);
      expect(typeof ACTION_SUPPORTED.has(actionId)).toBe("boolean");
      expect(spec.actionId).toBe(actionId);
    }
    const universalStep = actionSpec("flow.universal_step" as AutomationActionId);
    expect(universalStep.editable).toBe(false);
    expect(universalStep.readOnlyReason).toContain("runtime");
    expect(PALETTE_ORDER).toHaveLength(28);
    for (const actionId of PALETTE_ORDER) {
      expect(ACTION_SUPPORTED.has(actionId)).toBe(true);
      expect(actionSpec(actionId).editable).toBe(true);
    }
    expect(actionSpec("audio.describe_segments.lfm3" as AutomationActionId).settings.find((setting) => setting.key === "sampleLimit")?.editable).toBe(true);
    expect(actionSpec("data.select" as AutomationActionId).settings.find((setting) => setting.key === "mode")?.editable).toBe(true);
    expect(actionSpec("data.select" as AutomationActionId).settings.find((setting) => setting.key === "fields")?.type).toBe("string-list");
    expect(actionSpec("data.select" as AutomationActionId).settings.find((setting) => setting.key === "fields")?.editable).toBe(true);
    const advisor = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-llm-advisor-n")!.stages.find((stage) => stage.actionId === "llm.advisor")!;
    const allowedActions = actionSpec("llm.advisor", advisor, AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-llm-advisor-n")!.stages).settings.find((setting) => setting.key === "allowedActions");
    expect(allowedActions).toMatchObject({ type: "action-list", editable: true });
    expect(allowedActions?.options).toContain("text.limit");
  });

  it("shows scenario-level external audio and brief dependencies without inventing persisted bindings", () => {
    const source = AUTOMATION_SCENARIOS.find((scenario) => scenario.stages.some((stage) => stage.actionId === "audio.segment"))!;
    const stage = source.stages.find((item) => item.actionId === "audio.segment")!;
    const before = JSON.stringify(stage.inputBindings);
    const graph = graphForCanvas(buildAutomationGraph([stage]), [stage]);
    expect(graph.nodes.some((node) => node.type === "external" && node.externalKind === "audio")).toBe(true);
    expect(graph.edges.some((edge) => edge.derived && edge.to === stage.stageId && edge.toPort === "audio")).toBe(true);
    expect(JSON.stringify(stage.inputBindings)).toBe(before);
    const qwen = { ...structuredClone(builtin.stages.find((item) => item.actionId === "text.qwen.resolved")!), inputBindings: [] };
    const briefScenario = { ...builtin, stages: [qwen] };
    const briefGraph = graphForCanvas(buildAutomationGraph(briefScenario.stages), briefScenario.stages);
    expect(briefGraph.edges.some((edge) => edge.derived && edge.to === qwen.stageId && edge.toPort === "brief")).toBe(true);
  });

  it("keeps a dangling stage binding visible and reports the exact missing source", () => {
    const stages = structuredClone(builtin.stages);
    const merge = stages.find((stage) => stage.actionId === "data.merge")!;
    merge.inputBindings.push({ name: "qwenBank", from: "stage:missing-qwen", port: "result" });
    const typed = buildAutomationGraph(stages);
    const graph = graphForCanvas(typed, stages);
    expect(graph.nodes.some((node) => node.type === "external" && node.label === "Отсутствующий узел missing-qwen")).toBe(true);
    expect(validateEditorConnections(stages, typed).some((issue) => issue.code === "MISSING_SOURCE" && issue.message.includes("missing-qwen"))).toBe(true);
  });

  it("serializes a lossless user copy with layout, graph bindings, branches and opaque metadata", async () => {
    const { serializeNodeflowScenario } = await import("./scenario-serializer");
    const branch = AUTOMATION_SCENARIOS.find((scenario) => scenario.stages.some((stage) => stage.actionId === "flow.if")) ?? builtin;
    const source = structuredClone({ ...branch, customScenarioField: { keep: true }, defaultSettings: { ...branch.defaultSettings, templateVariablesText: "mood=calm\nspace=wide" } });
    const draft = {
      id: "user-roundtrip",
      version: 1,
      title: "Copy",
      stages: structuredClone(source.stages),
      positions: Object.fromEntries(source.stages.map((stage, index) => [stage.stageId, { x: index * 300, y: index % 2 * 140 }])),
      templateVariablesText: "mood=calm\nspace=wide",
    };
    const saved = serializeNodeflowScenario(source, draft);
    expect(saved.id).toBe("user-roundtrip");
    expect(saved.stages).toEqual(source.stages);
    expect(saved.editorLayout?.positions).toEqual(draft.positions);
    expect(saved.defaultSettings).toEqual(source.defaultSettings);
    expect(saved.requiredResults).toEqual(source.requiredResults);
    expect(saved.optionalResults).toEqual(source.optionalResults);
    expect((saved as typeof saved & { customScenarioField: { keep: boolean } }).customScenarioField).toEqual({ keep: true });
    expect(JSON.stringify(source)).not.toContain("user-roundtrip");
  });

  it("writes inspector edits into both requested and effective planner settings while retaining unknown keys", () => {
    const qwen = structuredClone(builtin.stages.find((stage) => stage.actionId === "text.qwen.resolved")!);
    qwen.settings.requested.preservedOpaque = { source: "AM2" };
    qwen.settings.effective.preservedOpaque = { source: "AM2" };
    const edited = applyNodeflowParameter(qwen, "topK", 21);
    expect(edited.settings.requested.topK).toBe(21);
    expect(edited.settings.effective.topK).toBe(21);
    expect(edited.settings.requested.preservedOpaque).toEqual({ source: "AM2" });
    expect(edited.settings.effective.preservedOpaque).toEqual({ source: "AM2" });
    expect(edited.settings.origin).toBe("manual");

    const router = structuredClone(AUTOMATION_SCENARIOS.flatMap((scenario) => scenario.stages).find((stage) => stage.actionId === "flow.router")!);
    const routerEdited = applyNodeflowParameter(router, "rules", [{ id: "r1", route: "small", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "lt", right: { type: "literal", value: 10 } } }]);
    expect(routerEdited.settings.effective.rules).toEqual(routerEdited.settings.requested.rules);
    expect(routerEdited.outputDefinitions.map((output) => output.port)).toEqual(["decision", "small", "fallback"]);

    const segment = structuredClone(AUTOMATION_SCENARIOS.flatMap((scenario) => scenario.stages).find((stage) => stage.actionId === "audio.segment")!);
    const segmentEdited = applyNodeflowParameter(segment, "requestedCount", 9);
    expect(segmentEdited.settings.requested).toMatchObject({ requestedCount: 9, maximumCount: 9 });
    expect(segmentEdited.settings.effective).toMatchObject({ requestedCount: 9, maximumCount: 9 });

    const select = structuredClone(AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "demo-m-universal-step")!.stages.find((stage) => stage.actionId === "data.select")!);
    select.settings.requested.preservedOpaque = ["kept"];
    select.settings.effective.preservedOpaque = ["kept"];
    const selectEdited = applyNodeflowParameter(select, "mode", "parameters_by_name");
    expect(selectEdited.settings.requested).toMatchObject({ mode: "parameters_by_name", preservedOpaque: ["kept"] });
    expect(selectEdited.settings.effective).toMatchObject({ mode: "parameters_by_name", preservedOpaque: ["kept"] });
    expect(selectEdited.outputDefinitions).toEqual([{ port: "result", kind: "parameter-bank", required: true }]);

    select.settings.requested = { ...select.settings.requested, mode: "fields", fields: ["tempo", "key"] };
    select.settings.effective = { ...select.settings.effective, mode: "fields", fields: ["tempo", "key"] };
    const selectSpec = actionSpec("data.select", select, [select]);
    expect(selectSpec.settings.find((setting) => setting.key === "fields")).toMatchObject({ type: "string-list", editable: true });
    const selectFieldsEdited = applyNodeflowParameter(select, "fields", ["tempo", "loudness"]);
    expect(selectFieldsEdited.settings.requested.fields).toEqual(["tempo", "loudness"]);
    expect(selectFieldsEdited.settings.effective.fields).toEqual(["tempo", "loudness"]);

    const malformedFields = structuredClone(select);
    malformedFields.settings.requested.fields = "tempo";
    malformedFields.settings.effective.fields = "tempo";
    const malformedSpec = actionSpec("data.select", malformedFields, [malformedFields]).settings.find((setting) => setting.key === "fields");
    expect(malformedSpec).toMatchObject({ editable: false, readOnlyReason: expect.stringContaining("список строк") });
    expect(malformedFields.settings.requested.fields).toBe("tempo");

    const advisor = structuredClone(AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-llm-advisor-n")!.stages.find((stage) => stage.actionId === "llm.advisor")!);
    advisor.settings.requested.allowedActions = ["text.limit", "legacy.future-action"];
    advisor.settings.effective.allowedActions = ["text.limit", "legacy.future-action"];
    const advisorEdited = applyNodeflowParameter(advisor, "allowedActions", ["text.limit", "audio.segment", "legacy.future-action"]);
    expect(advisorEdited.settings.requested.allowedActions).toEqual(["text.limit", "audio.segment", "legacy.future-action"]);
    expect(advisorEdited.settings.effective.allowedActions).toEqual(["text.limit", "audio.segment", "legacy.future-action"]);
    const advisorSpec = actionSpec("llm.advisor", advisorEdited, [advisorEdited]).settings.find((setting) => setting.key === "allowedActions");
    expect(advisorSpec?.options).not.toContain("legacy.future-action");
    expect(advisorEdited.settings.effective.allowedActions).toContain("legacy.future-action");
  });
});


