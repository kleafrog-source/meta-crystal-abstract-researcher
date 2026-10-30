import { describe, expect, it } from "vitest";

import { getIncompleteSegmentIndexes, prepareSegmentRun, type AudioSegmentResultPoint } from "./audio-segment-result";

const segments: AudioSegmentResultPoint[] = [
  { time: 0, offset: 0, duration: 2, clap: [{ technical_name: "kept" } as never], siglip: [], clapStatus: "complete", siglipStatus: "pending" },
  { time: 2, offset: 2, duration: 2, clap: [], siglip: [], clapStatus: "pending", siglipStatus: "pending" },
  { time: 4, offset: 4, duration: 2, clap: [], siglip: [], clapStatus: "pending", siglipStatus: "pending" },
];

describe("audio segment resume state", () => {
  it("continues from incomplete indexes and retains completed values", () => {
    const resumed = prepareSegmentRun(segments, "clap", true);
    expect(getIncompleteSegmentIndexes(resumed, "clap")).toEqual([1, 2]);
    expect(resumed[0].clap).toEqual(segments[0].clap);
  });

  it("starts a deliberate fresh run without clearing the other modality", () => {
    const withSiglip: AudioSegmentResultPoint[] = segments.map((segment) => ({
      ...segment,
      siglip: [{ technical_name: "siglip-kept" } as never],
      siglipStatus: "complete",
    }));
    const fresh = prepareSegmentRun(withSiglip, "clap", false);
    expect(fresh.map((segment) => segment.clapStatus)).toEqual(["pending", "pending", "pending"]);
    expect(fresh[0].clap).toEqual([]);
    expect(fresh[0].siglip).toEqual(withSiglip[0].siglip);
    expect(fresh[0].siglipStatus).toBe("complete");
  });
});
