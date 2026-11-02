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

  it("keeps gated samples inside the requested original-file time range", () => {
    expect(buildAudioAnalysisPoints(120, 10, 30, 55)).toEqual([
      { time: 30, offset: 30, duration: 10 },
      { time: 40, offset: 40, duration: 10 },
      { time: 50, offset: 45, duration: 10 },
      { time: 55, offset: 45, duration: 10 },
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

  it("accepts a 0.5 second node interval", () => {
    const segments = [0, 0.5, 1].map((time) => ({ time, offset: time, duration: 0.5, clap: [], siglip: [] }));
    expect(smoothTimelineSegments(segments, 0.5).map((node) => node.time)).toEqual([0, 0.5, 1]);
  });

  it("normalizes and fuses shared parameters", () => {
    const clap = [parameter("amount", 20), parameter("clap_only", 10)];
    const siglip = [parameter("amount", 80), parameter("siglip_only", 90)];
    const fused = blendParameterFrames(clap, siglip, 0.5);
    expect(fused.find((item) => item.technical_name === "amount")?.current_value).toBe(20);
    expect(fused.find((item) => item.technical_name === "amount")?.detail).toContain("kept CLAP");
  });

  it("exports server Stage-2 hits with explicit provenance outside the audio node frames", () => {
    const timeline = buildPriorityTimeline([], {
      audioName: "fixture.wav",
      audioDuration: 5,
      rawInterval: 2,
      nodeInterval: 5,
      blend: false,
      serverStage2: {
        index: "qwen3",
        results: [{ ...parameter("coherence_anchor", 42), source: "stage2" }],
      },
    }) as unknown as { server_stage2?: { index: string; results: Array<{ technical_name: string; source: string }> }; timeline: unknown[] };

    expect(timeline.timeline).toEqual([]);
    expect(timeline.server_stage2).toEqual({
      index: "qwen3",
      query_method: "weighted_centroid_of_stage1_text_vectors",
      results: [{ technical_name: "coherence_anchor", similarity: 0.9, current_value: 42, source: "stage2" }],
    });
  });

  it("down-weights flat score lists and keeps the higher-trust value on disagreement", () => {
    const clap = [
      { ...parameter("amount", 20), similarity: 0.7 },
      { ...parameter("clap_context", 10), similarity: 0.7 },
    ];
    const siglip = [
      { ...parameter("amount", 80), similarity: 0.1 },
      { ...parameter("siglip_context", 90), similarity: 0.99 },
    ];
    const fused = blendParameterFrames(clap, siglip, 0.5);
    const amount = fused.find((item) => item.technical_name === "amount")!;
    expect(amount.current_value).toBe(80);
    expect(amount.similarity).toBeLessThan(0.2);
    expect(amount.detail).toContain("kept SigLIP2");
  });

  it("preserves ordinary averaging for close values with peaked score lists", () => {
    const clap = [{ ...parameter("amount", 40), similarity: 0.98 }, { ...parameter("clap_context", 10), similarity: 0.1 }];
    const siglip = [{ ...parameter("amount", 44), similarity: 0.97 }, { ...parameter("siglip_context", 90), similarity: 0.12 }];
    expect(blendParameterFrames(clap, siglip, 0.5).find((item) => item.technical_name === "amount")?.current_value).toBe(42);
  });

  it("serializes compact registries and excludes invalid names", () => {
    const valid = parameter("valid_name", 30);
    const invalid = parameter("invalid-name", 40);
    const payload = buildPriorityTimeline([{ time: 0, offset: 0, duration: 2, clap: [valid, invalid], siglip: [] }], { audioName: "test.wav", audioDuration: 2, rawInterval: 2, nodeInterval: 10, blend: false, textScores: [0.98, 0.1] });
    expect("clap_registry" in payload && payload.clap_registry).toEqual(["valid_name"]);
    expect(payload.timeline[0]).toEqual({ t: 0, clap: [[0, 30]], siglip: [] });
    expect(payload.modality_trust.segments[0].clap_trust).toBeCloseTo(0);
    expect(payload.modality_trust.text_trust).toBeGreaterThan(0.9);
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
