import { describe, expect, it } from "vitest";
import { AUTOMATION_SCENARIOS } from "./catalog";
import { canConnectMergeSource, cloneStagesForScenarioEditor, isSupportedParameterBankIntersectionPlan, isSupportedParameterBankTransformPlan, isSupportedRMergePlan, isSupportedServerStage2Plan, makeDraftStageId, moveDraftStage, outputDefinitionsForOperatorSettings, removeDraftStage, updateAutomationSourceBinding, updateDataOperatorSettings, updateFlowJoinPolicies, updateFlowOperatorSettings, updateMergeSourceBinding, validateUserScenarioDefinition } from "./scenario-editor";
import { portsForStage, validateTypedAutomationGraph } from "./typed-graph";
import type { AutomationPlanDocument } from "./contracts";

const R = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "catalogue-bank-merge-r")!;
const I = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "catalogue-bank-set-ops-i")!;
const J = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-text-limit-assemble-j")!;
const H = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-two-briefs-assemble-qwen-h")!;
const H_MERGE = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-two-briefs-merge-qwen-h")!;
const E = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-qwen-reapply-e")!;
const K = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "demo-k-count-if-join")!;
const L = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "demo-l-router-fallback")!;
const S = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-catalogue-consensus-s")!;

describe("parameter-bank set operation Stage target compatibility", () => {
  it("allows the existing Stage target for typed intersection and difference plans", () => {
    for (const actionId of ["data.intersection", "data.difference"] as const) {
      const original = I.stages.find((item) => item.actionId === "data.intersection")!;
      const stage = structuredClone(original);
      stage.actionId = actionId;
      const plan = { scenarioRef: { id: I.id }, stages: I.stages.map((item) => item.stageId === stage.stageId ? stage : structuredClone(item)) } as unknown as AutomationPlanDocument;
      expect(isSupportedParameterBankIntersectionPlan(plan, I.id, stage.stageId)).toBe(true);
      expect(isSupportedParameterBankIntersectionPlan(plan, "other-scenario", stage.stageId)).toBe(false);
    }
  });
});

describe("server Stage-2 Stage target compatibility", () => {
  it("accepts only a saved server consensus node with explicit compatible inputs", () => {
    const stage = S.stages.find((item) => item.actionId === "stage2.server")!;
    const plan = { scenarioRef: { id: S.id }, stages: structuredClone(S.stages) } as unknown as AutomationPlanDocument;
    expect(isSupportedServerStage2Plan(plan, S.id, stage.stageId)).toBe(true);
    expect(isSupportedServerStage2Plan(plan, "other-scenario", stage.stageId)).toBe(false);
    const malformed = structuredClone(plan);
    malformed.stages.find((item) => item.stageId === stage.stageId)!.inputBindings = [];
    expect(isSupportedServerStage2Plan(malformed, S.id, stage.stageId)).toBe(false);
  });
});

describe("typed copies of legacy scenarios", () => {
  it("keeps audio-description and reverse-query chains valid when copied for user editing", () => {
    for (const sourceId of ["audio-description-to-parameters", "audio-reverse-query"]) {
      const source = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === sourceId)!;
      const userId = `user-copy-${sourceId}`;
      const stages = cloneStagesForScenarioEditor(source.stages, userId);
      expect(stages.map((stage) => stage.stageId)).not.toEqual(source.stages.map((stage) => stage.stageId));
      expect(validateUserScenarioDefinition({ ...source, id: userId, stages }), sourceId).toEqual([]);
    }
  });

  it("round-trips every built-in typed data edge through editor disconnect and reconnect", () => {
    for (const scenario of AUTOMATION_SCENARIOS) {
      for (const target of scenario.stages) {
        const sourceIds = [...new Set(target.inputBindings
          .filter((binding) => binding.port !== "order" && binding.from.startsWith("stage:"))
          .map((binding) => binding.from.slice(6)))];
        for (const sourceId of sourceIds) {
          const removed = updateAutomationSourceBinding(scenario.stages, target.stageId, sourceId, false);
          expect(removed.find((stage) => stage.stageId === target.stageId)?.inputBindings
            .some((binding) => binding.port !== "order" && binding.from === `stage:${sourceId}`), `${scenario.id}:${target.stageId}:${sourceId} removed`)
            .toBe(false);

          const restored = updateAutomationSourceBinding(removed, target.stageId, sourceId, true);
          expect(validateTypedAutomationGraph(restored), `${scenario.id}:${target.stageId}:${sourceId} restored: original=${JSON.stringify(target.inputBindings)} removed=${JSON.stringify(removed.find((stage) => stage.stageId === target.stageId)?.inputBindings)} restored=${JSON.stringify(restored.find((stage) => stage.stageId === target.stageId)?.inputBindings)}`)
            .toEqual([]);
        }
      }
    }
  });

  it("preserves semantic input names when editing a different connection on a multi-input action", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "am2-gemma-two-pass-d")!;
    const target = scenario.stages.find((stage) => stage.actionId === "text.gemma.resolved")!;
    const brief = scenario.stages.find((stage) => stage.actionId === "brief.from_template")!;
    const before = target.inputBindings.filter((binding) => binding.port !== "order");
    const removed = updateAutomationSourceBinding(scenario.stages, target.stageId, brief.stageId, false);
    const restored = updateAutomationSourceBinding(removed, target.stageId, brief.stageId, true);
    const after = restored.find((stage) => stage.stageId === target.stageId)!.inputBindings.filter((binding) => binding.port !== "order");
    const stable = (bindings: typeof before) => bindings.map(({ name, from, port }) => [name, from, port]).sort(([a], [b]) => String(a).localeCompare(String(b)));

    expect(stable(after)).toEqual(stable(before));
    expect(validateTypedAutomationGraph(restored)).toEqual([]);
  });
});

