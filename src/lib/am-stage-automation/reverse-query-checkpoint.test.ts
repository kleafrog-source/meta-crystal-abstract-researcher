import { describe, expect, it } from "vitest";
import { acceptSavedReverseQueryResponse, beginNodeRetryCycle } from "./reverse-query-checkpoint";

const failed = {
  schema: "automation_node_checkpoint_v1",
  nodeKey: "text_features.reverse_query:segment-1",
  segmentId: "segment-1",
  inputFingerprint: "old-fingerprint",
  status: "failed",
  attemptsUsed: 4,
  elapsedMs: 10_000,
  requestDiagnostics: { promptRouteVersion: "reverse-query-v2", inputArtifactId: "artifact-snapshot" },
  lastError: "Legacy parser rejected required fields.",
  lastErrorDetails: {
    rawResponse: '{\n  "sound_description": "A deep, resonant industrial hum at 12207 Hz fills the air, creating a dense, immersive atmosphere. The sound is accompanied by a subtle, rhythmic auto-pan movement, with the audio source gently sweeping across the stereo field. Occasionally, the sound is interrupted by a sharp, glitch-like stutter, as if the tape is being rapidly rewound and replayed. The overall effect is a dynamic, evolving soundscape that blends industrial noise with electronic glitches and spatial movement."\n}',
    rawResponseSha256: "97fe992685fa82e971ef6ca09a5ae966f5aa87ef34f19b5b1f19ba560f29e287",
    modelRequest: { provider: "freellmapi", actualModel: "mistral-code-latest", requestedModel: "auto" },
  },
};

describe("saved Reverse Query checkpoint actions", () => {
  it("accepts the original response under the new normalizer without inventing fields or erasing failure history", () => {
    const accepted = acceptSavedReverseQueryResponse(failed, "new-fingerprint", "2026-11-09T00:00:00.000Z");
    expect(accepted).toMatchObject({
      status: "succeeded",
      attemptsUsed: 4,
      inputFingerprint: "new-fingerprint",
      acceptedSavedResponse: { sourceInputFingerprint: "old-fingerprint", sourceAttemptCount: 4, sourcePromptRouteVersion: "reverse-query-v2", acceptedByNormalizerVersion: "reverse-query-normalizer-v1" },
      previousFailure: { message: "Legacy parser rejected required fields." },
      result: { reverse_query: { textSourceField: "sound_description", missingFields: ["query_en", "query_ru", "key_concepts", "uncertainties"] }, provider: "freellmapi", model: "mistral-code-latest" },
    });
    expect(accepted.result).toHaveProperty("raw_response", failed.lastErrorDetails.rawResponse);
    expect(Buffer.byteLength(String(accepted.result.raw_response), "utf8")).toBe(511);
    expect(accepted.result.request_diagnostics).toMatchObject({ modelRequest: { actualModel: "mistral-code-latest", requestedModel: "auto" }, requestMessagesCaptured: false });
    expect(accepted.result.reverse_query).not.toHaveProperty("query_ru");
    expect(accepted.result.reverse_query).not.toHaveProperty("key_concepts");
    expect(failed.status).toBe("failed");
  });

  it("rejects provider/HTML failures instead of accepting them as a response", () => {
    expect(() => acceptSavedReverseQueryResponse({ ...failed, lastErrorDetails: { rawResponse: "<html>502 Bad Gateway</html>" } }, "new" )).toThrow(/Provider\/transport error/u);
  });

  it("opens a finite new retry cycle with reason and cumulative attempt history intact", () => {
    const next = beginNodeRetryCycle(failed, "new-fingerprint", "Prompt parser fixed; retry the failed node only.", "2026-11-09T00:00:00.000Z");
    expect(next).toMatchObject({
      attemptsUsed: 4,
      cycleAttemptsUsed: 0,
      cycleElapsedMs: 0,
      currentRetryCycle: 2,
      retryReason: "Prompt parser fixed; retry the failed node only.",
      retryCycles: [{ cycleNumber: 2, retryLimit: 4, promptRouteVersion: "reverse-query-v3", normalizerVersion: "reverse-query-normalizer-v1", inputFingerprint: "new-fingerprint" }],
    });
  });

  it("requires a clear reason for a new cycle", () => {
    expect(() => beginNodeRetryCycle(failed, "new-fingerprint", "fixed")).toThrow(/at least 10 characters/u);
  });
});
