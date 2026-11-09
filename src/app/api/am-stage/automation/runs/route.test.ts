import { beforeEach, describe, expect, it, vi } from "vitest";

const executor = vi.hoisted(() => ({ listAutomationRuns: vi.fn(), startAutomation: vi.fn() }));
vi.mock("@/lib/am-stage-automation/executor", () => executor);

import { GET, POST } from "./route";

describe("automation runs API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes run-history filters to the storage-backed executor", async () => {
    executor.listAutomationRuns.mockResolvedValue([{ id: "run-a", status: "finished" }]);
    const response = await GET(new Request("http://localhost/api/am-stage/automation/runs?status=finished&scenarioId=audio.clap&q=choir&limit=5"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs: [{ id: "run-a", status: "finished" }] });
    expect(executor.listAutomationRuns).toHaveBeenCalledWith(expect.objectContaining({ status: "finished", scenarioId: "audio.clap", query: "choir", limit: 5 }));
  });

  it("accepts a stable start command and returns the created run", async () => {
    const payload = { commandId: "start-command-123", scenarioId: "brief.qwen", inputs: { brief: "dark choir" } };
    executor.startAutomation.mockResolvedValue({ id: "run-new", status: "running" });
    const response = await POST(new Request("http://localhost/api/am-stage/automation/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ run: { id: "run-new", status: "running" } });
    expect(executor.startAutomation).toHaveBeenCalledWith(payload);
  });

  it("maps executor lock conflicts to HTTP 409", async () => {
    executor.startAutomation.mockRejectedValue(new Error("EXECUTOR_BUSY:run-active"));
    const response = await POST(new Request("http://localhost/api/am-stage/automation/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId: "start-command-456", scenarioId: "brief.qwen", inputs: {} }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "EXECUTOR_BUSY:run-active", code: "EXECUTOR_BUSY" });
  });
});
