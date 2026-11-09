import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { NodeRequestError } from "./node-retry";
import { executeSegmentTextNodes } from "./segment-text-execution";
import { beginNodeRetryCycle } from "./reverse-query-checkpoint";

const nodes = [1, 2, 3].map((number) => ({ id: `node-${number}`, startSeconds: number * 10, endSeconds: number * 10 + 5, snapshot: { number } }));

describe("executeSegmentTextNodes", () => {
  it("persists each successful node and resumes it without another request", async () => {
    const checkpoints: Array<Record<string, unknown>> = [];
    const request = vi.fn(async (node: (typeof nodes)[number]) => {
      if (node.id === "node-2") throw new NodeRequestError("malformed model response", 502, undefined, "format", { rawResponse: "{truncated", rawResponseSha256: "safe-hash", rawResponseBytes: 10 });
      return { query: node.id };
    });
    const firstController = new AbortController();
    const common = {
      actionId: "text_features.reverse_query",
      segments: nodes,
      sampleLimit: 3,
      inputArtifactId: "snapshot-1",
      promptRouteVersion: "test-v1",
      payloadFor: (node: (typeof nodes)[number]) => ({ snapshot: node.snapshot, brief: "brief" }),
      signal: firstController.signal,
      persist: async (checkpoint: Record<string, unknown>) => { checkpoints.push(checkpoint); },
      progress: async (event: Record<string, unknown>) => { if (event.phase === "retry_wait") firstController.abort(); },
    };

    await expect(executeSegmentTextNodes({ ...common, priorCheckpoints: [], request })).rejects.toMatchObject({ name: "AbortError" });
    expect(request.mock.calls.filter(([node]) => node.id === "node-1")).toHaveLength(1);
    expect(checkpoints.find((checkpoint) => checkpoint.segmentId === "node-1" && checkpoint.status === "succeeded")).toMatchObject({ result: { query: "node-1" } });
    expect(checkpoints.find((checkpoint) => checkpoint.segmentId === "node-2" && checkpoint.status === "stopped")).toMatchObject({ retryErrors: [{ details: { rawResponse: "{truncated", rawResponseSha256: "safe-hash" } }] });

    const resumedRequest = vi.fn(async (node: (typeof nodes)[number]) => ({ query: `${node.id}-resumed` }));
    const resumed = await executeSegmentTextNodes({ ...common, signal: new AbortController().signal, progress: async () => {}, priorCheckpoints: checkpoints, request: resumedRequest });
    expect(resumedRequest.mock.calls.map(([node]) => node.id)).toEqual(["node-2", "node-3"]);
    expect(resumed.results.map((item) => item.result)).toEqual([{ query: "node-1" }, { query: "node-2-resumed" }, { query: "node-3-resumed" }]);
  });

  it("marks unselected nodes and records a stopped in-flight node", async () => {
    const controller = new AbortController();
    const checkpoints: Array<Record<string, unknown>> = [];
    const result = await executeSegmentTextNodes({
      actionId: "text_features.reverse_query", segments: nodes, sampleLimit: 1, priorCheckpoints: [], inputArtifactId: null, promptRouteVersion: "test-v1",
      payloadFor: (node) => node.snapshot,
      request: async (_node, _payload, signal) => { controller.abort(); signal.throwIfAborted(); return null; },
      signal: controller.signal,
      persist: async (checkpoint) => { checkpoints.push(checkpoint); }, progress: async () => {},
    }).catch((error) => error);
    expect(result).toMatchObject({ name: "AbortError" });
    expect(checkpoints.at(-1)).toMatchObject({ segmentId: "node-1", status: "stopped" });
  });

  it("runs one explicit finite retry cycle while keeping total attempts cumulative", async () => {
    const payload = { snapshot: nodes[0].snapshot };
    const newFingerprint = createHash("sha256").update(JSON.stringify({ actionId: "text_features.reverse_query", payload, promptRouteVersion: "new" })).digest("hex");
    const failed = beginNodeRetryCycle({
      nodeKey: "text_features.reverse_query:node-1", segmentId: "node-1", inputFingerprint: "old", status: "failed", attemptsUsed: 4,
      requestDiagnostics: { promptRouteVersion: "old" },
    }, newFingerprint, "Parser corrected; retry this node only.", "2026-11-09T00:00:00.000Z");
    const checkpoints: Array<Record<string, unknown>> = [];
    const progress: Array<Record<string, unknown>> = [];
    const request = vi.fn(async () => ({ text: "usable" }));
    await executeSegmentTextNodes({
      actionId: "text_features.reverse_query", segments: nodes.slice(0, 1), sampleLimit: 1, priorCheckpoints: [failed],
      inputArtifactId: "snapshot", promptRouteVersion: "new", payloadFor: (node) => ({ snapshot: node.snapshot }), request,
      signal: new AbortController().signal, persist: async (checkpoint) => { checkpoints.push(checkpoint); }, progress: async (event) => { progress.push(event); },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(progress[0]).toMatchObject({ attempt: 1, totalAttempts: 5, retryLimit: 4, retryCycle: 2 });
    expect(checkpoints.at(-1)).toMatchObject({ status: "succeeded", attemptsUsed: 5, cycleAttemptsUsed: 1, currentRetryCycle: 2, retryReason: "Parser corrected; retry this node only." });
  });
});
