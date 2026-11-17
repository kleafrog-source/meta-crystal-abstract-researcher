import { describe, expect, it } from "vitest";
import { selectAutomationData, validateDataSelectSettings } from "./data-select";

describe("Automation data.select", () => {
  it("selects named parameters in source order and reports requested names that are missing", () => {
    const input = { artifactId: "bank-1", kind: "parameter-bank", data: { parameters: [
      { technical_name: "a", current_value: 1, catalogue_id: "source-a" },
      { technical_name: "b", current_value: 2, catalogue_id: "source-b" },
      { technical_name: "c", current_value: 3, catalogue_id: "source-c" },
    ], provenance: { a: { sourceArtifactId: "source-a" }, b: { sourceArtifactId: "source-b" }, c: { sourceArtifactId: "source-c" } } } };
    const result = selectAutomationData(input, "parameters_by_name", ["c", "a", "missing"]);
    expect(result.kind).toBe("parameter-bank");
    expect(result.data).toMatchObject({ schema: "am2_param_bank_v1", parameters: [{ technical_name: "a", catalogue_id: "source-a" }, { technical_name: "c", catalogue_id: "source-c" }] });
    expect(result.data).toMatchObject({ provenance: { a: { sourceArtifactId: "source-a" }, c: { sourceArtifactId: "source-c" } } });
    expect(result.inputRefs).toEqual(["bank-1"]);
    expect(result.warnings).toEqual(["Missing parameters: missing"]);
    expect(input.data.parameters).toHaveLength(3);
  });

  it("projects declared fields from normalized banks and preserves record order", () => {
    const result = selectAutomationData({ artifactId: "bank-2", kind: "parameter-bank", data: [
      { technical_name: "a", category: "Rhythm", current_value: 120, private_payload: "not part of AM2's bank projection" },
      { technical_name: "b", category: "Space", current_value: 3 },
    ] }, "fields", ["technical_name", "category"]);
    expect(result.kind).toBe("record-set");
    expect(result.data).toEqual({ schema: "am2_record_set_v1", fields: ["technical_name", "category"], records: [{ technical_name: "a", category: "Rhythm" }, { technical_name: "b", category: "Space" }], sourceKind: "parameter-bank" });
    expect(result.inputRefs).toEqual(["bank-2"]);
  });

  it("preserves typed selection/default metadata without substituting a default for a missing value", () => {
    const result = selectAutomationData({ artifactId: "typed-bank", kind: "parameter-bank", data: { parameters: [
      { technical_name: "array_value", ui_element: "Array", default: [1, 2], catalogue_default: [1, 2], value_status: "selected", selected_value: [4, 5], selection_evidence: { candidate_scores: [{ candidate: [4, 5], score: 0.91 }] } },
      { technical_name: "not_selected", ui_element: "String", default: "catalogue", catalogue_default: "catalogue", value_status: "domain_unavailable", selection_detail: "No declared domain." },
    ] } }, "fields", ["technical_name", "default", "catalogue_default", "selected_value", "current_value", "value_status", "selection_detail", "selection_evidence"]);

    expect(result.data).toMatchObject({ records: [
      { technical_name: "array_value", default: [1, 2], catalogue_default: [1, 2], selected_value: [4, 5], value_status: "selected", selection_evidence: { candidate_scores: [{ candidate: [4, 5], score: 0.91 }] } },
      { technical_name: "not_selected", default: "catalogue", catalogue_default: "catalogue", value_status: "domain_unavailable", selection_detail: "No declared domain." },
    ] });
    const records = (result.data as { records: Array<Record<string, unknown>> }).records;
    expect(records[1]).not.toHaveProperty("current_value");
  });

  it("projects record-set fields and preserves summary provenance and count", () => {
    const source = { artifactId: "records-1", kind: "record-set", validity: "partial", data: { records: [{ route: "then", count: 2, extra: true }] } };
    expect(selectAutomationData(source, "fields", ["route"]).data).toMatchObject({ records: [{ route: "then" }], sourceKind: "record-set" });
    expect(selectAutomationData(source, "summary", []).data).toMatchObject({ records: [
      { field: "artifactId", value: "records-1" }, { field: "kind", value: "record-set" }, { field: "count", value: 1 }, { field: "validity", value: "partial" },
    ] });
  });

  it("rejects invalid modes and empty dynamic field lists", () => {
    expect(validateDataSelectSettings("fields", [])).toContain("DATA_SELECT_FIELDS_REQUIRED: this mode requires a non-empty list of names or fields.");
    expect(() => selectAutomationData({ kind: "record-set", data: { records: [] } }, "parameters_by_name", ["x"]))
      .toThrow("DATA_SELECT_INPUT_KIND_INVALID");
  });
});