describe("R scenario editor contract", () => {
  it("connects a compatible dynamic router output to a generic merge", () => {
    const stages = cloneStagesForScenarioEditor(R.stages, "merge-router-port");
    const merge = stages.find((stage) => stage.actionId === "data.merge")!;
    merge.inputBindings = merge.inputBindings.map((binding) => ({ ...binding, name: "sources" }));
    const routerSource = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "demo-l-router-fallback")!.stages.find((stage) => stage.actionId === "flow.router")!;
    const router = {
      ...structuredClone(routerSource),
      stageId: "router-source",
      outputDefinitions: [
        { port: "decision", kind: "decision", required: true },
        { port: "selected", kind: "parameter-bank", required: false },
      ],
    };
    const graph = [...stages, router];

    expect(router.outputDefinitions[0]?.kind).toBe("decision");
    expect(canConnectMergeSource(merge, router, graph)).toBe(true);
    const updated = updateMergeSourceBinding(merge, router, graph, true);
    expect(updated.inputBindings.at(-1)).toEqual({ name: "sources", from: "stage:router-source", port: "selected" });
    expect(updated.outputDefinitions).toEqual([{ port: "result", kind: "parameter-bank", required: true }]);
  });

  it("removes a node and its incident bindings and join policies while preserving unrelated graph identity", () => {
    const stages = cloneStagesForScenarioEditor(K.stages, "remove-node");
    const [source, branch, filter, count, join] = stages;
    expect(source && branch && filter && count && join).toBeTruthy();
    const result = removeDraftStage(stages, branch!.stageId);
    const updatedJoin = result.find((stage) => stage.actionId === "flow.join")!;

    expect(result.map((stage) => stage.stageId)).toEqual(stages.filter((stage) => stage.stageId !== branch!.stageId).map((stage) => stage.stageId));
    expect(result.flatMap((stage) => stage.inputBindings).some((binding) => binding.from === `stage:${branch!.stageId}`)).toBe(false);
    expect(updatedJoin.inputBindings).toEqual(join!.inputBindings.filter((binding) => binding.from !== `stage:${branch!.stageId}`));
    expect(updatedJoin.settings.requested.policies).toEqual((join!.settings.requested.policies as Array<Record<string, unknown>>).filter((policy) => policy.binding !== branch!.stageId));
    expect(updatedJoin.settings.effective.policies).toEqual((join!.settings.effective.policies as Array<Record<string, unknown>>).filter((policy) => policy.binding !== branch!.stageId));
    expect(result.find((stage) => stage.stageId === source!.stageId)?.actionId).toBe(source!.actionId);
    expect(result.some((stage) => stage.stageId === count!.stageId)).toBe(true);
  });

  it("reorders independent nodes without changing IDs or bindings, and blocks moving a producer below its consumer", () => {
    const independentStages = cloneStagesForScenarioEditor(R.stages, "reorder-node");
    const originalIds = independentStages.map((stage) => stage.stageId);
    const originalBindings = structuredClone(independentStages.map((stage) => stage.inputBindings));

    const reordered = moveDraftStage(independentStages, independentStages[1]!.stageId, 1);
    expect(reordered?.map((stage) => stage.stageId)).toEqual([
      originalIds[0], originalIds[2], originalIds[1], originalIds[3],
    ]);
    expect(reordered?.map((stage) => stage.inputBindings.filter((binding) => binding.port !== "order")))
      .toEqual(originalBindings.map((bindings) => bindings.filter((binding) => binding.port !== "order")));
    expect(reordered?.flatMap((stage, index) => stage.inputBindings.filter((binding) => binding.port === "order").map((binding) => [index, binding.from])))
      .toEqual(reordered?.slice(1).map((stage, index) => [index + 1, `stage:${reordered[index]!.stageId}`]));
    expect(reordered?.find((stage) => stage.stageId === independentStages[1]!.stageId)?.stageId).toBe(independentStages[1]!.stageId);

    // The filter consumes the branch result, so moving that producer after the filter is invalid.
    const branchStages = cloneStagesForScenarioEditor(K.stages, "reorder-branch");
    const branchIds = branchStages.map((stage) => stage.stageId);
    const branch = branchStages.find((stage) => stage.actionId === "flow.if")!;
    expect(moveDraftStage(branchStages, branch.stageId, 1)).toBeNull();
    expect(branchStages.map((stage) => stage.stageId)).toEqual(branchIds);
  });

  it("produces the same bootstrap node ID during server and client hydration", () => {
    expect(makeDraftStageId("text.qwen.resolved", 0, "bootstrap"))
      .toBe("draft:1:text-qwen-resolved:bootstrap");
    expect(makeDraftStageId("text.qwen.resolved", 0, "bootstrap"))
      .toBe(makeDraftStageId("text.qwen.resolved", 0, "bootstrap"));
  });

  it("allows Stage Apply from a saved editable R copy by validating its plan identity and bindings", () => {
    const definition = structuredClone(R);
    const stages = cloneStagesForScenarioEditor(definition.stages, "copy");
    const userId = "user-copy";
    const plan = {
      scenarioRef: { id: userId, version: 7 },
      stages,
    } as AutomationPlanDocument;
    expect(isSupportedRMergePlan(plan, userId, stages[3]!.stageId)).toBe(true);
    expect(isSupportedRMergePlan(plan, R.id, stages[3]!.stageId)).toBe(false);
    const invalidPlan = structuredClone(plan);
    invalidPlan.stages[3]!.inputBindings = invalidPlan.stages[3]!.inputBindings.filter((binding) => binding.name !== "gemmaBank");
    expect(isSupportedRMergePlan(invalidPlan, userId, stages[3]!.stageId)).toBe(false);
  });

  it("clones four stable node IDs and preserves the real branch and merge bindings", () => {
    const stages = cloneStagesForScenarioEditor(R.stages, "copy-1");
    expect(stages).toHaveLength(4);
    expect(stages.map((stage) => stage.stageId)).toEqual([
      "copy-1:01:brief-from_template",
      "copy-1:02:text-qwen-resolved",
      "copy-1:03:text-gemma-awtd",
      "copy-1:04:data-merge",
    ]);
    expect(stages[1].inputBindings.find((binding) => binding.name === "brief")?.from).toBe(`stage:${stages[0].stageId}`);
    expect(stages[2].inputBindings.find((binding) => binding.name === "brief")?.from).toBe(`stage:${stages[0].stageId}`);
    expect(stages[3].inputBindings.filter((binding) => binding.port !== "order").map((binding) => [binding.name, binding.from])).toEqual([
      ["qwenBank", `stage:${stages[1].stageId}`],
      ["gemmaBank", `stage:${stages[2].stageId}`],
    ]);
    expect(validateUserScenarioDefinition({ ...R, id: "user-copy", stages })).toEqual([]);
  });

  it("rejects missing, duplicate, incompatible, and unsupported inputs before saving", () => {
    const stages = cloneStagesForScenarioEditor(R.stages, "copy-2");
    const merge = stages[3];
    const noGemma = { ...R, id: "bad-missing", stages: [...stages.slice(0, 3), { ...merge, inputBindings: merge.inputBindings.filter((binding) => binding.name !== "gemmaBank") }] };
    expect(validateUserScenarioDefinition(noGemma).join(" ")).toContain("exactly one qwenBank and one gemmaBank");

    const wrongSource = { ...R, id: "bad-source", stages: [...stages.slice(0, 3), { ...merge, inputBindings: merge.inputBindings.map((binding) => binding.name === "gemmaBank" ? { ...binding, from: `stage:${stages[1].stageId}` } : binding) }] };
    expect(validateUserScenarioDefinition(wrongSource).join(" ")).toContain("incompatible with the supported R merge contract");

    const unsupported = { ...R, id: "bad-handler", stages: [{ ...stages[0], actionId: "unregistered.action" as typeof stages[number]["actionId"] }] };
    expect(validateUserScenarioDefinition(unsupported).join(" ")).toContain("no registered executor handler");
  });

  it("keeps user-selected merge input order", () => {
    const stages = cloneStagesForScenarioEditor(R.stages, "copy-3");
    stages[3].inputBindings = [
      ...stages[3].inputBindings.filter((binding) => binding.port === "order"),
      ...stages[3].inputBindings.filter((binding) => binding.name === "gemmaBank"),
      ...stages[3].inputBindings.filter((binding) => binding.name === "qwenBank"),
    ];
    const copy = cloneStagesForScenarioEditor(stages, "copy-3-edit");
    expect(copy[3].inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.name)).toEqual(["gemmaBank", "qwenBank"]);
  });

  it("synchronizes edited flow conditions and router output ports in requested/effective settings", () => {
    const ifStage = { ...structuredClone(R.stages[3]!), actionId: "flow.if" as const, outputDefinitions: [{ port: "then", kind: "parameter-bank", required: false }, { port: "else", kind: "parameter-bank", required: false }, { port: "decision", kind: "decision", required: true }] };
    const condition = { left: { type: "binding", binding: "input", property: "count" }, op: "gte", right: { type: "literal", value: 12 } };
    const updatedIf = updateFlowOperatorSettings(ifStage, { condition });
    expect(updatedIf.settings).toMatchObject({ requested: { condition }, effective: { condition }, origin: "manual" });
    expect(updatedIf.outputDefinitions).toEqual(ifStage.outputDefinitions);

    const router = { ...ifStage, actionId: "flow.router" as const, settings: { requested: { mode: "first-match" }, effective: { mode: "first-match" }, origin: "scenario_default" as const } };
    const rules = [
      { id: "small-rule", route: "small", title: "Small", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "lt", right: { type: "literal", value: 4 } } },
      { id: "large-rule", route: "large", title: "Large", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "gte", right: { type: "literal", value: 4 } } },
    ];
    const updatedRouter = updateFlowOperatorSettings(router, { rules, fallbackRoute: "other" });
    expect(updatedRouter.settings).toMatchObject({ requested: { mode: "first-match", rules, fallbackRoute: "other" }, effective: { mode: "first-match", rules, fallbackRoute: "other" }, origin: "manual" });
    expect(updatedRouter.outputDefinitions.map(({ port }) => port)).toEqual(["decision", "small", "large", "other"]);
  });
});

