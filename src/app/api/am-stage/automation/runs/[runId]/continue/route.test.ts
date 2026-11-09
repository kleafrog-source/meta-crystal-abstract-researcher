import { describe, expect, it, vi } from "vitest";

const executor = vi.hoisted(() => ({ continueAutomation: vi.fn() }));
vi.mock("@/lib/am-stage-automation/executor", () => executor);

import { POST } from "./route";

const context = { params: Promise.resolve({ runId: "run-12345678" }) };
const request = (body: unknown) => new Request("http://localhost/api/am-stage/automation/runs/run-12345678/continue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("Automation Continue node recovery contract", () => {
  it("passes explicit saved-response reuse as a distinct action", async () => {
    executor.continueAutomation.mockResolvedValue({ id: "run-12345678", status: "running" });
    const body = { commandId: "reuse-command-123", nodeAction: { kind: "reuse_saved_response", nodeId: "segment-1" } };
    const response = await POST(request(body), context);
    expect(response.status).toBe(202);
    expect(executor.continueAutomation).toHaveBeenCalledWith("run-12345678", "reuse-command-123", body.nodeAction);
  });

  it("requires an explicit reason for a finite retry cycle", async () => {
    const response = await POST(request({ nodeAction: { kind: "retry_failed_node", nodeId: "segment-1", reason: "fixed" } }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("10 and 500 characters") });
    expect(executor.continueAutomation).not.toHaveBeenCalled();
  });
});
