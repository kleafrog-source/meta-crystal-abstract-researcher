// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_SCENARIOS } from "@/lib/am-stage-automation/catalog";
import { buildAutomationGraph } from "@/lib/am-stage-automation/typed-graph";
import { AutomationGraphCanvas } from "./AutomationGraphCanvas";

afterEach(cleanup);

const rScenario = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "catalogue-bank-merge-r")!;
const graph = buildAutomationGraph(rScenario.stages);
const stageId = (actionId: string) => rScenario.stages.find((stage) => stage.actionId === actionId)!.stageId;
const unconnectedBriefToQwen = buildAutomationGraph([
  structuredClone(rScenario.stages[0]!),
  { ...structuredClone(rScenario.stages[1]!), inputBindings: [] },
]);

describe("Automation graph connection editor", () => {
  it("connects a selected source to a compatible target through the graph", () => {
    const onConnect = vi.fn();
    render(<AutomationGraphCanvas graph={unconnectedBriefToQwen} canConnect={() => true} onConnect={onConnect} onDisconnect={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Select source brief.from_template" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect brief.from_template to text.qwen.resolved" }));

    expect(onConnect).toHaveBeenCalledWith(stageId("brief.from_template"), stageId("text.qwen.resolved"));
  });

  it("does not offer an incompatible target and supports disconnecting a typed edge", () => {
    const onDisconnect = vi.fn();
    const incompatibleGraph = buildAutomationGraph([structuredClone(rScenario.stages[0]!), structuredClone(rScenario.stages[2]!)]);
    render(<AutomationGraphCanvas graph={incompatibleGraph} canConnect={() => false} onConnect={() => undefined} onDisconnect={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Select source brief.from_template" }));
    expect(screen.queryByRole("button", { name: "Connect brief.from_template to text.gemma.awtd" })).toBeNull();

    cleanup();
    render(<AutomationGraphCanvas graph={graph} canConnect={() => true} onConnect={() => undefined} onDisconnect={onDisconnect} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect text.qwen.resolved to data.merge" }));
    expect(onDisconnect).toHaveBeenCalledWith(expect.objectContaining({
      from: stageId("text.qwen.resolved"),
      to: stageId("data.merge"),
      toPort: "qwenBank",
      edgeKind: "data",
    }));
  });
});
