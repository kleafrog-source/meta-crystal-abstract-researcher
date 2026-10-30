import { describe, expect, it } from "vitest";

import { buildLayerTimelineLanes, UNCLASSIFIED_TIMELINE_LAYER } from "./am-stage-layer-timeline";
import type { ActiveParameter } from "./rag-v3/types";

const parameter = (technical_name: string, current_value: number, extra: Record<string, unknown> = {}) => ({
  technical_name,
  category: "audio",
  current_value,
  min_value: 0,
  max_value: 1,
  ...extra,
}) as ActiveParameter;

describe("AM-Stage layer timeline projection", () => {
  it("uses explicit and inferred acoustic layers, and keeps unknown values unclassified", () => {
    const text = [
      parameter("explicit", 0.4, { domain_layer: "VOCAL_MORPHOLOGY_LAYER" }),
      parameter("tempo_bpm", 0.7),
      parameter("legacy_unknown", 0.2),
      parameter("consensus", 0.8, { domain_layer: "GLOBAL_CONSENSUS_LAYER" }),
    ];
    const lanes = buildLayerTimelineLanes([], text, 10, true, true);
    expect(lanes.map(({ id }) => id)).toEqual([
      "VOCAL_MORPHOLOGY_LAYER",
      "TEMPORAL_RHYTHM_LAYER",
      UNCLASSIFIED_TIMELINE_LAYER.id,
    ]);
    expect(lanes[0].series[0].source).toBe("text");
    expect(lanes[0].color).toBe("#e879f9");
    expect(lanes.flatMap((lane) => lane.series).some(({ label }) => label === "consensus")).toBe(false);
  });

  it("projects CLAP and SigLIP frames without rerunning their source data", () => {
    const lanes = buildLayerTimelineLanes([
      { time: 0, clap: [parameter("vocal_formant", 0.2)], siglip: [] },
      { time: 5, clap: [], siglip: [parameter("vocal_formant", 0.8)] },
    ], [], 10, true, true);
    expect(lanes[0].series.map(({ source }) => source)).toEqual(["clap", "siglip"]);
    expect(lanes[0].series.every(({ color }) => color === "#e879f9")).toBe(true);
  });
});
