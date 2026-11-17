import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";

const gate = vi.hoisted(() => {
  let markStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const lateResult = new Promise<void>((resolve) => { release = resolve; });
  let responseSignalAborted: boolean | null = null;
  return {
    started,
    markStarted,
    lateResult,
    release: () => release(),
    captureSignal: (aborted: boolean) => { responseSignalAborted = aborted; },
    get responseSignalAborted() { return responseSignalAborted; },
  };
});

vi.mock("@/lib/rag-v3/managed-rebuild", () => ({
  getArtifactStatuses: async () => ({
    artifacts: [
      { kind: "composite", status: "ready", model: "acceptance-fixture", fingerprint: "fixture-only" },
      { kind: "embeddinggemma2_text", status: "ready", model: "acceptance-fixture", fingerprint: "fixture-only" },
    ],
    banks: [], active_model: "fixture", active_endpoint: "fixture", registry_sha256: "fixture",
    active_parameters: 1, active_version: "fixture", source_snapshot_sha256: "fixture",
    effective_catalogue_revision: "fixture", tombstoned_live_count: 0, excluded_live_count: 0,
    active_corpus_ready: true, active_corpus_block_reason: null, corpus_candidates: [],
  }),
}));

vi.mock("@/app/api/rag-v3/propose-parameters/route", () => ({
  POST: async (request: Request) => {
    gate.markStarted();
    await gate.lateResult; // Simulate a provider that returns after a remote stop and ignores Request.signal.
    gate.captureSignal(request.signal.aborted);
    return Response.json({ results: [] });
  },
}));

import { db } from "@/lib/db";
import { createPreview, getAutomationRun, initializeAutomation, startAutomation } from "./executor";
import { automationRoot } from "./storage";

const scenarioId = "catalogue-bank-merge-r";
const inputs = { workspaceSnapshot: { templateVariables: { mood: "calm", space: "wide" }, searchMode: "single" as const } };
const isolatedAcceptanceEnabled = process.env.AUTOMATION_CROSS_PROCESS_STOP_ACCEPTANCE === "1";
const describeAcceptance = isolatedAcceptanceEnabled ? describe : describe.skip;

async function waitForTerminalRun(runId: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const run = await getAutomationRun(runId);
    if (run && ["finished", "failed", "stopped", "interrupted"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Run ${runId} did not finish within 15 seconds.`);
}

describeAcceptance("Automation executor cross-process stop fence", () => {
  afterAll(async () => { await db.$disconnect(); });

  it("rejects a late provider result after persistent stop without a local AbortController", async () => {
    await initializeAutomation();
    const preview = await createPreview({ scenarioId, inputs });
    expect(preview.blockers).toEqual([]);

    const started = await startAutomation({
      commandId: `cross-process-stop-${randomUUID()}`,
      scenarioId,
      inputs,
      title: "Cross process stop regression",
    });
    if (!started) throw new Error("Automation Run was not persisted after start.");

    await gate.started;
    const beforeStop = await db.automationRun.findUniqueOrThrow({ where: { id: started.id } });
    expect(beforeStop.status).toBe("running");
    const stopRequestedAt = new Date();
    const latestEvent = await db.automationRunEvent.findFirst({
      where: { runId: started.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    await db.$transaction([
      db.automationRun.update({ where: { id: started.id }, data: { status: "stopping", stopRequestedAt, stopReason: "user_request" } }),
      db.automationRunEvent.create({
        data: {
          id: randomUUID(), runId: started.id, sequence: (latestEvent?.sequence ?? 0) + 1,
          type: "run.stop_requested", payloadJson: JSON.stringify({ commandId: "remote-process-stop-command" }),
        },
      }),
    ]);

    gate.release();
    const result = await waitForTerminalRun(started.id);
    const fs = await import("node:fs/promises");
    const artifactDirectory = path.join(automationRoot(), "runs", started.id, "artifacts");
    const artifactFiles = (await fs.readdir(artifactDirectory)).sort();
    const expectedArtifactFiles = result.stages.flatMap((stage) => stage.artifacts.map((artifact) => `${artifact.id}.json`)).sort();

    expect(result.status).toBe("stopped");
    expect(gate.responseSignalAborted).toBe(false);
    expect(result.stages[0]?.status).toBe("succeeded");
    expect(result.stages[1]?.status).toBe("cancelled");
    expect(result.stages[1]?.attempts.at(-1)?.status).toBe("cancelled");
    expect(result.stages[1]?.successfulAttemptId).toBeNull();
    expect(result.stages.slice(1).flatMap((stage) => stage.artifacts)).toEqual([]);
    expect(artifactFiles).toEqual(expectedArtifactFiles);
  });
});
