import { describe, expect, it } from "vitest";
import { executeAutomationAction } from "./adapters";
import type { AutomationStageDefinition } from "./contracts";

describe("brief.from_template effective configuration", () => {
  it("uses manual node settings over workbench text and variables", async () => {
    const stage: AutomationStageDefinition = {
      stageId: "brief-template",
      actionId: "brief.from_template",
      title: "Brief from template",
      role: "brief",
      inputBindings: [],
      outputDefinitions: [{ port: "result", kind: "brief", required: true }],
      settings: {
        requested: { templateBrief: "Node {{mood}} in {{space}}", templateVariables: { mood: "calm" } },
        effective: { templateBrief: "Node {{mood}} in {{space}}", templateVariables: { mood: "calm" } },
        origin: "manual",
      },
      requiredForGoal: true,
      failurePolicy: "fail_run",
      allowedFallbacks: [],
      available: true,
    };
    const result = await executeAutomationAction(stage, {
      runId: "run",
      stageId: stage.stageId,
      attemptId: "attempt",
      signal: new AbortController().signal,
      inputs: { workspaceSnapshot: { templateBrief: "Workbench {{mood}}", templateVariables: { mood: "workbench", space: "wide" } } },
      settings: stage.settings.effective,
      resolvedInputs: {},
      priorNodeCheckpoints: [],
      persistNodeCheckpoint: async () => undefined,
      onProgress: async () => undefined,
    });

    expect(result.artifacts[0]?.data).toEqual({
      text: "Node calm in wide",
      source: "template",
      template: "Node {{mood}} in {{space}}",
      substitutions: { mood: "calm", space: "wide" },
    });
  });
});
