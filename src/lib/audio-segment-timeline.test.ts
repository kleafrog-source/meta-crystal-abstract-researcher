import { describe, expect, it } from "vitest";

import {
  blendParameterFrames,
  buildAudioAnalysisPoints,
  buildPriorityTimeline,
  interpolateParameterFrames,
  smoothTimelineSegments,
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

  it("rejects a one-sample numeric spike with median smoothing", () => {
    const segments = [0, 2, 4, 6, 8].map((time, index) => ({ time, offset: time, duration: 2, clap: [parameter("drive", index === 2 ? 100 : 10)], siglip: [] }));
    expect(smoothTimelineSegments(segments, 10)[0].clap[0].current_value).toBe(10);
  });

  it("normalizes and fuses shared parameters", () => {
    const clap = [parameter("amount", 20), parameter("clap_only", 10)];
    const siglip = [parameter("amount", 80), parameter("siglip_only", 90)];
    const fused = blendParameterFrames(clap, siglip, 0.5);
    expect(fused.find((item) => item.technical_name === "amount")?.current_value).toBe(50);
  });

  it("serializes compact registries and excludes invalid names", () => {
    const valid = parameter("valid_name", 30);
    const invalid = parameter("invalid-name", 40);
    const payload = buildPriorityTimeline([{ time: 0, offset: 0, duration: 2, clap: [valid, invalid], siglip: [] }], { audioName: "test.wav", audioDuration: 2, rawInterval: 2, nodeInterval: 10, blend: false });
    expect("clap_registry" in payload && payload.clap_registry).toEqual(["valid_name"]);
    expect(payload.timeline[0]).toEqual({ t: 0, clap: [[0, 30]], siglip: [] });
  });

  it("compresses a repeated timeline by more than fifty percent", () => {
    const frames = Array.from({ length: 30 }, (_, time) => ({
      time, offset: time, duration: 1,
      clap: Array.from({ length: 20 }, (_, index) => parameter(`long_repeated_parameter_name_${index}`, index + time)),
      siglip: [],
    }));
    const compact = buildPriorityTimeline(frames, { audioName: "test.wav", audioDuration: 30, rawInterval: 1, nodeInterval: 10, blend: false });
    const legacy = { points: frames.map((frame) => ({ time_seconds: frame.time, analysis_window: { offset_seconds: frame.offset, duration_seconds: frame.duration }, clap: frame.clap.map((item) => ({ technical_name: item.technical_name, value: item.current_value })), siglip: [] })) };
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(legacy).length * 0.5);
  });
});
