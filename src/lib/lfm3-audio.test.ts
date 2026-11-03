import { describe, expect, it } from "vitest";

import { buildLfm3Prompt, cleanLfm3Output, normalizeLfm3Window, parseLfm3Runtime } from "./lfm3-audio";

describe("LFM3 audio request helpers", () => {
  it("uses fixed concise English prompts", () => {
    expect(buildLfm3Prompt("describe")).toContain("one concise English paragraph");
    expect(buildLfm3Prompt("asr")).toBe("Perform ASR in English.");
  });

  it("defaults to verified local Ollama and accepts llama.cpp as an alternate", () => {
    expect(parseLfm3Runtime(undefined)).toBe("ollama");
    expect(parseLfm3Runtime("ollama")).toBe("ollama");
    expect(() => parseLfm3Runtime("remote")).toThrow("Unsupported LFM3 runtime");
  });

  it("bounds clip windows to the supported 0.25–30 second range", () => {
    expect(normalizeLfm3Window(4, 8)).toEqual({ offset: 4, duration: 8 });
    expect(() => normalizeLfm3Window(-1, 2)).toThrow("Select an audio window");
    expect(() => normalizeLfm3Window(0, 31)).toThrow("Select an audio window");
  });

  it("removes terminal markers and caps output to the Brief limit", () => {
    expect(cleanLfm3Output("\u001b[32mhello\u001b[0m<|im_end|>")).toBe("hello");
    expect(cleanLfm3Output("x".repeat(2_000))).toHaveLength(1_200);
  });
});
