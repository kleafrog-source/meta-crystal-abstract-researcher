import { describe, expect, it } from "vitest";
import { parseAdvisorProposal, summarizeAdvisorInputs } from "./llm-advisor";

describe("LLM advisor contracts", () => {
  it("summarizes bounded inputs in binding order with artifact identity and validity", () => {
    const result = summarizeAdvisorInputs([
      { artifactId: "artifact-a", actionId: "text.qwen.resolved", kind: "parameter-bank", validity: "valid", data: [{ technical_name: "a" }] },
      { artifactId: "artifact-b", actionId: "text_features.build", kind: "text-feature-snapshot", data: { description: "Observed snapshot" } },
    ], 3000);
    expect(result.steps.map((step) => step.artifactId)).toEqual(["artifact-a", "artifact-b"]);
    expect(result.steps.map((step) => step.count)).toEqual([1, 1]);
    expect(result.steps[1]?.preview).toBe("Observed snapshot");
    expect(result.usedChars).toBeLessThanOrEqual(result.budgetChars);
    expect(result.truncated).toBe(false);
  });

  it("rejects empty, over-cardinality and too-small summaries", () => {
    expect(() => summarizeAdvisorInputs([], 1000)).toThrow("LLM_ADVISOR_STEPS_INVALID");
    expect(() => summarizeAdvisorInputs(Array.from({ length: 11 }, () => ({ kind: "brief" })), 1000)).toThrow("LLM_ADVISOR_STEPS_INVALID");
    expect(() => summarizeAdvisorInputs([{ kind: "brief", data: "x" }], 1)).toThrow("ADVISOR_BUDGET_EXCEEDED");
  });

  it("validates a proposal against the registered and allowed action sets", () => {
    expect(parseAdvisorProposal('Recommendation\n{"actionId":"text.limit","rationale":"Bound text","params":{"maxChars":300}}', ["text.limit"]).proposal?.actionId).toBe("text.limit");
    expect(parseAdvisorProposal('{"actionId":"not.registered","rationale":"x","params":{}}', []).issue).toMatch(/Unsupported/u);
    expect(parseAdvisorProposal('{"actionId":"data.merge","rationale":"x","params":{}}', ["text.limit"]).issue).toMatch(/outside/u);
    expect(parseAdvisorProposal("not json", []).issue).toMatch(/could not be parsed/u);
  });
});