describe("I bank set-operation scenario contract", () => {
  it("accepts the registered Qwen/Gemma bank bindings and explicit policies", () => {
    expect(validateUserScenarioDefinition(I)).toEqual([]);
  });

  it("rejects missing inputs, wrong producers, and unsupported policies", () => {
    const intersection = structuredClone(I);
    intersection.stages[2]!.inputBindings = intersection.stages[2]!.inputBindings.filter((binding) => binding.name !== "b");
    expect(validateUserScenarioDefinition(intersection).join(" ")).toContain("ordered inputs 'a' and 'b'");

    const wrongProducer = structuredClone(I);
    wrongProducer.stages[2]!.inputBindings[0]!.from = "stage:missing-bank-producer";
    expect(validateUserScenarioDefinition(wrongProducer).join(" ")).toContain("must reference a supported parameter-bank producer");

    const badPolicy = structuredClone(I);
    badPolicy.stages[3]!.settings.requested.mode = "union";
    badPolicy.stages[3]!.settings.effective.mode = "union";
    expect(validateUserScenarioDefinition(badPolicy).join(" ")).toContain("supported difference mode");
  });
});

describe("J text limit and assemble scenario contract", () => {
  it("registers ordered typed text inputs and valid transform policies", () => {
    expect(validateUserScenarioDefinition(J)).toEqual([]);
    const stages = cloneStagesForScenarioEditor(J.stages, "j-copy");
    expect(stages[2]!.inputBindings.filter((binding) => binding.port !== "order")).toEqual([
      { name: "text", from: `stage:${stages[0]!.stageId}`, port: "result" },
    ]);
    expect(stages[3]!.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.from)).toEqual([
      `stage:${stages[2]!.stageId}`, `stage:${stages[1]!.stageId}`,
    ]);
  });

  it("rejects a missing text source and non-Brief dynamic output", () => {
    const missing = structuredClone(J);
    missing.stages[2]!.inputBindings = [];
    expect(validateUserScenarioDefinition(missing).join(" ")).toContain("requires one compatible text input");
    const dynamicOutput = structuredClone(J);
    dynamicOutput.stages[3]!.settings.requested.outputKind = "text";
    dynamicOutput.stages[3]!.settings.effective.outputKind = "text";
    expect(validateUserScenarioDefinition(dynamicOutput).join(" ")).toContain("Brief output settings");
  });
});

