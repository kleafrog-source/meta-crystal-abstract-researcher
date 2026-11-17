import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";
import { AutomationFlowmusicSettings } from "./AutomationFlowmusicSettings";

function makeStage(): AutomationStageDefinition & { actionId: "flowmusic.export" } {
  return {
    stageId: "flowmusic", actionId: "flowmusic.export", title: "Export", role: "export", inputBindings: [], outputDefinitions: [],
    settings: { requested: { blend: false, clapWeight: 0.5, vocalMatrix: false }, effective: { blend: false, clapWeight: 0.5, vocalMatrix: false }, origin: "scenario_default" },
    requiredForGoal: true, failurePolicy: "fail_run", allowedFallbacks: [], available: true,
  };
}

describe("AutomationFlowmusicSettings", () => {
  it("exposes typed options and patches their current requested value", () => {
    const onPatch = vi.fn();
    render(<AutomationFlowmusicSettings stage={makeStage()} onPatch={onPatch} />);
    fireEvent.click(screen.getByLabelText("Blend CLAP and SigLIP"));
    fireEvent.click(screen.getByLabelText("Include vocal matrix"));
    fireEvent.change(screen.getByLabelText("CLAP weight"), { target: { value: "0.75" } });
    expect(onPatch.mock.calls).toEqual([[{ blend: true }], [{ vocalMatrix: true }], [{ clapWeight: 0.75 }]]);
  });
});
