import { describe, expect, it } from "vitest";
import { parseBriefTemplateVariables, planUniformWindows, resolveAutomationTopK, resolveBriefTemplate, selectOrderedEvents } from "./policies";

describe("Automation bounded planning policies", () => {
  it("resolves only explicitly supplied template values", () => {
    expect(resolveBriefTemplate("Sound: {{tone}}", { tone: "warm" })).toEqual({ text: "Sound: warm", unresolved: [] });
    expect(resolveBriefTemplate("Sound: {{tone}}", {})).toEqual({ text: "Sound: {{tone}}", unresolved: ["tone"] });
  });
  it("parses explicit template substitutions and rejects malformed rows", () => {
    expect(parseBriefTemplateVariables("tone=warm\nscene=cathedral")).toEqual({ tone: "warm", scene: "cathedral" });
    expect(() => parseBriefTemplateVariables("missing separator")).toThrow(/key=value/u);
  });
  it("covers the entire range with exactly N ordered windows", () => {
    const plan = planUniformWindows(2, 14, { mode: "exact", requestedCount: 6, maximumCount: 6, intervalSeconds: 5 });
    expect(plan.windows).toHaveLength(6);
    expect(plan.windows[0].startSeconds).toBe(2);
    expect(plan.windows.at(-1)?.endSeconds).toBe(14);
    expect(plan.coverageRatio).toBe(1);
    expect(plan.windows.every((window) => window.durationSeconds > 0)).toBe(true);
  });

  it("builds at-most plans under the selected limit without dropping range remainder", () => {
    const plan = planUniformWindows(0, 27.8, { mode: "at_most", requestedCount: 15, maximumCount: 7, intervalSeconds: 5 });
    expect(plan.windows.length).toBeLessThanOrEqual(7);
    expect(plan.windows.at(-1)?.endSeconds).toBe(27.8);
  });

  it("selects distinct chronological event boundaries across the range", () => {
    const result = selectOrderedEvents([0, 1.001, 1.0014, 2.8, 5.2, 8.9, 10], 0, 10, 4);
    expect(result.selected).toHaveLength(3);
    expect(result.selected).toEqual([...result.selected].sort((a, b) => a - b));
    expect(new Set(result.selected).size).toBe(3);
  });

  it("keeps automatic text Top-K independent of audio window count", () => {
    expect(resolveAutomationTopK({ requested: 50, automatic: true, requestCount: 1 }).effective).toBe(50);
    expect(resolveAutomationTopK({ requested: 50, automatic: true, requestCount: 240 }).effective).toBe(20);
  });
});
