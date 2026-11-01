import { describe, expect, it } from "vitest";

import { buildAlignedAudioAnalysisPoints, collectStage7WindowEvents, mergeWindowEvents, resetSegmentsForWindowMode } from "./audio-window-modes";
import type { AudioSegmentResultPoint } from "./audio-segment-result";

const sourceSegments: AudioSegmentResultPoint[] = [
  {
    time: 0, offset: 0, duration: 2, clap: [], siglip: [], clapStatus: "complete", siglipStatus: "complete",
    sideMeta: { schema: "segment_side_meta_v1", acoustic_features: {
      extractor: "librosa", ran_at: "2026-11-02T00:00:00.000Z", feature_version: "stage7_librosa_lpc_v1", sample_rate_hz: 16_000,
      duration_seconds: 2, rms_mean: 0.1, rms_min: 0.08, rms_max: 0.12, loudness_dbfs_approx: -20, peak: 0.5,
      spectral_centroid_mean_hz: 900, spectral_bandwidth_mean_hz: 700, spectral_rolloff_85_mean_hz: 2_000,
      tempo_bpm_approx: 120, beat_times_seconds: [0.5, 1, 1.5], onset_times_seconds: [0.2, 0.31, 1.2], formants: null, formant_skip_reason: null,
    } },
  },
  {
    time: 2, offset: 2, duration: 2, clap: [], siglip: [], clapStatus: "complete", siglipStatus: "complete",
    sideMeta: { schema: "segment_side_meta_v1", acoustic_features: {
      extractor: "librosa", ran_at: "2026-11-02T00:00:00.000Z", feature_version: "stage7_librosa_lpc_v1", sample_rate_hz: 16_000,
      duration_seconds: 2, rms_mean: 0.1, rms_min: 0.08, rms_max: 0.12, loudness_dbfs_approx: -20, peak: 0.5,
      spectral_centroid_mean_hz: 900, spectral_bandwidth_mean_hz: 700, spectral_rolloff_85_mean_hz: 2_000,
      tempo_bpm_approx: 120, beat_times_seconds: [0, 0.5, 1.5], onset_times_seconds: [0.1, 1], formants: null, formant_skip_reason: null,
    } },
  },
];

describe("beat/transient analysis windows", () => {
  it("collects Stage 7 events as track-relative times", () => {
    expect(collectStage7WindowEvents(sourceSegments, "beat")).toEqual([0.5, 1, 1.5, 2, 2.5, 3.5]);
    expect(collectStage7WindowEvents(sourceSegments, "onset")).toEqual([0.2, 0.31, 1.2, 2.1, 3]);
    expect(collectStage7WindowEvents(sourceSegments, "uniform")).toEqual([]);
  });

  it("merges event nodes that are closer than the 0.5-second minimum gap", () => {
    expect(mergeWindowEvents([1, 1.1, 1.49, 1.5, 2], 0.5)).toEqual([1, 1.5, 2]);
  });

  it("centers windows on events and clamps them to the selected time gate", () => {
    expect(buildAlignedAudioAnalysisPoints(10, 2, 3, 8, [2, 3.5, 5, 8, 9])).toEqual([
      { time: 3.5, offset: 3, duration: 2 },
      { time: 5, offset: 4, duration: 2 },
      { time: 8, offset: 6, duration: 2 },
    ]);
  });

  it("resets CLAP/SigLIP results when node positions change", () => {
    const reset = resetSegmentsForWindowMode([{ time: 0.5, offset: 0, duration: 1 }, { time: 1.5, offset: 1, duration: 1 }]);
    expect(reset.map((segment) => segment.time)).toEqual([0.5, 1.5]);
    expect(reset.every((segment) => segment.clap.length === 0 && segment.siglip.length === 0 && segment.clapStatus === "pending" && segment.siglipStatus === "pending")).toBe(true);
  });
});
