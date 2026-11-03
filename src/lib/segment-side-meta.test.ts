import { describe, expect, it } from "vitest";

import { classifyIndicLanguage, normalizeIndicLanguageTags } from "./segment-side-meta";

describe("normalizeIndicLanguageTags", () => {
  it("keeps unique supported Indic tags and ignores malformed values", () => {
    expect(normalizeIndicLanguageTags(["hi-IN", "ta-IN", "hi-IN", "en-US", 3])).toEqual(["hi-IN", "ta-IN"]);
  });

  it("accepts a comma-separated value from the Vocal Allocation Matrix field", () => {
    expect(normalizeIndicLanguageTags("bn-IN, as-IN")).toEqual(["bn-IN", "as-IN"]);
  });

  it("marks weak predictions as no_indic", () => {
    expect(classifyIndicLanguage([{ code: "mr-IN", label: "Marathi", confidence: 0.62 }], 0.78)).toEqual({ tags: [], top_confidence: 0.62, status: "no_indic", threshold: 0.78 });
  });

  it("retains only tags above the configured confidence threshold", () => {
    expect(classifyIndicLanguage([{ code: "hi-IN", label: "Hindi", confidence: 0.91 }, { code: "bn-IN", label: "Bengali", confidence: 0.61 }], 0.75).tags).toEqual([{ code: "hi-IN", label: "Hindi", confidence: 0.91 }]);
  });
});