describe("H two-Brief assembly scenario contract", () => {
  it("keeps two ordered Brief bindings and routes their Brief output to Qwen", () => {
    expect(validateUserScenarioDefinition(H)).toEqual([]);
    expect(H.version).toBe(2);
    expect(H.title).toContain("text.assemble");
    const [template, crystal, assembly, qwen] = H.stages;
    expect(assembly!.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.from)).toEqual([
      `stage:${template!.stageId}`, `stage:${crystal!.stageId}`,
    ]);
    expect(qwen!.inputBindings.find((binding) => binding.name === "brief")?.from).toBe(`stage:${assembly!.stageId}`);
  });

  it("keeps AM2 H text-merge semantics as a distinct definition", () => {
    expect(validateUserScenarioDefinition(H_MERGE)).toEqual([]);
    expect(H_MERGE.id).not.toBe(H.id);
    const [template, crystal, merge, qwen] = H_MERGE.stages;
    expect(merge!.actionId).toBe("data.merge");
    expect(merge!.outputDefinitions).toContainEqual({ port: "result", kind: "text", required: true });
    expect(merge!.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.from)).toEqual([
      `stage:${template!.stageId}`, `stage:${crystal!.stageId}`,
    ]);
    expect(qwen!.inputBindings.find((binding) => binding.name === "brief")?.from).toBe(`stage:${merge!.stageId}`);
    expect(merge!.settings.effective.conflicts).toBe("keep_first");
  });
});

