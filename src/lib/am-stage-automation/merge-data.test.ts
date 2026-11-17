import { describe, expect, it } from "vitest";
import { mergeAutomationArtifacts } from "./merge-data";

const options = { duplicates: "keep_first" as const, conflicts: "keep_last" as const };
const artifact = (artifactId: string, actionId: string, kind: string, data: unknown) => ({ artifactId, actionId, kind, data });

describe("mergeAutomationArtifacts", () => {
  it("merges two through eight parameter banks in binding order and keeps winning provenance", () => {
    const merged = mergeAutomationArtifacts([
      artifact("a", "text.qwen.resolved", "parameter-bank", { parameters: [{ technical_name: "shared", current_value: 1, sourceField: "a" }] }),
      artifact("b", "text.gemma.awtd", "parameter-bank", { parameters: [{ technical_name: "shared", current_value: 2, sourceField: "b" }] }),
      artifact("c", "audio.clap.resolved", "parameter-bank", { parameters: [{ technical_name: "c", current_value: 3 }] }),
    ], options);

    expect(merged.kind).toBe("parameter-bank");
    expect(merged.data).toMatchObject({
      schema: "am_stage_merged_parameter_bank_v1",
      parameters: [{ technical_name: "shared", current_value: 2, sourceField: "b" }, { technical_name: "c", current_value: 3 }],
      provenance: { shared: { sourceArtifactId: "b", sourceActionId: "text.gemma.awtd" } },
      merge: { inputs: [{ artifactId: "a", actionId: "text.qwen.resolved" }, { artifactId: "b", actionId: "text.gemma.awtd" }, { artifactId: "c", actionId: "audio.clap.resolved" }] },
    });
    expect(merged.metrics.inputCount).toBe(3);
  });

  it("merges keyed record sets, preserving input order, winner source and fields", () => {
    const merged = mergeAutomationArtifacts([
      artifact("records-a", "data.select", "record-set", { records: [{ id: "x", value: 1, onlyA: true }] }),
      artifact("records-b", "data.count", "record-set", { records: [{ id: "x", value: 2, onlyB: true }, { id: "y", value: 3 }] }),
    ], { ...options, fieldKey: "id" });

    expect(merged.kind).toBe("record-set");
    expect(merged.data).toMatchObject({
      schema: "am2_record_set_v1",
      fields: ["id", "value", "onlyB"],
      records: [{ id: "x", value: 2, onlyB: true }, { id: "y", value: 3 }],
      provenance: { x: { sourceArtifactId: "records-b", sourceActionId: "data.count" } },
      inputRefs: ["records-a", "records-b"],
    });
  });

  it("keeps duplicate and conflicting record policies distinct", () => {
    const first = artifact("first", "data.select", "record-set", { records: [{ id: "a", value: 1, label: "first" }] });
    const identical = artifact("identical", "data.select", "record-set", { records: [{ id: "a", value: 1, label: "identical" }] });
    const conflict = artifact("conflict", "data.select", "record-set", { records: [{ id: "a", value: 2, label: "conflict" }] });

    expect(() => mergeAutomationArtifacts([first, identical], { ...options, fieldKey: "id", duplicates: "error" })).toThrow(/MERGE_DUPLICATE/u);
    expect(() => mergeAutomationArtifacts([first, conflict], { ...options, fieldKey: "id", conflicts: "error" })).toThrow(/MERGE_CONFLICT/u);
    const keptLast = mergeAutomationArtifacts([first, conflict], { ...options, fieldKey: "id", conflicts: "keep_last" });
    expect(keptLast.data).toMatchObject({
      records: [{ id: "a", value: 2, label: "conflict" }],
      provenance: { a: { sourceArtifactId: "conflict", sourceActionId: "data.select" } },
    });
  });

  it("joins text-like artifacts in binding order with explicit separator and refs", () => {
    const merged = mergeAutomationArtifacts([
      artifact("brief-a", "brief.from_template", "brief", { text: "first" }),
      artifact("text-b", "text.limit", "text", { text: "second" }),
    ], { ...options, textSeparator: " | " });

    expect(merged.kind).toBe("text");
    expect(merged.data).toMatchObject({ schema: "am2_text_v1", text: "first | second", parts: 2, inputRefs: ["brief-a", "text-b"] });
  });

  it("accepts empty record-set and text payloads without inventing rows or losing references", () => {
    const records = mergeAutomationArtifacts([
      artifact("records-empty-a", "data.select", "record-set", { records: [] }),
      artifact("records-empty-b", "data.select", "record-set", { records: [] }),
    ], options);
    const texts = mergeAutomationArtifacts([
      artifact("text-empty-a", "brief.from_template", "brief", { text: "" }),
      artifact("text-empty-b", "text.limit", "text", { text: "" }),
    ], options);

    expect(records.data).toMatchObject({ records: [], inputRefs: ["records-empty-a", "records-empty-b"] });
    expect(records.metrics).toEqual({ inputCount: 2, total: 0, duplicates: 0, conflicts: 0 });
    expect(texts.data).toMatchObject({ text: "", parts: 0, inputRefs: ["text-empty-a", "text-empty-b"] });
    expect(texts.metrics).toEqual({ inputCount: 2, total: 0, duplicates: 0, conflicts: 0 });
  });

  it("rejects fewer than two, more than eight, missing provenance and mixed type groups", () => {
    const bank = (id: string) => artifact(id, "text.qwen.resolved", "parameter-bank", { parameters: [] });
    expect(() => mergeAutomationArtifacts([bank("one")], options)).toThrow(/MERGE_INPUT_COUNT_INVALID/u);
    expect(() => mergeAutomationArtifacts(Array.from({ length: 9 }, (_, index) => bank(String(index))), options)).toThrow(/MERGE_INPUT_COUNT_INVALID/u);
    expect(() => mergeAutomationArtifacts([bank("a"), artifact("b", "brief.from_template", "brief", { text: "x" })], options)).toThrow(/MERGE_KIND_MISMATCH/u);
    expect(() => mergeAutomationArtifacts([bank("a"), { ...bank("b"), artifactId: "" }], options)).toThrow(/MERGE_PROVENANCE_REQUIRED/u);
  });
});
