import { describe, expect, it } from "vitest";

import { loadVocalMatrixFormants, saveVocalMatrixFormants, type VocalMatrixFormantSummary } from "./acoustic-feature-bridge";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const summary: VocalMatrixFormantSummary = {
  schema: "am_stage_formants_v1",
  f1_hz: 510,
  f2_hz: 1_480,
  confidence: 0.72,
  segment_index: 2,
  offset_seconds: 4,
  duration_seconds: 2,
  extracted_at: "2026-11-02T00:00:00.000Z",
};

describe("AM-Stage formant bridge", () => {
  it("makes the latest segment formants available to Vocal Morphology UI", () => {
    const storage = memoryStorage();
    saveVocalMatrixFormants(summary, storage);
    expect(loadVocalMatrixFormants(storage)).toEqual(summary);
  });

  it("clears stale formants when a later segment has no valid estimates", () => {
    const storage = memoryStorage();
    saveVocalMatrixFormants(summary, storage);
    saveVocalMatrixFormants(null, storage);
    expect(loadVocalMatrixFormants(storage)).toBeNull();
  });

  it("ignores malformed stored payloads", () => {
    const storage = memoryStorage();
    storage.setItem("am_stage_vocal_formants_v1", "not-json");
    expect(loadVocalMatrixFormants(storage)).toBeNull();
  });
});
