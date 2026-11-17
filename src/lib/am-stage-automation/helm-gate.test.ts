import { describe, expect, it } from "vitest";
import { helmArtifactConfirmsVocals } from "./helm-gate";

describe("Helm voice prerequisite", () => {
  it("accepts only a bound Helm artifact with an explicit positive vocal gate", () => {
    expect(helmArtifactConfirmsVocals({ actionId: "audio.analyze_helm", data: { side_meta: { helm: { gates: { has_vocals: { value: true } } } } } })).toBe(true);
    expect(helmArtifactConfirmsVocals({ actionId: "audio.analyze_helm", data: { side_meta: { helm: { gates: { has_vocals: { value: false } } } } } })).toBe(false);
    expect(helmArtifactConfirmsVocals({ actionId: "audio.analyze_helm", data: { side_meta: { helm: { gates: { has_vocals: { value: null } } } } } })).toBe(false);
    expect(helmArtifactConfirmsVocals({ actionId: "audio.detect_indic_language", data: { side_meta: { helm: { gates: { has_vocals: { value: true } } } } } })).toBe(false);
    expect(helmArtifactConfirmsVocals(null)).toBe(false);
  });
});
