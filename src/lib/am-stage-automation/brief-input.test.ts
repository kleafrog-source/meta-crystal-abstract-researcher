import { describe, expect, it } from "vitest";
import { resolveAutomationBrief } from "./brief-input";

describe("Automation Brief input resolution", () => {
  it("uses the explicitly bound artifact even when an external Brief was also submitted", () => {
    expect(resolveAutomationBrief({
      externalBrief: "crystal source text",
      boundBriefData: { schema: "am2_text_v1", text: "assembled template then crystal" },
      hasBriefBinding: true,
    })).toBe("assembled template then crystal");
  });

  it("does not mask a missing or empty bound Brief with unrelated external text", () => {
    expect(resolveAutomationBrief({ externalBrief: "crystal source text", boundBriefData: {}, hasBriefBinding: true })).toBe("");
  });

  it("uses an external Brief when no Brief artifact is bound", () => {
    expect(resolveAutomationBrief({ externalBrief: "  direct input  ", hasBriefBinding: false })).toBe("direct input");
  });

  it("extracts supported query text when the bound artifact has no text field", () => {
    expect(resolveAutomationBrief({ boundBriefData: { reverse_query: { query_en: "derived query" } }, hasBriefBinding: true })).toBe("derived query");
  });

  it("uses LFM3 description and transcription text from their saved artifact payloads", () => {
    expect(resolveAutomationBrief({ boundBriefData: { text: "  sound description  ", model: "local" }, hasBriefBinding: true })).toBe("sound description");
    expect(resolveAutomationBrief({ boundBriefData: { text: "  spoken words  ", runtime: "ollama" }, hasBriefBinding: true })).toBe("spoken words");
  });

  it("uses a top-level reverse-query payload", () => {
    expect(resolveAutomationBrief({ boundBriefData: { query_en: "derived from audio" }, hasBriefBinding: true })).toBe("derived from audio");
  });
});
