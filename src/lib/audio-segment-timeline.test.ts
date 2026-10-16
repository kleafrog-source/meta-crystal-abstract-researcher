import { describe, expect, it } from "vitest";

import {
  buildAudioAnalysisPoints,
  interpolateParameterFrames,
} from "./audio-segment-timeline";
import type { ActiveParameter } from "./rag-v3/types";

const parameter = (name: string, value: number): ActiveParameter => ({
  technical_name: name,
  category: "test",
  sub_category: "test",
  ui_element: "Range",
  min_value: 0,
  max_value: 100,
  step: 1,
  default: 50,
  suggested_value: value,
  current_value: value,
  before: 50,
  source: "audio_similarity",
  detail: "fixture",
  lyria_prompt_tags: [],
  semantic_keywords: [],
  similarity: 0.9,
  axes: [],
  retrieval_scope: "sound",
});

describe("audio segment timeline", () => {
  it("creates two endpoint samples when the interval exceeds the track", () => {
    expect(buildAudioAnalysisPoints(6, 10)).toEqual([
      { time: 0, offset: 0, duration: 6 },
      { time: 6, offset: 0, duration: 6 },
    ]);
  });

  it("includes the track endpoint and a valid trailing analysis window", () => {
    expect(buildAudioAnalysisPoints(25, 10)).toEqual([
      { time: 0, offset: 0, duration: 10 },
      { time: 10, offset: 10, duration: 10 },
      { time: 20, offset: 15, duration: 10 },
      { time: 25, offset: 15, duration: 10 },
    ]);
  });

  it("interpolates matching Range values and snaps to step", () => {
    expect(
      interpolateParameterFrames(
        [parameter("amount", 10)],
        [parameter("amount", 90)],
        0.25,
      )[0].current_value,
    ).toBe(30);
  });
});
