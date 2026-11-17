import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({ loadProvider: vi.fn() }));
vi.mock("@/lib/llm/factory", () => ({ loadProviderForModelListing: providerMocks.loadProvider }));

import { executeAutomationAction } from "./adapters";
import type { AutomationAdapterContext, AutomationStageDefinition } from "./contracts";
import { NodeOutcomeUnknownError } from "./node-retry";

const provider = {
  id: "fixed-test-provider",
  chat: vi.fn(),
  listModels: vi.fn(),
};

const stage: AutomationStageDefinition = {
  stageId: "brief",
  actionId: "brief.combine_segment_texts",
  title: "Synthesize Brief",
  role: "Brief synthesis",
  inputBindings: [],
  outputDefinitions: [{ port: "result", kind: "brief", required: true }],
  settings: { requested: {}, effective: { maxTokens: 512 }, origin: "manual" },
  requiredForGoal: true,
  failurePolicy: "fail_run",
  allowedFallbacks: [],
  available: true,
};

function makeContext(checkpoints: Array<Record<string, unknown>>, persisted: Array<Record<string, unknown>>, signal = new AbortController().signal): AutomationAdapterContext {
  return {
    runId: "run-fixture",
    stageId: "brief",
    attemptId: "attempt-fixture",
    signal,
    inputs: {
      briefAssembly: {
        sources: { reverseQuery: false, interpretations: false, textFeatures: false, trackDraft: true },
        executor: "freellmapi",
        trackDraft: { sessionId: "session-fixture", language: "en", text: "A short fixed description.", snapshotUpdatedAt: "2026-11-15T00:00:00.000Z" },
      },
    },
    settings: { maxTokens: 512 },
    resolvedInputs: {},
    priorNodeCheckpoints: checkpoints,
    persistNodeCheckpoint: async (checkpoint) => { persisted.push(structuredClone(checkpoint)); },
    onProgress: async () => {},
  };
}

describe("Brief provider request replay safety", () => {
  beforeEach(() => {
    providerMocks.loadProvider.mockReset();
    provider.chat.mockReset();
    providerMocks.loadProvider.mockResolvedValue({
      provider,
      settings: { freeLLMApiModel: "fixture-model", maxTokens: 512 },
    });
  });

  it("persists an ambiguous request outcome and does not call the provider again after reopen", async () => {
    provider.chat
      .mockRejectedValueOnce(new TypeError("fetch failed after request send"))
      .mockResolvedValueOnce({ text: "This second call must not happen.", provider: provider.id, model: "fixture-model", requestedModel: "fixture-model" });
    const persisted: Array<Record<string, unknown>> = [];
    const context = makeContext([], persisted);

    await expect(executeAutomationAction(stage, context)).rejects.toBeInstanceOf(NodeOutcomeUnknownError);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(persisted.map((checkpoint) => checkpoint.status)).toContain("request_started");
    expect(persisted.at(-1)).toMatchObject({
      status: "outcome_unknown",
      requestDiagnostics: { replayPolicy: "at_most_once", provider: provider.id },
    });

    provider.chat.mockClear();
    const reopened = makeContext(persisted, []);
    await expect(executeAutomationAction(stage, reopened)).rejects.toBeInstanceOf(NodeOutcomeUnknownError);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it("blocks Continue after a completed but unusable provider response", async () => {
    provider.chat.mockResolvedValueOnce({ text: "", provider: provider.id, model: "fixture-model", requestedModel: "fixture-model" });
    const persisted: Array<Record<string, unknown>> = [];

    await expect(executeAutomationAction(stage, makeContext([], persisted))).rejects.toBeInstanceOf(NodeOutcomeUnknownError);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(persisted.at(-1)).toMatchObject({ status: "outcome_unknown", requestDiagnostics: { replayPolicy: "at_most_once" } });

    provider.chat.mockClear();
    await expect(executeAutomationAction(stage, makeContext(persisted, []))).rejects.toBeInstanceOf(NodeOutcomeUnknownError);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it("blocks Continue after cancellation once a provider request has started", async () => {
    const controller = new AbortController();
    provider.chat.mockImplementationOnce((_messages, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")), { once: true });
    }));
    const persisted: Array<Record<string, unknown>> = [];
    const pending = executeAutomationAction(stage, makeContext([], persisted, controller.signal));
    await vi.waitFor(() => expect(provider.chat).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(persisted.at(-1)).toMatchObject({ status: "outcome_unknown", attemptsUsed: 1 });

    provider.chat.mockClear();
    await expect(executeAutomationAction(stage, makeContext(persisted, []))).rejects.toBeInstanceOf(NodeOutcomeUnknownError);
    expect(provider.chat).not.toHaveBeenCalled();
  });
});