describe("E Qwen re-apply scenario contract", () => {
  it("describes the existing explicit Stage Apply path without adding an operator", () => {
    expect(validateUserScenarioDefinition(E)).toEqual([]);
    expect(E.stages.map((stage) => stage.actionId)).toEqual(["brief.from_template", "text.qwen.resolved"]);
    expect(E.preparationPolicies.stageApply).toBe("existing-qwen3-bank-add-missing");
    expect(E.stages[1]!.inputBindings.find((binding) => binding.name === "brief")?.from).toBe(`stage:${E.stages[0]!.stageId}`);
    expect(E.description).toContain("manual value edit and a deletion");
    expect(E.description).toContain("tombstones");
  });
});

describe("K/L control-flow scenario contracts", () => {
  it("preserves K branch ports, skip-aware ordered join policies, and typed bindings", () => {
    expect(validateUserScenarioDefinition(K)).toEqual([]);
    expect(K.stages[4]!.inputBindings.filter((binding) => binding.port !== "order").map((binding) => binding.port)).toEqual(["result", "else"]);
    const invalid = structuredClone(K);
    invalid.stages[2]!.settings.effective.condition = { left: { type: "binding", binding: "missing" }, op: "bogus" };
    expect(validateUserScenarioDefinition(invalid).join(" ")).toContain("condition is invalid");

    const copy = cloneStagesForScenarioEditor(K.stages, "k-copy");
    expect(validateUserScenarioDefinition({ ...K, id: "k-copy", stages: copy })).toEqual([]);
    expect(copy[4]!.settings.effective.policies).toEqual([
      { binding: copy[3]!.stageId, onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
      { binding: copy[2]!.stageId, onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
    ]);
  });

  it("preserves L ordered routes and fallback, rejecting undeclared ports", () => {
    expect(validateUserScenarioDefinition(L)).toEqual([]);
    expect((L.stages[1]!.settings.effective.rules as Array<{ route: string }>).map((rule) => rule.route)).toEqual(["small", "medium", "large"]);
    const invalid = structuredClone(L);
    invalid.stages[1]!.outputDefinitions = invalid.stages[1]!.outputDefinitions.filter((output) => output.port !== "fallback");
    expect(validateUserScenarioDefinition(invalid).join(" ")).toContain("must declare each route");
  });

  it("rejects missing or incompatible branch inputs and unbound join policies", () => {
    const missingFilterInput = structuredClone(K);
    missingFilterInput.stages[3]!.inputBindings = missingFilterInput.stages[3]!.inputBindings.filter((binding) => binding.port === "order");
    expect(validateUserScenarioDefinition(missingFilterInput).join(" ")).toContain("requires one compatible parameter-bank input");

    const wrongIfInput = structuredClone(K);
    wrongIfInput.stages[2]!.inputBindings = wrongIfInput.stages[2]!.inputBindings.map((binding) => binding.name === "input" ? { ...binding, from: `stage:${wrongIfInput.stages[1]!.stageId}` } : binding);
    expect(validateUserScenarioDefinition(wrongIfInput).join(" ")).toContain("requires one parameter-bank input");

    const missingJoinPolicy = structuredClone(K);
    missingJoinPolicy.stages[4]!.settings.effective.policies = [];
    expect(validateUserScenarioDefinition(missingJoinPolicy).join(" ")).toContain("exactly one join policy for every unique source stage");
  });

  it("keeps if/else ports when settings change and derives router ports only from ordered rules", () => {
    const ifStage = K.stages.find((stage) => stage.actionId === "flow.if")!;
    expect(outputDefinitionsForOperatorSettings(ifStage, { condition: { left: { type: "literal", value: 2 }, op: "gt", right: { type: "literal", value: 1 } } }))
      .toEqual(ifStage.outputDefinitions);
    const router = L.stages.find((stage) => stage.actionId === "flow.router")!;
    expect(outputDefinitionsForOperatorSettings(router, { rules: [{ route: "first" }, { route: "second" }], fallbackRoute: "else" }))
      .toEqual([
        { port: "decision", kind: "decision", required: true },
        { port: "first", kind: "parameter-bank", required: false },
        { port: "second", kind: "parameter-bank", required: false },
        { port: "else", kind: "parameter-bank", required: false },
      ]);
  });
});

describe("data.split user scenario contract", () => {
  it("accepts overlapping typed channels with a port for every channel and unmatched rows", () => {
    const qwen = structuredClone(R.stages[1]!);
    qwen.stageId = "split-copy:qwen";
    qwen.inputBindings = [];
    const channels = [
      { name: "even", rule: { type: "by_index_modulo", modulus: 2, remainder: 0 } },
      { name: "lowSimilarity", rule: { type: "by_field", field: "similarity", equals: "0.5" } },
    ];
    const split = {
      ...structuredClone(R.stages[3]!),
      stageId: "split-copy:split",
      actionId: "data.split" as const,
      inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }],
      outputDefinitions: [
        { port: "even", kind: "parameter-bank", required: false },
        { port: "lowSimilarity", kind: "parameter-bank", required: false },
        { port: "unmatched", kind: "parameter-bank", required: false },
      ],
      settings: { requested: { channels }, effective: { channels }, origin: "manual" as const },
    };
    const definition = { ...R, id: "split-copy", stages: [qwen, split] };
    expect(validateUserScenarioDefinition(definition)).toEqual([]);
    expect(outputDefinitionsForOperatorSettings(split, { channels })).toEqual(split.outputDefinitions);
  });

  it("rejects invalid rules, omitted required input, and dynamic output kinds that do not match the input", () => {
    const qwen = structuredClone(R.stages[1]!);
    qwen.stageId = "split-bad:qwen";
    qwen.inputBindings = [];
    const channels = [{ name: "even", rule: { type: "by_index_modulo", modulus: 0, remainder: 4 } }];
    const split = {
      ...structuredClone(R.stages[3]!),
      stageId: "split-bad:split",
      actionId: "data.split" as const,
      inputBindings: [],
      outputDefinitions: [{ port: "even", kind: "record-set", required: false }, { port: "unmatched", kind: "record-set", required: false }],
      settings: { requested: { channels }, effective: { channels }, origin: "manual" as const },
    };
    const issues = validateUserScenarioDefinition({ ...R, id: "split-bad", stages: [qwen, split] }).join(" ");
    expect(issues).toContain("requires one compatible parameter-bank or record-set input");
    expect(issues).toContain("positive integer modulus");
    expect(issues).toContain("outputs must declare each split channel and unmatched using the input kind");
  });
});

