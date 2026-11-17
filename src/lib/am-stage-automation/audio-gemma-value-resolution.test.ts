import { describe, expect, it } from "vitest";
import { resolveAudioGemmaValues } from "./audio-gemma-value-resolution";

const bank = (artifactId: string, data: unknown) => ({ artifactId, data });

describe("Audio Gemma deterministic value resolution", () => {
  it("uses CLAP before Qwen and records the winning artifact provenance", () => {
    const result = resolveAudioGemmaValues(
      bank("identity", [{ technical_name: "a", default: 1 }]),
      bank("clap", [{ technical_name: "a", current_value: 2 }]),
      bank("qwen", [{ technical_name: "a", current_value: 3 }]),
    );
    expect(result.data).toEqual([expect.objectContaining({ current_value: 2, suggested_value: 2, source: "audio_similarity", valueProvenance: { sourceArtifactId: "clap", sourceTechnicalName: "a", sourceAction: "audio.clap.resolved" } })]);
  });

  it("falls through invalid CLAP values to Qwen, then catalogue defaults", () => {
    const result = resolveAudioGemmaValues(
      bank("identity", [{ technical_name: "a", default: 7 }, { technical_name: "b" }]),
      bank("clap", [{ technical_name: "a", current_value: null }, { technical_name: "b", current_value: Number.NaN }]),
      bank("qwen", [{ technical_name: "a", current_value: "warm" }]),
    );
    expect(result.data).toEqual([
      expect.objectContaining({ current_value: "warm", source: "text_anchor", valueProvenance: expect.objectContaining({ sourceArtifactId: "qwen" }) }),
      expect.objectContaining({ current_value: 0, source: "default", valueProvenance: expect.objectContaining({ sourceArtifactId: "identity" }) }),
    ]);
  });

  it("matches segmented banks by exact window and preserves input immutability", () => {
    const identity = bank("identity", { schema: "am_stage_segment_bank_v1", segments: [
      { id: "w1", startSeconds: 0, endSeconds: 4, parameters: [{ technical_name: "a", default: 1 }] },
      { id: "w2", startSeconds: 4, endSeconds: 8, parameters: [{ technical_name: "a", default: 1 }] },
    ] });
    const clap = bank("clap", { schema: "am_stage_segment_bank_v1", segments: [{ id: "w2", parameters: [{ technical_name: "a", current_value: 9 }] }] });
    const before = structuredClone(identity);
    const result = resolveAudioGemmaValues(identity, clap);
    expect(result.data).toMatchObject({ segments: [
      { id: "w1", parameters: [{ current_value: 1, source: "default" }] },
      { id: "w2", parameters: [{ current_value: 9, source: "audio_similarity", valueProvenance: { sourceArtifactId: "clap" } }] },
    ] });
    expect(identity).toEqual(before);
  });

  it("does not mix a segmented anchor bank into an unsegmented identity bank", () => {
    const result = resolveAudioGemmaValues(bank("id", [{ technical_name: "a", default: 1 }]), undefined,
      bank("q", { schema: "am_stage_segment_bank_v1", segments: [{ id: "w1", parameters: [{ technical_name: "a", current_value: 8 }] }] }));
    expect(result.data).toEqual([expect.objectContaining({ current_value: 1, source: "default" })]);
  });
});
