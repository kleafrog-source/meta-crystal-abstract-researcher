import { describe, expect, it } from "vitest";

import type { ActiveParameter } from "@/lib/rag-v3/types";
import { resolveGemmaIdentityValue } from "./am-stage-value-resolution";

const parameter = (overrides: Partial<ActiveParameter> = {}): ActiveParameter => ({
  technical_name: "filter_cutoff_hz", category: "filter", sub_category: "cutoff", ui_element: "Range",
  default: 1_000, suggested_value: 1_000, current_value: 1_000, before: 1_000,
  source: "default", detail: "catalogue default", similarity: 0.9,
  lyria_prompt_tags: [], semantic_keywords: [], axes: [], retrieval_scope: "sound", ...overrides,
});

describe("Gemma value pass source priority", () => {
  it("uses an exact-window CLAP value ahead of an anchor", () => {
    const resolved = resolveGemmaIdentityValue(parameter(), {
      sameWindowClap: parameter({ suggested_value: 4_000, current_value: 4_000, before: 1_000, source: "audio_similarity", detail: "clap" }),
      qwenAnchor: parameter({ suggested_value: 2_000, source: "axis", detail: "anchor" }),
    });
    expect(resolved.suggested_value).toBe(4_000);
    expect(resolved.source).toBe("audio_similarity");
  });

  it("uses Qwen value anchors before the catalogue default", () => {
    const resolved = resolveGemmaIdentityValue(parameter(), { qwenAnchor: parameter({ suggested_value: 2_000, source: "axis", detail: "anchor" }) });
    expect(resolved.suggested_value).toBe(2_000);
    expect(resolved.source).toBe("axis");
  });

  it("falls back to the catalogue default if value resolution is unavailable", () => {
    const resolved = resolveGemmaIdentityValue(parameter({ default: 1_200 }), { anchorError: "Qwen offline" });
    expect(resolved.suggested_value).toBe(1_200);
    expect(resolved.source).toBe("default");
    expect(resolved.detail).toContain("Qwen offline");
  });
});