describe("data.select user scenario contract", () => {
  it("permits Stage handoff only for a saved parameter-bank selection plan", () => {
    const source = structuredClone(R.stages[1]!);
    source.stageId = "selection-source";
    const select = {
      ...structuredClone(R.stages[3]!), stageId: "selection-result", actionId: "data.select" as const,
      inputBindings: [{ name: "input", from: `stage:${source.stageId}`, port: "result" }],
      outputDefinitions: [{ port: "result", kind: "parameter-bank" as const, required: true }],
      settings: { requested: { mode: "parameters_by_name", fields: ["tempo"] }, effective: { mode: "parameters_by_name", fields: ["tempo"] }, origin: "manual" as const },
    };
    const plan = { scenarioRef: { id: "select-copy", version: 1 }, stages: [source, select] } as unknown as AutomationPlanDocument;
    expect(isSupportedParameterBankTransformPlan(plan, "select-copy", select.stageId)).toBe(true);
    expect(isSupportedParameterBankTransformPlan({ ...plan, stages: [source, { ...select, outputDefinitions: [{ port: "result", kind: "record-set" as const, required: true }] }] }, "select-copy", select.stageId)).toBe(false);
    expect(isSupportedParameterBankTransformPlan({ ...plan, stages: [source, { ...select, settings: { ...select.settings, effective: { mode: "summary", fields: [] } } }] }, "select-copy", select.stageId)).toBe(false);
  });

  it("accepts each supported mode with its declared output kind", () => {
    const qwen = structuredClone(R.stages[1]!);
    qwen.stageId = "select-copy:qwen";
    qwen.inputBindings = [];
    const select = {
      ...structuredClone(R.stages[3]!), stageId: "select-copy:select", actionId: "data.select" as const,
      inputBindings: [{ name: "input", from: `stage:${qwen.stageId}`, port: "result" }],
      outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }],
      settings: { requested: { mode: "parameters_by_name", fields: ["tempo"] }, effective: { mode: "parameters_by_name", fields: ["tempo"] }, origin: "manual" as const },
    };
    const definition = { ...R, id: "select-copy", stages: [qwen, select] };
    expect(validateUserScenarioDefinition(definition)).toEqual([]);
    expect(outputDefinitionsForOperatorSettings(select, { mode: "fields", fields: ["category"] })).toEqual([{ port: "result", kind: "record-set", required: true }]);
    expect(outputDefinitionsForOperatorSettings(select, { mode: "parameters_by_name", fields: ["tempo"] })).toEqual([{ port: "result", kind: "parameter-bank", required: true }]);
  });

  it("rejects missing names, a wrong input kind and an output kind inconsistent with the mode", () => {
    const brief = { ...structuredClone(R.stages[0]!), stageId: "select-bad:brief", inputBindings: [] };
    const select = {
      ...structuredClone(R.stages[3]!), stageId: "select-bad:select", actionId: "data.select" as const,
      inputBindings: [{ name: "input", from: `stage:${brief.stageId}`, port: "result" }],
      outputDefinitions: [{ port: "result", kind: "record-set", required: true }],
      settings: { requested: { mode: "parameters_by_name", fields: [] }, effective: { mode: "parameters_by_name", fields: [] }, origin: "manual" as const },
    };
    const issues = validateUserScenarioDefinition({ ...R, id: "select-bad", stages: [brief, select] }).join(" ");
    expect(issues).toContain("requires one input compatible with data.select mode");
    expect(issues).toContain("DATA_SELECT_FIELDS_REQUIRED");
    expect(issues).toContain("must output 'parameter-bank'");
  });
});

