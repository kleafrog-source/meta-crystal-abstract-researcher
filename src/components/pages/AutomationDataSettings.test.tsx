// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationDataSettings } from "./AutomationDataSettings";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

afterEach(cleanup);

function dataStage(actionId: "data.filter" | "data.count" | "data.select" | "data.split", requested: Record<string, unknown>) {
  return { actionId, inputBindings: [], outputDefinitions: [], settings: { requested, effective: requested, origin: "manual" } } as unknown as AutomationStageDefinition & { actionId: "data.filter" | "data.count" | "data.select" | "data.split" };
}

describe("Automation data operator settings UI", () => {
  it("edits filter rules through labeled field controls", () => {
    const onPatch = vi.fn();
    render(<AutomationDataSettings stage={dataStage("data.filter", { rules: [{ field: "similarity", op: "gt", value: 0.4 }] })} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText("Filter rule 1 field"), { target: { value: "technical_name" } });
    expect(onPatch).toHaveBeenLastCalledWith({ rules: [{ field: "technical_name", op: "gt", value: 0.4 }] });
  });

  it("edits count output and grouping independently", () => {
    const onPatch = vi.fn();
    render(<AutomationDataSettings stage={dataStage("data.count", { output: "scalar", groupBy: "none" })} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText("Count output"), { target: { value: "structured" } });
    fireEvent.change(screen.getByLabelText("Count group by"), { target: { value: "category" } });
    expect(onPatch).toHaveBeenNthCalledWith(1, { output: "structured" });
    expect(onPatch).toHaveBeenNthCalledWith(2, { groupBy: "category" });
  });

  it("switches select mode and exposes the corresponding field list", () => {
    const onPatch = vi.fn();
    const { rerender } = render(<AutomationDataSettings stage={dataStage("data.select", { mode: "summary" })} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText("Selection mode"), { target: { value: "parameters_by_name" } });
    expect(onPatch).toHaveBeenLastCalledWith({ mode: "parameters_by_name", fields: ["technical_name"] });
    rerender(<AutomationDataSettings stage={dataStage("data.select", { mode: "parameters_by_name", fields: ["technical_name"] })} onPatch={onPatch} />);
    expect(screen.getByLabelText("Technical names")).toBeTruthy();
  });

  it("adds a split channel with a concrete default rule", () => {
    const onPatch = vi.fn();
    render(<AutomationDataSettings stage={dataStage("data.split", { channels: [] })} onPatch={onPatch} />);
    fireEvent.click(screen.getByText("Add channel"));
    expect(onPatch).toHaveBeenLastCalledWith({ channels: [{ name: "channel1", rule: { type: "by_index_modulo", modulus: 2, remainder: 0 } }] });
  });
});
