import { describe, expect, it } from "vitest";

import { DEFAULT_SAINA_HELM_BASE_URL, getSainaHelmBaseUrl } from "./saina-helm-runtime";

describe("Saina Helm runtime configuration", () => {
  it("defaults to the isolated Saina port, not stock Ollama", () => {
    expect(getSainaHelmBaseUrl({})).toBe(DEFAULT_SAINA_HELM_BASE_URL);
    expect(DEFAULT_SAINA_HELM_BASE_URL).toBe("http://127.0.0.1:11435");
  });

  it("normalizes a configured Saina URL", () => {
    expect(getSainaHelmBaseUrl({ AM_STAGE_SAINA_BASE_URL: "http://localhost:11500///" }))
      .toBe("http://localhost:11500");
  });

  it("rejects malformed and non-HTTP URLs", () => {
    expect(() => getSainaHelmBaseUrl({ AM_STAGE_SAINA_BASE_URL: "not a URL" })).toThrow(/absolute HTTP\(S\)/);
    expect(() => getSainaHelmBaseUrl({ AM_STAGE_SAINA_BASE_URL: "file:///tmp/ollama" })).toThrow(/HTTP or HTTPS/);
  });
});
