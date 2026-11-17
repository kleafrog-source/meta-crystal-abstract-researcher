import { describe, expect, it } from "vitest";
import { intersectParameterBanks, subtractParameterBanks } from "./bank-set-operations";

const a = { artifactId: "a-artifact", actionId: "text.qwen.resolved", data: { parameters: [
  { technical_name: "shared", current_value: 1, source: "retrieval", extra: "A" },
  { technical_name: "a-only", current_value: 2, source: "retrieval" },
] } };
const b = { artifactId: "b-artifact", actionId: "text.gemma.awtd", data: { parameters: [
  { technical_name: "b-only", current_value: 3, source: "retrieval" },
  { technical_name: "shared", current_value: 9, source: "retrieval", extra: "B" },
] } };

describe("parameter bank set operations", () => {
  it("intersects by stable key, preserves chosen source fields/order and winning provenance", () => {
    const beforeA = structuredClone(a); const beforeB = structuredClone(b);
    const fromA = intersectParameterBanks([a, b], "from_a");
    expect(fromA.parameters).toEqual([{ technical_name: "shared", current_value: 1, source: "retrieval", extra: "A" }]);
    expect(fromA.provenance.shared).toEqual({ sourceArtifactId: "a-artifact", sourceActionId: "text.qwen.resolved" });
    expect(fromA.inputRefs).toEqual(["a-artifact", "b-artifact"]);
    expect(intersectParameterBanks([a, b], "from_b").parameters).toEqual([{ technical_name: "shared", current_value: 9, source: "retrieval", extra: "B" }]);
    expect(intersectParameterBanks([a, b], "from_b").provenance.shared.sourceArtifactId).toBe("b-artifact");
    expect(a).toEqual(beforeA); expect(b).toEqual(beforeB);
  });

  it.each([
    ["a_minus_b", ["a-only"]],
    ["b_minus_a", ["b-only"]],
    ["symmetric", ["a-only", "b-only"]],
  ] as const)("difference %s preserves deterministic source order and provenance", (mode, expected) => {
    const result = subtractParameterBanks([a, b], mode);
    expect(result.parameters.map((row) => row.technical_name)).toEqual(expected);
    expect(result.parameters.map((row) => result.provenance[String(row.technical_name)].sourceArtifactId)).toEqual(expected.map((key) => key === "a-only" ? "a-artifact" : "b-artifact"));
  });

  it("supports empty inputs and rejects malformed/duplicate keys and invalid policies", () => {
    expect(intersectParameterBanks([{ ...a, data: { parameters: [] } }, b]).parameters).toEqual([]);
    expect(subtractParameterBanks([a, { ...b, data: { parameters: [] } }]).parameters.map((row) => row.technical_name)).toEqual(["shared", "a-only"]);
    expect(() => intersectParameterBanks([a, { ...b, data: { parameters: [{ technical_name: "x" }, { technical_name: "x" }] } }])).toThrow(/duplicate key/);
    expect(() => subtractParameterBanks([a, b], "bad" as never)).toThrow(/unsupported difference mode/);
  });
});
