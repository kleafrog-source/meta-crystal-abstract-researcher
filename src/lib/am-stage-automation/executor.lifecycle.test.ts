import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    automationExecutorLock: { findUnique: vi.fn(), updateMany: vi.fn() },
    automationRun: { findMany: vi.fn(), update: vi.fn() },
    automationStageExecution: { findMany: vi.fn(), updateMany: vi.fn() },
    automationAttempt: { updateMany: vi.fn() },
    automationRunEvent: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  ensureAutomationDirectories: vi.fn(),
  seedBuiltInScenarios: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("./storage", () => ({ ensureAutomationDirectories: mocks.ensureAutomationDirectories }));
vi.mock("./scenarios", () => ({ seedBuiltInScenarios: mocks.seedBuiltInScenarios }));

describe("automation executor recovery lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as typeof globalThis & { __amStageAutomationInit?: Promise<void> }).__amStageAutomationInit = undefined;
    for (const model of Object.values(mocks.db)) {
      if (typeof model === "object" && model !== null) for (const method of Object.values(model)) if (typeof method === "function") method.mockReset();
    }
    mocks.ensureAutomationDirectories.mockResolvedValue(undefined);
    mocks.seedBuiltInScenarios.mockResolvedValue(undefined);
    mocks.db.automationExecutorLock.findUnique.mockResolvedValue({ id: "application", ownerInstanceId: null, activeRunId: "run-stale" });
    mocks.db.automationRun.findMany.mockResolvedValue([{ id: "run-stale" }]);
    mocks.db.automationStageExecution.findMany.mockResolvedValue([{ id: "execution-stale" }]);
    mocks.db.$transaction.mockResolvedValue([]);
    mocks.db.automationRunEvent.findFirst.mockResolvedValue(null);
    mocks.db.automationRunEvent.create.mockImplementation(async ({ data }) => data);
    mocks.db.automationExecutorLock.updateMany.mockResolvedValue({ count: 1 });
  });

  it("marks orphaned active work interrupted, clears the lock and records restart event", async () => {
    const { initializeAutomation } = await import("./executor");
    await initializeAutomation();

    expect(mocks.db.automationStageExecution.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { runId: "run-stale", status: "running" },
      data: { status: "interrupted" },
    }));
    expect(mocks.db.automationRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-stale" },
      data: expect.objectContaining({ status: "interrupted", lastErrorSummary: expect.stringContaining("restarted") }),
    }));
    expect(mocks.db.automationExecutorLock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "application", activeRunId: "run-stale" },
      data: { activeRunId: null, ownerInstanceId: null },
    }));
    expect(mocks.db.automationRunEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ runId: "run-stale", type: "run.interrupted", payloadJson: expect.stringContaining("server_restart") }),
    }));
  });
});
