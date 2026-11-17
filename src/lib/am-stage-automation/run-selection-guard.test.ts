import { describe, expect, it } from "vitest";
import { RunSelectionGuard } from "./run-selection-guard";

describe("RunSelectionGuard", () => {
  it("drops a late response after the user selects another Run", () => {
    const guard = new RunSelectionGuard();
    guard.select("run-a");
    const oldRequest = guard.begin("run-a");
    expect(oldRequest).not.toBeNull();

    guard.select("run-b");
    const currentRequest = guard.begin("run-b");
    expect(guard.accepts(oldRequest!, "run-a")).toBe(false);
    expect(guard.accepts(currentRequest!, "run-b")).toBe(true);
  });

  it("drops an earlier overlapping refresh for the same selected Run", () => {
    const guard = new RunSelectionGuard();
    guard.select("run-a");
    const first = guard.begin("run-a");
    const second = guard.begin("run-a");
    expect(guard.accepts(first!, "run-a")).toBe(false);
    expect(guard.accepts(second!, "run-a")).toBe(true);
  });

  it("rejects a response whose identity differs from the request", () => {
    const guard = new RunSelectionGuard();
    guard.select("run-a");
    const request = guard.begin("run-a");
    expect(guard.accepts(request!, "run-other")).toBe(false);
  });
});
