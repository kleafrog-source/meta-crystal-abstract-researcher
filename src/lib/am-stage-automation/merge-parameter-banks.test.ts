import { describe, expect, it } from "vitest";
import { AUTOMATION_SCENARIOS } from "./catalog";
import { mergeParameterBanks } from "./merge-parameter-banks";

const policies = { duplicates: "keep_first" as const, conflicts: "keep_first" as const };
const bank = (artifactId: string, actionId: string, parameters: Record<string, unknown>[]) => ({ artifactId, actionId, data: parameters });
const row = (technical_name: string, current_value: unknown, extra: Record<string, unknown> = {}) => ({ technical_name, current_value, suggested_value: current_value, source_payload: { keep: true }, ...extra });

describe("mergeParameterBanks", () => {
  it("defines R with the existing bank actions and explicit ordered merge inputs", () => {
    const scenario = AUTOMATION_SCENARIOS.find((item) => item.id === "catalogue-bank-merge-r");
    expect(scenario?.stages.map((stage) => stage.actionId)).toEqual([
      "brief.from_template", "text.qwen.resolved", "text.gemma.awtd", "data.merge",
    ]);
    expect(scenario?.acceptedInputs).toEqual(["templateVariables", "brief"]);
    expect(scenario?.stages[0].settings.effective.templateBrief).toBe("Ambient electronic cue with {{mood}} texture and {{space}} space");
    expect(scenario?.preparationPolicies.searchMode).toBe("single");
    expect(scenario?.stages[1].settings.effective.topK).toBe(12);
    expect(scenario?.stages[2].settings.effective.topK).toBe(8);
    expect(scenario?.stages[3].inputBindings.filter((binding) => binding.port !== "order").map((binding) => [binding.name, binding.from])).toEqual([
      ["qwenBank", "stage:catalogue-bank-merge-r:02:text-qwen-resolved"],
      ["gemmaBank", "stage:catalogue-bank-merge-r:03:text-gemma-awtd"],
    ]);
    expect(scenario?.stages[3].settings.effective).toEqual({ duplicates: "keep_first", conflicts: "keep_first" });
  });

  it("unions disjoint banks in input and row order with original fields and provenance", () => {
    const result = mergeParameterBanks([
      bank("qwen-art", "text.qwen.resolved", [row("a", 1, { qwenOnly: "kept" }), row("b", 2)]),
      bank("gemma-art", "text.gemma.awtd", [row("c", 3, { gemmaOnly: true })]),
    ], policies);

    expect(result.parameters).toEqual([row("a", 1, { qwenOnly: "kept" }), row("b", 2), row("c", 3, { gemmaOnly: true })]);
    expect(result.provenance).toEqual({
      a: { sourceArtifactId: "qwen-art", sourceActionId: "text.qwen.resolved" },
      b: { sourceArtifactId: "qwen-art", sourceActionId: "text.qwen.resolved" },
      c: { sourceArtifactId: "gemma-art", sourceActionId: "text.gemma.awtd" },
    });
    expect(result.duplicates).toBe(0);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps the first identical duplicate and reports its winning source", () => {
    const result = mergeParameterBanks([
      bank("first", "text.qwen.resolved", [row("same", 7, { sourceField: "first" })]),
      bank("second", "text.gemma.awtd", [row("same", 7, { sourceField: "second" })]),
    ], policies);

    expect(result.parameters).toEqual([row("same", 7, { sourceField: "first" })]);
    expect(result.provenance.same).toEqual({ sourceArtifactId: "first", sourceActionId: "text.qwen.resolved" });
    expect(result.duplicates).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it("compares typed selected arrays while preserving unselected rows without default substitution", () => {
    const first = { technical_name: "array", default: [1], catalogue_default: [1], value_status: "selected", selected_value: [2, 3] };
    const second = { technical_name: "array", default: [1], catalogue_default: [1], value_status: "selected", selected_value: [8, 9] };
    const merged = mergeParameterBanks([
      bank("array-a", "text.qwen.resolved", [first]),
      bank("array-b", "text.gemma.awtd", [second]),
    ], { duplicates: "keep_first", conflicts: "keep_last" });
    expect(merged.parameters[0]?.selected_value).toEqual([8, 9]);
    expect(merged.provenance.array.sourceArtifactId).toBe("array-b");

    const unselected = mergeParameterBanks([
      bank("unselected-a", "text.qwen.resolved", [{ technical_name: "missing", default: 12, value_status: "artifacts_required" }]),
      bank("unselected-b", "text.gemma.awtd", [{ technical_name: "missing", default: 99, value_status: "artifacts_required" }]),
    ], { duplicates: "keep_first", conflicts: "error" });
    expect(unselected.parameters[0]).toMatchObject({ technical_name: "missing", default: 12, value_status: "artifacts_required" });
    expect(unselected.parameters[0]).not.toHaveProperty("current_value");
    expect(unselected.conflicts).toEqual([]);
  });

  it("applies keep_first and keep_last independently for conflicting values without moving order", () => {
    const inputs = [
      bank("first", "text.qwen.resolved", [row("a", 1), row("b", 2)]),
      bank("second", "text.gemma.awtd", [row("a", 9), row("c", 3)]),
    ] as const;
    const first = mergeParameterBanks(inputs, { duplicates: "keep_first", conflicts: "keep_first" });
    const last = mergeParameterBanks(inputs, { duplicates: "keep_first", conflicts: "keep_last" });

    expect(first.parameters.map((entry) => [entry.technical_name, entry.current_value])).toEqual([["a", 1], ["b", 2], ["c", 3]]);
    expect(first.provenance.a.sourceArtifactId).toBe("first");
    expect(last.parameters.map((entry) => [entry.technical_name, entry.current_value])).toEqual([["a", 9], ["b", 2], ["c", 3]]);
    expect(last.provenance.a.sourceArtifactId).toBe("second");
    expect(last.duplicates).toBe(1);
    expect(last.conflicts).toEqual([{ key: "a", first: 1, second: 9 }]);
  });

  it("uses duplicate policy for identical rows and preserves the original key slot", () => {
    const result = mergeParameterBanks([
      bank("first", "text.qwen.resolved", [row("a", 1), row("b", 2)]),
      bank("second", "text.gemma.awtd", [row("a", 1, { sourceField: "last" })]),
    ], { duplicates: "keep_last", conflicts: "keep_first" });

    expect(result.parameters.map((entry) => entry.technical_name)).toEqual(["a", "b"]);
    expect(result.parameters[0]).toEqual(row("a", 1, { sourceField: "last" }));
    expect(result.provenance.a.sourceArtifactId).toBe("second");
  });

  it("throws distinct errors for identical duplicates and conflicting values when error policies apply", () => {
    expect(() => mergeParameterBanks([
      bank("first", "text.qwen.resolved", [row("a", 1)]), bank("second", "text.gemma.awtd", [row("a", 1)]),
    ], { duplicates: "error", conflicts: "keep_first" })).toThrow(/MERGE_DUPLICATE/u);
    expect(() => mergeParameterBanks([
      bank("first", "text.qwen.resolved", [row("a", 1)]), bank("second", "text.gemma.awtd", [row("a", 2)]),
    ], { duplicates: "keep_last", conflicts: "error" })).toThrow(/MERGE_CONFLICT/u);
  });

  it("accepts empty banks and does not mutate either input", () => {
    const firstRows = [row("a", 1)];
    const secondRows = [row("a", 5), row("b", 2)];
    const before = structuredClone([firstRows, secondRows]);
    const result = mergeParameterBanks([bank("first", "text.qwen.resolved", firstRows), bank("second", "text.gemma.awtd", secondRows)], policies);

    expect(result.parameters).toHaveLength(2);
    expect(mergeParameterBanks([bank("empty-a", "text.qwen.resolved", []), bank("empty-b", "text.gemma.awtd", [])], policies).parameters).toEqual([]);
    expect(mergeParameterBanks([bank("empty", "text.qwen.resolved", []), bank("nonempty", "text.gemma.awtd", [row("x", 4)])], policies).parameters).toEqual([row("x", 4)]);
    expect([firstRows, secondRows]).toEqual(before);
  });
});
