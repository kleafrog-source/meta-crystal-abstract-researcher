import { describe, expect, it } from "vitest";
import { applyFlowJoinPolicies, countFlowRows, evaluateFirstMatchRouter, evaluateFlowCondition, filterFlowRows, joinParameterBankRows, summarizeFlowArtifact, validateFlowCondition, type FlowRule } from "./control-flow";

const bank = (rows: Array<Record<string, unknown>>, artifactId = "bank-a") => ({ artifactId, actionId: "text.qwen.resolved", kind: "parameter-bank", validity: "valid", data: rows });

describe("Automation data and control operators", () => {
  it("counts bank entries and filters rows with AND-combined typed rules", () => {
    const input = bank([{ technical_name: "a", similarity: 0.8 }, { technical_name: "b", similarity: 0.2 }]);
    expect(countFlowRows(input).total).toBe(2);
    expect(filterFlowRows(input, [{ field: "similarity", op: "gt", value: 0.5 }])).toEqual([{ technical_name: "a", similarity: 0.8 }]);
  });

  it("creates the AM2 summary record-set with exact count, fields and source identity", () => {
    expect(summarizeFlowArtifact({ ...bank([{ technical_name: "tone", current_value: "warm", default: "neutral" }, { technical_name: "space", default: "wide" }], "filtered-1"), validity: "valid" })).toEqual({
      schema: "am2_record_set_v1",
      fields: ["field", "value"],
      records: [
        { field: "artifactId", value: "filtered-1" }, { field: "kind", value: "parameter-bank" },
        { field: "count", value: 2 }, { field: "validity", value: "valid" },
        { field: "tone", value: "warm" }, { field: "space", value: "wide" },
      ],
      sourceKind: "parameter-bank",
    });
  });

  it("evaluates explicit conditions against artifact properties and rejects invalid conditions", () => {
    const input = bank([{ technical_name: "a" }, { technical_name: "b" }]);
    const condition = { left: { type: "binding", binding: "input", property: "count" }, op: "gt", right: { type: "literal", value: 1 } } as const;
    expect(validateFlowCondition(condition)).toBeNull();
    expect(evaluateFlowCondition(condition, { input }, {}).result).toBe(true);
    expect(validateFlowCondition({ left: { type: "binding", binding: "input" }, op: "unknown", right: { type: "literal", value: 1 } })).toContain("operator");
  });

  it("routes by first match in author order and uses fallback only when none match", () => {
    const input = bank([{ technical_name: "a" }, { technical_name: "b" }, { technical_name: "c" }, { technical_name: "d" }]);
    const rules: FlowRule[] = [
      { id: "small", route: "small", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "lt", right: { type: "literal", value: 5 } } },
      { id: "medium", route: "medium", condition: { left: { type: "binding", binding: "input", property: "count" }, op: "lte", right: { type: "literal", value: 7 } } },
    ];
    expect(evaluateFirstMatchRouter({ rules, fallbackRoute: "fallback", bindings: { input }, settings: {} })).toMatchObject({ routes: ["small"], usedFallback: false });
    expect(evaluateFirstMatchRouter({ rules: [], fallbackRoute: "fallback", bindings: { input }, settings: {} })).toMatchObject({ routes: ["fallback"], usedFallback: true });
  });

  it("applies skipped/failed/partial join policies and keeps only accepted inputs", () => {
    const states = [
      { key: "stage:filter#result", status: "skipped" as const },
      { key: "stage:passthrough#else", status: "present" as const, artifact: bank([{ technical_name: "kept" }], "else-artifact") },
      { key: "stage:optional#result", status: "failed" as const },
      { key: "stage:partial#result", status: "partial" as const, artifact: { artifactId: "partial", kind: "parameter-bank", data: [] } },
    ];
    expect(applyFlowJoinPolicies(states, [
      { binding: "stage:filter", onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
      { binding: "stage:optional", onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
      { binding: "stage:partial", onSkipped: "omit", onFailed: "omit", onPartial: "omit" },
    ])).toMatchObject({ accepted: [states[1]], failures: [], noAcceptedInputs: false });
    expect(applyFlowJoinPolicies([{ key: "stage:all-skipped#then", status: "skipped" }], []).noAcceptedInputs).toBe(true);
    expect(applyFlowJoinPolicies([{ key: "stage:required#result", status: "failed" }], [{ binding: "stage:required", onSkipped: "omit", onFailed: "fail", onPartial: "accept" }]).failures).toEqual(["stage:required#result"]);
  });

  it("joins bank rows in input order and retains winning source provenance", () => {
    expect(joinParameterBankRows([
      { artifactId: "qwen", actionId: "text.qwen.resolved", rows: [{ technical_name: "shared", current_value: 1 }, { technical_name: "q-only" }] },
      { artifactId: "gemma", actionId: "text.gemma.awtd", rows: [{ technical_name: "shared", current_value: 2 }, { technical_name: "g-only" }] },
    ])).toEqual({
      parameters: [{ technical_name: "shared", current_value: 1 }, { technical_name: "q-only" }, { technical_name: "g-only" }],
      provenance: {
        shared: { sourceArtifactId: "qwen", sourceActionId: "text.qwen.resolved" },
        "q-only": { sourceArtifactId: "qwen", sourceActionId: "text.qwen.resolved" },
        "g-only": { sourceArtifactId: "gemma", sourceActionId: "text.gemma.awtd" },
      },
    });
  });
});
