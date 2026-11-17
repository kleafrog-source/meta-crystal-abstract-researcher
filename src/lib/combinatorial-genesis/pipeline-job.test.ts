import { describe, expect, it } from "vitest";
import { restartPipelineJob, startPipelineJob } from "./pipeline-job";

describe("legacy pipeline job entrypoint", () => {
  it("rejects direct starts and points callers to the snapshot candidate workflow", async () => {
    await expect(startPipelineJob()).resolves.toEqual({
      started: false,
      reason: "legacy_pipeline_disabled_use_service_bay_candidate_workflow",
    });
  });

  it("does not stop a running legacy process as part of a rejected restart", async () => {
    await expect(restartPipelineJob()).resolves.toEqual({
      restarted: false,
      reason: "legacy_pipeline_disabled_use_service_bay_candidate_workflow",
    });
  });
});
