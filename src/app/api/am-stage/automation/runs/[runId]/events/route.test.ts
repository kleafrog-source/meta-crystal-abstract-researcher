import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    automationRun: { findUnique: vi.fn() },
    automationRunEvent: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  initializeAutomation: vi.fn(),
  getAutomationRun: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/am-stage-automation/executor", () => ({ initializeAutomation: mocks.initializeAutomation, getAutomationRun: mocks.getAutomationRun }));

import { GET } from "./route";

const context = { params: Promise.resolve({ runId: "run-sse" }) };
const event = (sequence: number, type: string) => ({ sequence, type, stageId: null, attemptId: null, occurredAt: new Date(0), payloadJson: JSON.stringify({ sequence }) });

describe("automation run events SSE API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initializeAutomation.mockResolvedValue(undefined);
    mocks.getAutomationRun.mockResolvedValue(null);
  });

  it("replays every persisted terminal event before closing a completed run", async () => {
    mocks.db.automationRun.findUnique.mockResolvedValue({ id: "run-sse", status: "finished" });
    mocks.db.automationRunEvent.findFirst
      .mockResolvedValueOnce({ sequence: 2 })
      .mockResolvedValueOnce({ sequence: 1 })
      .mockResolvedValueOnce({ sequence: 2 });
    mocks.db.automationRunEvent.findMany.mockResolvedValue([event(1, "run.started"), event(2, "run.finished")]);

    const response = await GET(new Request("http://localhost/api/am-stage/automation/runs/run-sse/events?after=0"), context);
    const stream = await response.text();

    expect(stream).toContain("id: 1\nevent: automation\ndata: {\"sequence\":1,\"type\":\"run.started\"");
    expect(stream).toContain("id: 2\nevent: automation\ndata: {\"sequence\":2,\"type\":\"run.finished\"");
    expect(stream).toContain("id: 2\nevent: terminal\ndata: {\"status\":\"finished\",\"cursor\":2}");
    expect(mocks.db.automationRunEvent.findMany).toHaveBeenCalledTimes(1);
  });

  it("streams the final results event and terminal when a run finishes during the open subscription", async () => {
    mocks.db.automationRun.findUnique
      .mockResolvedValueOnce({ id: "run-sse", status: "running" })
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({ status: "finished" });
    mocks.db.automationRunEvent.findFirst
      .mockResolvedValueOnce({ sequence: 1 })
      .mockResolvedValueOnce({ sequence: 1 })
      .mockResolvedValueOnce({ sequence: 1 })
      .mockResolvedValueOnce({ sequence: 2 });
    mocks.db.automationRunEvent.findMany
      .mockResolvedValueOnce([event(1, "run.started")])
      .mockResolvedValueOnce([event(2, "stage.succeeded")]);

    const response = await GET(new Request("http://localhost/api/am-stage/automation/runs/run-sse/events?after=0"), context);
    const stream = await response.text();

    expect(stream).toContain("id: 1\nevent: automation\ndata: {\"sequence\":1,\"type\":\"run.started\"");
    expect(stream).toContain("id: 2\nevent: automation\ndata: {\"sequence\":2,\"type\":\"stage.succeeded\"");
    expect(stream).toContain("id: 2\nevent: terminal\ndata: {\"status\":\"finished\",\"cursor\":2}");
    expect(mocks.db.automationRunEvent.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.db.automationRun.findUnique).toHaveBeenCalledTimes(3);
  });
});