describe("data.split Stage handoff plan", () => {
  it("allows a named parameter-bank port only when it matches saved channels", () => {
    const source = structuredClone(R.stages[1]!);
    source.stageId = "split-source";
    const split = {
      ...structuredClone(R.stages[3]!), stageId: "split-result", actionId: "data.split" as const,
      inputBindings: [{ name: "input", from: `stage:${source.stageId}`, port: "result" }],
      outputDefinitions: [
        { port: "even", kind: "parameter-bank" as const, required: false },
        { port: "unmatched", kind: "parameter-bank" as const, required: false },
      ],
      settings: { requested: { channels: [{ name: "even", rule: { type: "by_index_modulo", modulus: 2, remainder: 0 } }] }, effective: { channels: [{ name: "even", rule: { type: "by_index_modulo", modulus: 2, remainder: 0 } }] }, origin: "manual" as const },
    };
    const plan = { scenarioRef: { id: "split-copy", version: 1 }, stages: [source, split] } as unknown as AutomationPlanDocument;
    expect(isSupportedParameterBankTransformPlan(plan, "split-copy", split.stageId)).toBe(true);
    expect(isSupportedParameterBankTransformPlan({ ...plan, stages: [source, { ...split, outputDefinitions: [split.outputDefinitions[0]!] }] }, "split-copy", split.stageId)).toBe(false);
    expect(isSupportedParameterBankTransformPlan({ ...plan, stages: [source, { ...split, settings: { ...split.settings, effective: { channels: [] } } }] }, "split-copy", split.stageId)).toBe(false);
  });
});

describe("data operator editor settings", () => {
  it("persists select mode and keeps its output contract synchronized", () => {
    const select = { ...structuredClone(R.stages[3]!), actionId: "data.select" as const };
    const updated = updateDataOperatorSettings(select, { mode: "fields", fields: ["technical_name", "category"] });
    expect(updated.settings).toMatchObject({ origin: "manual", requested: { mode: "fields", fields: ["technical_name", "category"] }, effective: { mode: "fields", fields: ["technical_name", "category"] } });
    expect(updated.outputDefinitions).toEqual([{ port: "result", kind: "record-set", required: true }]);
  });

  it("keeps split output ports synchronized with edited channels", () => {
    const split = { ...structuredClone(R.stages[3]!), actionId: "data.split" as const };
    const updated = updateDataOperatorSettings(split, { channels: [{ name: "priority", rule: { type: "index_range", from: 0, to: 2 } }] });
    expect(updated.outputDefinitions.map((output) => output.port)).toEqual(["priority", "unmatched"]);
    expect(updated.settings.origin).toBe("manual");
  });

  it("leaves unrelated nodes untouched", () => {
    const brief = structuredClone(R.stages[0]!);
    expect(updateDataOperatorSettings(brief, { mode: "fields" })).toBe(brief);
  });
});

