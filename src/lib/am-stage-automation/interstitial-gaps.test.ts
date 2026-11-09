import { describe, expect, it } from "vitest";
import { buildInterstitialGapSamples } from "./interstitial-gaps";

describe("interstitial gap samples", () => {
  const windows = [
    { id: "n1", startSeconds: 0, endSeconds: 10 },
    { id: "n2", startSeconds: 10, endSeconds: 20 },
    { id: "n3", startSeconds: 20, endSeconds: 30 },
    { id: "n4", startSeconds: 30, endSeconds: 40 },
    { id: "n5", startSeconds: 40, endSeconds: 50 },
  ];
  const descriptions = [
    { id: "n1", status: "succeeded", result: { description_natural_en: "left anchor" } },
    { id: "n2", status: "not_selected" },
    { id: "n3", status: "failed" },
    { id: "n4", status: "succeeded", result: { description_natural_en: "right anchor" } },
    { id: "n5", status: "not_selected" },
  ];

  it("targets only undescribed nodes strictly between successful anchors", () => {
    const samples = buildInterstitialGapSamples(windows, descriptions, 4);
    expect(samples).toHaveLength(2);
    expect(samples.map(({ target }) => target.id)).toEqual(["n2", "n3"]);
    expect(samples[0].context.left.text).toBe("left anchor");
    expect(samples[0].context.right.text).toBe("right anchor");
    expect(samples[0].target).toEqual({ id: "n2", startSeconds: 10, endSeconds: 20 });
    expect(samples[0].sentAudio).toEqual({ startSeconds: 13, endSeconds: 17, durationSeconds: 4 });
    expect(samples[1].sentAudio).toEqual({ startSeconds: 23, endSeconds: 27, durationSeconds: 4 });
  });

  it("rounds the center clip to milliseconds and clamps requested duration to the node", () => {
    const sample = buildInterstitialGapSamples([
      { id: "a", startSeconds: 0, endSeconds: 1 },
      { id: "b", startSeconds: 1, endSeconds: 1.4 },
      { id: "c", startSeconds: 1.4, endSeconds: 3 },
    ], [
      { id: "a", status: "succeeded", result: { description_natural_en: "left" } },
      { id: "b", status: "not_selected" },
      { id: "c", status: "succeeded", result: { description_natural_en: "right" } },
    ], 30);
    expect(sample[0].sentAudio).toEqual({ startSeconds: 1, endSeconds: 1.4, durationSeconds: 0.4 });
  });

  it("does not describe boundary nodes without two successful anchors", () => {
    const samples = buildInterstitialGapSamples(windows, descriptions, 4);
    expect(samples.map(({ target }) => target.id)).not.toContain("n5");
  });

  it("rejects audio windows shorter than the LFM3 minimum", () => {
    expect(() => buildInterstitialGapSamples([
      { id: "a", startSeconds: 0, endSeconds: 1 },
      { id: "b", startSeconds: 1, endSeconds: 1.2 },
      { id: "c", startSeconds: 1.2, endSeconds: 2 },
    ], [
      { id: "a", status: "succeeded", result: { description_natural_en: "left" } },
      { id: "b", status: "not_selected" },
      { id: "c", status: "succeeded", result: { description_natural_en: "right" } },
    ], 4)).toThrow(/shorter than the 0\.25-second/);
  });
});
