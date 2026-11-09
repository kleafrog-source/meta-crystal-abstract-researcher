import { describe, expect, it } from "vitest";
import { smoothAutomationFrames } from "./client-stage2";
import type { ActiveParameter } from "@/lib/rag-v3/types";

const parameter = (value: number, segment?: string): ActiveParameter & { automation_segment?: string } => ({
  technical_name: "filter_cutoff", category: "spectral", sub_category: "filter", ui_element: "Range",
  retrieval_scope: "sound",
  min_value: 0, max_value: 1, default: 0, suggested_value: value, current_value: value, before: value,
  source: "retrieval", detail: "test", similarity: 0.9, lyria_prompt_tags: [], semantic_keywords: [], axes: [],
  ...(segment ? { automation_segment: segment } : {}),
});

describe("Automation client Stage-2", () => {
  it("uses only explicit prior result artifacts and preserves segment/frame provenance", () => {
    const result = smoothAutomationFrames([
      { actionId: "text.qwen.resolved", data: [parameter(0.35)], segmentRefs: [] },
      { actionId: "audio.clap.resolved", data: [parameter(0.55, "seg-a")], segmentRefs: [{ id: "seg-a", startSeconds: 0, endSeconds: 3 }] },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.automation_segment === "seg-a")).toBe(true);
    expect(new Set(result.map((item) => item.consensus_frame))).toEqual(new Set(["text.qwen.resolved", "audio.clap.resolved"]));
    expect(result[0].current_value).toBeGreaterThan(0.35);
    expect(result[1].current_value).toBeLessThan(0.55);
  });

  it("rejects a run without a compatible result bank", () => {
    expect(() => smoothAutomationFrames([{ actionId: "audio.analyze", data: {}, segmentRefs: [] }])).toThrow(/explicit.*result artifacts/u);
  });
});