describe("general data.merge editor bindings", () => {
  it("accepts repeated typed sources and rejects mixing unlike kinds", () => {
    const definition = structuredClone(R);
    const merge = definition.stages[3]!;
    merge.inputBindings = [
      { name: "sources", from: `stage:${definition.stages[1]!.stageId}`, port: "result" },
      { name: "sources", from: `stage:${definition.stages[2]!.stageId}`, port: "result" },
    ];
    expect(validateUserScenarioDefinition(definition)).toEqual([]);

    merge.inputBindings[1] = { name: "sources", from: `stage:${definition.stages[0]!.stageId}`, port: "result" };
    expect(validateUserScenarioDefinition(definition).join(" ")).toContain("must all share one compatible bank, record-set, or text type");
  });

  it("connects compatible same-kind sources and derives the result kind", () => {
    const merge = { ...structuredClone(R.stages[3]!), stageId: "generic-merge", inputBindings: [], outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }] };
    const countA = { ...structuredClone(R.stages[3]!), stageId: "count-a", actionId: "data.count" as const, inputBindings: [], outputDefinitions: [{ port: "result", kind: "record-set", required: true }] };
    const countB = { ...countA, stageId: "count-b" };
    const afterA = updateMergeSourceBinding(merge, countA, [countA, merge], true);
    const afterB = updateMergeSourceBinding(afterA, countB, [countA, countB, afterA], true);

    expect(afterB.inputBindings.filter((binding) => binding.port !== "order")).toEqual([
      { name: "sources", from: "stage:count-a", port: "result" },
      { name: "sources", from: "stage:count-b", port: "result" },
    ]);
    expect(afterB.outputDefinitions).toEqual([{ port: "result", kind: "record-set", required: true }]);
    expect(portsForStage(afterB, [countA, countB, afterB])?.inputs).toEqual([
      { id: "sources", kind: "parameter-bank", required: true, multiple: true, accepts: ["parameter-bank", "record-set", "brief", "text"] },
    ]);
  });

  it("keeps the legacy R merge bindings and stage-apply shape", () => {
    const merge = structuredClone(R.stages[3]!);
    const qwen = structuredClone(R.stages[1]!);
    const gemma = structuredClone(R.stages[2]!);
    const changed = updateMergeSourceBinding(merge, qwen, [qwen, gemma, merge], true);
    expect(changed.inputBindings.filter((binding) => binding.port !== "order")).toEqual(merge.inputBindings.filter((binding) => binding.port !== "order"));
    expect(validateUserScenarioDefinition({ ...R, stages: R.stages })).toEqual([]);
  });
});

describe("flow.join editor settings", () => {
  it("stores explicit per-source policies in requested and effective settings", () => {
    const join = structuredClone(K.stages.find((stage) => stage.actionId === "flow.join")!);
    const policies = [{ binding: "source-a", onSkipped: "fail", onFailed: "omit", onPartial: "accept" }];
    const updated = updateFlowJoinPolicies(join, policies);
    expect(updated.settings).toMatchObject({ origin: "manual", requested: { policies }, effective: { policies } });
  });

  it("leaves non-join nodes untouched", () => {
    const filter = structuredClone(K.stages.find((stage) => stage.actionId === "data.filter")!);
    expect(updateFlowJoinPolicies(filter, [])).toBe(filter);
  });
});

describe("FlowMusic export editor validation", () => {
  it("rejects out-of-range blend weight before a user scenario can be saved", () => {
    const definition = structuredClone(AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-flowmusic-export-q")!);
    const stage = definition.stages.find((item) => item.actionId === "flowmusic.export")!;
    stage.settings.requested.clapWeight = -0.01;
    stage.settings.effective.clapWeight = -0.01;
    expect(validateUserScenarioDefinition(definition).some((issue) => issue.includes("finite CLAP weight from 0 to 1"))).toBe(true);
  });

  it("rejects non-boolean FlowMusic toggles before save", () => {
    const definition = structuredClone(AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-flowmusic-export-q")!);
    const stage = definition.stages.find((item) => item.actionId === "flowmusic.export")!;
    stage.settings.effective.blend = "yes";
    expect(validateUserScenarioDefinition(definition).some((issue) => issue.includes("blend must be boolean"))).toBe(true);
  });
});
