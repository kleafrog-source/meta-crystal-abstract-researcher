import { describe, expect, it } from "vitest";

import { applySegmentSideMeta, getIncompleteSegmentIndexes, prepareSegmentRun, type AudioSegmentResultPoint } from "./audio-segment-result";

const segments: AudioSegmentResultPoint[] = [
  { time: 0, offset: 0, duration: 2, clap: [{ technical_name: "kept" } as never], siglip: [], clapStatus: "complete", siglipStatus: "pending" },
  { time: 2, offset: 2, duration: 2, clap: [], siglip: [], clapStatus: "pending", siglipStatus: "pending" },
  { time: 4, offset: 4, duration: 2, clap: [], siglip: [], clapStatus: "pending", siglipStatus: "pending" },
];

describe("audio segment resume state", () => {
  it("stores specialist metadata only on the selected segment and merges prior results", () => {
    const first = applySegmentSideMeta(segments, 0, { gender: { model: "fixture-gender", ran_at: "2026-11-01T00:00:00.000Z", label: "male", score: 0.9, probabilities: { male: 0.9, female: 0.1 }, semantics: "acoustic_voice_presentation" } });
    const second = applySegmentSideMeta(first, 0, { language: { model: "fixture-language", ran_at: "2026-11-01T00:00:01.000Z", tags: [{ code: "hi-IN", label: "Hindi", confidence: 0.8 }], top_confidence: 0.8 } });

    expect(second[0].sideMeta?.gender?.label).toBe("male");
    expect(second[0].sideMeta?.language?.tags[0]?.code).toBe("hi-IN");
    expect(second[1].sideMeta).toBeUndefined();
  });

  it("stores acoustic features alongside existing side metadata for snapshot persistence", () => {
    const withGender = applySegmentSideMeta(segments, 1, { gender: { model: "fixture-gender", ran_at: "2026-11-02T00:00:00.000Z", label: "female", score: 0.8, probabilities: { male: 0.2, female: 0.8 }, semantics: "acoustic_voice_presentation" } });
    const withFeatures = applySegmentSideMeta(withGender, 1, { acoustic_features: {
      extractor: "librosa", ran_at: "2026-11-02T00:00:01.000Z", feature_version: "stage7_librosa_lpc_v1", sample_rate_hz: 16_000,
      duration_seconds: 2, rms_mean: 0.1, rms_min: 0.08, rms_max: 0.12, loudness_dbfs_approx: -20, peak: 0.5,
      spectral_centroid_mean_hz: 1_200, spectral_bandwidth_mean_hz: 900, spectral_rolloff_85_mean_hz: 3_000,
      tempo_bpm_approx: 120, beat_times_seconds: [0.5, 1, 1.5], onset_times_seconds: [0.2, 0.8],
      formants: { f1_hz: 510, f2_hz: 1_480, confidence: 0.72, voiced_frame_ratio: 0.8, method: "lpc_heuristic" }, formant_skip_reason: null,
    } });

    expect(withFeatures[1].sideMeta?.gender?.label).toBe("female");
    expect(withFeatures[1].sideMeta?.acoustic_features?.beat_times_seconds).toEqual([0.5, 1, 1.5]);
    expect(withFeatures[1].sideMeta?.acoustic_features?.formants?.f1_hz).toBe(510);
    expect(withFeatures[0].sideMeta).toBeUndefined();
  });

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
