import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestLocalAdvisor } = vi.hoisted(() => ({ requestLocalAdvisor: vi.fn() }));
vi.mock("./local-advisor", () => ({ requestLocalAdvisor }));

import { executeAutomationAction } from "./adapters";
import type { AutomationAdapterContext, AutomationStageDefinition } from "./contracts";

const stage: AutomationStageDefinition = {
  stageId: "advisor", actionId: "llm.advisor", title: "Advisor", role: "llm",
  inputBindings: [], outputDefinitions: [{ port: "result", kind: "llm-advice", required: true }],
  settings: { requested: {}, effective: {}, origin: "scenario_default" }, requiredForGoal: true,
  failurePolicy: "fail_run", allowedFallbacks: [], available: true,
};

const context = (): AutomationAdapterContext => ({
  runId: "run-fixed", stageId: "advisor", attemptId: "attempt-fixed", signal: new AbortController().signal,
  inputs: {},
  settings: { question: "What should follow?", budgetChars: 1500, expectProposal: true, allowedActions: ["text.limit"] },
  resolvedInputs: { steps: [
    { artifactId: "qwen-artifact", actionId: "text.qwen.resolved", kind: "parameter-bank", validity: "valid", data: [{ technical_name: "tempo_bpm" }] },
    { artifactId: "snapshot-artifact", actionId: "text_features.build", kind: "text-feature-snapshot", validity: "valid", data: { description: "Observed feature snapshot" } },
  ] },
  priorNodeCheckpoints: [], persistNodeCheckpoint: vi.fn(), onProgress: vi.fn(),
});

describe("llm.advisor adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("persists a bounded advisory artifact with both input refs and labels a test response without executing its proposal", async () => {
    requestLocalAdvisor.mockResolvedValue({
      text: 'Рекомендация: ограничить контекст.\n{"actionId":"text.limit","rationale":"Keep it concise","params":{"maxChars":200}}',
      provider: "ollama", actualProvider: "fixed-test-provider", model: "test", actualModel: "fixed-n",
    });
    const result = await executeAutomationAction(stage, context());
    expect(requestLocalAdvisor).toHaveBeenCalledTimes(1);
    const artifact = result.artifacts[0]!;
    expect(artifact.kind).toBe("llm-advice");
    expect(artifact.modelBinding).toEqual({ provider: "fixed-test-provider", model: "fixed-n" });
    expect(artifact.data).toMatchObject({
      schema: "am2_llm_advice_v1", executionPolicy: "advisory-only",
      proposalValid: true, proposal: { actionId: "text.limit", params: { maxChars: 200 } },
      provenance: { source: "fixed-test-provider" },
    });
    expect((artifact.data as { summary: { steps: Array<{ artifactId: string | null }> } }).summary.steps.map((step) => step.artifactId)).toEqual(["qwen-artifact", "snapshot-artifact"]);
    expect(result.artifacts).toHaveLength(1);
  });

  it("keeps a malformed/out-of-policy proposal advisory and records the reason", async () => {
    requestLocalAdvisor.mockResolvedValue({ text: '{"actionId":"data.merge","rationale":"outside allowlist","params":{}}', provider: "ollama", actualProvider: "fixed-test-provider" });
    const result = await executeAutomationAction(stage, context());
    expect(result.artifacts[0]!.data).toMatchObject({ executionPolicy: "advisory-only", proposalValid: false });
    expect(result.artifacts[0]!.warnings?.[0]).toMatch(/outside the allowedActions/u);
  });
});
