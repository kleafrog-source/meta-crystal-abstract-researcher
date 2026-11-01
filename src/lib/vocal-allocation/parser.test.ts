import { describe, expect, it } from "vitest";

import { parseVocalQuery } from "./parser";

describe("parseVocalQuery Indic language tags", () => {
  it("recognizes detected Indian language tags for ISO language controls", () => {
    expect(parseVocalQuery("Detected audio languages: hi-IN, ta-IN").languages).toEqual(["hi-IN", "ta-IN"]);
  });

  it("does not treat a tag embedded in another token as a language code", () => {
    expect(parseVocalQuery("this is a sound").languages).not.toContain("hi-IN");
  });
});
