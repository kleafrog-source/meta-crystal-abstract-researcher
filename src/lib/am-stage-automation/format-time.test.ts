import { describe, expect, it } from "vitest";
import { formatAutomationTimestamp } from "./format-time";

describe("Automation timestamp formatting", () => {
  it("uses a stable UTC representation for server and browser rendering", () => {
    expect(formatAutomationTimestamp("2026-11-14T21:58:33.000Z")).toBe("2026-11-14 21:58 UTC");
    expect(formatAutomationTimestamp("invalid")).toBe("—");
  });
});
