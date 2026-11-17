import { describe, expect, it } from "vitest";
import { assembleAutomationText, limitAutomationText } from "./text-operations";

describe("Automation text operations", () => {
  it("limits by words and reports original/final units without mutating source", () => {
    const source = "Ambient  electronic\ntexture slowly evolves";
    const result = limitAutomationText(source, { maxChars: 3, unit: "words", truncation: "word_boundary" });
    expect(result).toEqual({ text: "Ambient electronic texture", originalLength: 5, finalLength: 3, truncated: true, unit: "words" });
    expect(source).toBe("Ambient  electronic\ntexture slowly evolves");
  });

  it("counts Unicode codepoints and applies explicit truncation", () => {
    expect(limitAutomationText("A😀B", { maxChars: 2, unit: "codepoints", truncation: "hard" }).text).toBe("A😀");
    expect(limitAutomationText("soft tail", { maxChars: 4, unit: "chars", truncation: "ellipsis" }).text).toBe("soft…");
    expect(limitAutomationText("soft tail", { maxChars: 4, unit: "chars", truncation: "word_boundary" }).text).toBe("soft");
  });

  it("assembles in binding order, preserves artifact refs and applies missing policies", () => {
    const parts = [{ artifactId: "limit-artifact", text: "bounded template" }, { artifactId: "crystal-artifact", text: "crystal note" }];
    expect(assembleAutomationText(parts, { template: "{1} / {0}", separator: "\n", missingPolicy: "skip", includeSourceRefs: true })).toEqual({
      text: "crystal note / bounded template\nИсточники: limit-artifact, crystal-artifact",
      sources: ["limit-artifact", "crystal-artifact"], missingIndexes: [],
    });
    expect(assembleAutomationText([{ artifactId: "a", text: "one" }, { artifactId: "b", text: " " }], { template: "", separator: ",", missingPolicy: "placeholder", includeSourceRefs: false })).toEqual({ text: "one,[missing]", sources: ["a"], missingIndexes: [1] });
    expect(() => assembleAutomationText([{ artifactId: null, text: "" }], { template: "", separator: "\n", missingPolicy: "error", includeSourceRefs: false })).toThrow("ASSEMBLE_MISSING_PART");
    expect(() => assembleAutomationText([], { template: "", separator: "\n", missingPolicy: "skip", includeSourceRefs: false })).toThrow("at least one");
  });
});
