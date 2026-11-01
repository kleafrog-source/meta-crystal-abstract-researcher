import { describe, expect, it } from "vitest";

import { normalizeIndicLanguageTags } from "./segment-side-meta";

describe("normalizeIndicLanguageTags", () => {
  it("keeps unique supported Indic tags and ignores malformed values", () => {
    expect(normalizeIndicLanguageTags(["hi-IN", "ta-IN", "hi-IN", "en-US", 3])).toEqual(["hi-IN", "ta-IN"]);
  });

  it("accepts a comma-separated value from the Vocal Allocation Matrix field", () => {
    expect(normalizeIndicLanguageTags("bn-IN, as-IN")).toEqual(["bn-IN", "as-IN"]);
  });
});
