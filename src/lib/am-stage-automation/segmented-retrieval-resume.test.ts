import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ calls: [] as Array<{ offset: number; duration: number }>, failedOnce: false }));

vi.mock("./storage", () => ({
  readAudioAsset: async () => ({ bytes: Buffer.from("audio-fixture"), asset: { originalFilename: "fixture.wav", mimeType: "audio/wav" } }),
}));

vi.mock("@/app/api/audio-to-parameter/segment/route", () => ({
  POST: async (request: Request) => {
    const form = await request.formData();
    const offset = Number(form.get("offset"));
    const duration = Number(form.get("duration"));
    fixture.calls.push({ offset, duration });
    if (offset === 5 && !fixture.failedOnce) {
      fixture.failedOnce = true;
      return Response.json({ error: "fixed node-2 failure" }, { status: 400 });
    }
    const parameters = [{
      technical_name: `parameter_at_${offset}`, category: "fixture", sub_category: "audio", detail: "fixed retrieval",
      ui_element: "Range", default: 0, current_value: 0.5, suggested_value: 0.5, similarity: 0.9,
    }];
    return Response.json({ parameters });
  },
}));

import { executeAutomationAction } from "./adapters";
import type { AutomationAdapterContext, AutomationStageDefinition } from "./contracts";

const windows = [0, 5, 10, 15].map((startSeconds, index) => ({ id: `segment-${index + 1}`, startSeconds, endSeconds: startSeconds + 5 }));
const stage: AutomationStageDefinition = {
  stageId: "c-audio-checkpoint:02:audio-clap-resolved", actionId: "audio.clap.resolved", title: "CLAP segment retrieval", role: "audio",
  inputBindings: [{ name: "segmentPlan", from: "stage:c-audio-checkpoint:01:audio-segment", port: "result" }],
  outputDefinitions: [{ port: "result", kind: "parameter-bank", required: true }],
  settings: { requested: { topK: 6, perSegmentResults: true, checkpointSegments: true }, effective: { topK: 6, perSegmentResults: true, checkpointSegments: true }, origin: "scenario_default" },
  requiredForGoal: true, failurePolicy: "fail_run", allowedFallbacks: [], available: true,
};

function context(priorNodeCheckpoints: Array<Record<string, unknown>>, persisted: Array<Record<string, unknown>>): AutomationAdapterContext {
  return {
    runId: "run-c-fixture", stageId: stage.stageId, attemptId: `attempt-${persisted.length}`, signal: new AbortController().signal,
    inputs: { assetId: "asset-c-fixture", audioDurationSeconds: 20, audioRange: { assetId: "asset-c-fixture", startSeconds: 0, endSeconds: 20, durationSeconds: 20 } },
    settings: { topK: 6, perSegmentResults: true, checkpointSegments: true },
    resolvedInputs: { segmentPlan: { artifactId: "plan-c-fixture", data: { windows } } },
    priorNodeCheckpoints, persistNodeCheckpoint: async (checkpoint) => { persisted.push(checkpoint); }, onProgress: async () => {},
  };
}

describe("checkpointed segmented audio retrieval", () => {
  beforeEach(() => { fixture.calls = []; fixture.failedOnce = false; });

  it("fails the stage on a failed node, then reuses successes and retries only that node on Continue", async () => {
    const checkpoints: Array<Record<string, unknown>> = [];

    await expect(executeAutomationAction(stage, context([], checkpoints))).rejects.toThrow("fixed node-2 failure");
    expect(fixture.calls.map((call) => call.offset)).toEqual([0, 5]);
    expect(checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ segmentId: "segment-1", status: "succeeded" }),
      expect.objectContaining({ segmentId: "segment-2", status: "failed", attemptsUsed: 1 }),
    ]));

    const resumed = await executeAutomationAction(stage, context(checkpoints, checkpoints));
    expect(fixture.calls.map((call) => call.offset)).toEqual([0, 5, 5, 10, 15]);
    const artifact = resumed.artifacts[0]!;
    expect(artifact.validity).toBe("valid");
    expect(artifact.data).toMatchObject({ schema: "am_stage_segment_bank_v1", segments: windows.map((window) => expect.objectContaining({ id: window.id, parameters: [expect.objectContaining({ technical_name: `parameter_at_${window.startSeconds}`, automation_segment: window.id })] })) });
    expect((artifact.data as { segments: unknown[] }).segments).toHaveLength(4);
  });
});
