import { describe, expect, it } from "vitest";
import { dataSplitOutputDefinitions, splitAutomationArtifact, validateDataSplitChannels } from "./data-split";

const channels = [
  { name: "even", rule: { type: "by_index_modulo", modulus: 2, remainder: 0 } },
  { name: "firstTwo", rule: { type: "index_range", from: 0, to: 1 } },
] as const;

describe("Automation data.split", () => {
  it("fans rows out to every matching channel and preserves the source envelope and provenance", () => {
    const input = { artifactId: "source-artifact", kind: "parameter-bank", data: { schema: "am2_param_bank_v1", parameters: [{ technical_name: "a", current_value: 1 }, { technical_name: "b", current_value: 2 }, { technical_name: "c", current_value: 3 }], provenance: { a: { artifactId: "winner-a" }, b: { artifactId: "winner-b" }, c: { artifactId: "winner-c" } }, inputRefs: ["older-source"] } };
    const result = splitAutomationArtifact(input, [...channels]);
    expect(result.channels.map((channel) => [channel.name, channel.rows.map((row) => row.technical_name)])).toEqual([["even", ["a", "c"]], ["firstTwo", ["a", "b"]]]);
    expect(result.unmatched.rows).toEqual([]);
    expect(result.channels[0]?.data).toMatchObject({ schema: "am2_param_bank_v1", channel: "even", inputRefs: ["source-artifact"], parameters: [{ technical_name: "a" }, { technical_name: "c" }], provenance: { a: { artifactId: "winner-a" }, c: { artifactId: "winner-c" } } });
    expect(input.data.parameters).toHaveLength(3);
  });

  it("returns unmatched rows only when no channel accepts them and keeps record-set shape", () => {
    const result = splitAutomationArtifact({ artifactId: "records", kind: "record-set", data: { schema: "am2_record_set_v1", fields: ["name"], records: [{ name: "one" }, { name: "two" }, { name: "three" }] } }, [
      { name: "one", rule: { type: "by_field", field: "name", equals: "one" } },
    ]);
    expect(result.channels[0]?.data).toMatchObject({ schema: "am2_record_set_v1", fields: ["name"], channel: "one", inputRefs: ["records"], records: [{ name: "one" }] });
    expect(result.unmatched.data).toMatchObject({ channel: "unmatched", records: [{ name: "two" }, { name: "three" }] });
    expect(result.unmatchedCount).toBe(2);
  });

  it("preserves array-shaped artifact data without wrapping or mutating it", () => {
    const input = { artifactId: "array-bank", kind: "parameter-bank", data: [{ technical_name: "a" }, { technical_name: "b" }] };
    const result = splitAutomationArtifact(input, [
      { name: "first", rule: { type: "index_range", from: 0, to: 0 } },
    ]);
    expect(result.channels[0]?.data).toEqual([{ technical_name: "a" }]);
    expect(result.unmatched.data).toEqual([{ technical_name: "b" }]);
    expect(input.data).toEqual([{ technical_name: "a" }, { technical_name: "b" }]);
  });

  it("validates named channels and emits one typed port per channel plus unmatched", () => {
    expect(validateDataSplitChannels(channels)).toEqual([]);
    expect(validateDataSplitChannels([{ name: "unmatched", rule: { type: "by_index_modulo", modulus: 0, remainder: 0 } }]).join(" ")).toMatch(/reserved|positive integer/u);
    expect(dataSplitOutputDefinitions(channels, "record-set")).toEqual([
      { port: "even", kind: "record-set", required: false },
      { port: "firstTwo", kind: "record-set", required: false },
      { port: "unmatched", kind: "record-set", required: false },
    ]);
  });
});
