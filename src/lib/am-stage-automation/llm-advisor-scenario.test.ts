import { describe, expect, it } from "vitest";
import { ACTION_SUPPORTED, AUTOMATION_SCENARIOS } from "./catalog";
import { validateUserScenarioDefinition } from "./scenario-editor";
import { buildAutomationGraph, portsForStage, validateTypedAutomationGraph } from "./typed-graph";

const N = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-llm-advisor-n")!;

describe("N local advisor scenario", () => {
  it("preserves the source four-stage route, two ordered step summaries and non-executable proposal policy", () => {
    expect(ACTION_SUPPORTED.has("llm.advisor")).toBe(true);
    expect(N.stages.map((stage) => stage.actionId)).toEqual(["text.qwen.resolved", "text_features.build", "llm.advisor", "text.limit"]);
    const [qwen, snapshot, advisor, limit] = N.stages;
    expect(snapshot!.inputBindings.filter((binding) => binding.port !== "order")).toEqual([{ name: "parameterBank1", from: `stage:${qwen!.stageId}`, port: "result" }]);
    expect(advisor!.inputBindings.filter((binding) => binding.port !== "order")).toEqual([
      { name: "steps", from: `stage:${qwen!.stageId}`, port: "result" },
      { name: "steps", from: `stage:${snapshot!.stageId}`, port: "result" },
    ]);
    expect(limit!.inputBindings.find((binding) => binding.port !== "order")).toEqual({ name: "text", from: `stage:${advisor!.stageId}`, port: "result" });
    expect(N.preparationPolicies).toMatchObject({ advisor: "ollama-local-only", proposal: "non-executable" });
    expect(validateUserScenarioDefinition(N)).toEqual([]);
    expect(validateTypedAutomationGraph(N.stages)).toEqual([]);
    expect(portsForStage(advisor!)?.inputs.find((port) => port.id === "steps")).toMatchObject({ multiple: true, required: true });
    expect(buildAutomationGraph(N.stages).edges.filter((edge) => edge.to === advisor!.stageId && edge.edgeKind === "data").map((edge) => edge.toPort)).toEqual(["steps", "steps"]);
  });

  it("rejects a missing step input, excess step inputs and an unregistered proposal action", () => {
    const missing = structuredClone(N);
    missing.stages[2]!.inputBindings = missing.stages[2]!.inputBindings.filter((binding) => binding.port === "order");
    expect(validateUserScenarioDefinition(missing).join(" ")).toContain("one to ten step-summary inputs");
    expect(validateTypedAutomationGraph(missing.stages).join(" ")).toMatch(/required input.*steps/u);

    const tooMany = structuredClone(N);
    const advisor = tooMany.stages[2]!;
    advisor.inputBindings.push(...Array.from({ length: 9 }, (_, index) => ({ name: "steps", from: `external:step${index}`, port: "result" })));
    expect(validateUserScenarioDefinition(tooMany).join(" ")).toContain("one to ten step-summary inputs");

    const invalidAction = structuredClone(N);
    invalidAction.stages[2]!.settings.requested.allowedActions = ["not.registered"];
    invalidAction.stages[2]!.settings.effective.allowedActions = ["not.registered"];
    expect(validateUserScenarioDefinition(invalidAction).join(" ")).toContain("registered action IDs");
  });

  it("allows the AM2 question binding contract when the inline question is intentionally empty", () => {
    const boundQuestion = structuredClone(N);
    boundQuestion.stages[2]!.settings.effective.question = "";
    boundQuestion.stages[2]!.settings.requested.question = "";
    boundQuestion.stages[2]!.inputBindings.push({ name: "question", from: "external:brief", port: "result" });
    expect(validateUserScenarioDefinition(boundQuestion)).toEqual([]);
  });
});
