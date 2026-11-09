import { describe, expect, it } from "vitest";
import { needsAutomationSnapshot } from "./sse-cursor";

describe("Automation SSE cursor recovery", () => {
  it("sends a snapshot for a new or future cursor", () => {
    expect(needsAutomationSnapshot({ cursor: null, latest: 5, firstAfter: 1 })).toBe(true);
    expect(needsAutomationSnapshot({ cursor: 8, latest: 5, firstAfter: null })).toBe(true);
  });
  it("replays contiguous events and falls back to a snapshot on a gap", () => {
    expect(needsAutomationSnapshot({ cursor: 2, latest: 5, firstAfter: 3 })).toBe(false);
    expect(needsAutomationSnapshot({ cursor: 2, latest: 5, firstAfter: 4 })).toBe(true);
    expect(needsAutomationSnapshot({ cursor: 5, latest: 5, firstAfter: null })).toBe(false);
  });
});
