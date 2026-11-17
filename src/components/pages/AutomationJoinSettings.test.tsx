// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationJoinSettings } from "./AutomationJoinSettings";
import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

afterEach(cleanup);

function joinStage(policies: Array<Record<string, unknown>>) {
  return {
    actionId: "flow.join",
    inputBindings: [{ name: "inputs", from: "stage:branch-a", port: "then" }, { name: "inputs", from: "stage:branch-b", port: "else" }],
    settings: { requested: { policies }, effective: { policies }, origin: "manual" },
  } as unknown as AutomationStageDefinition & { actionId: "flow.join" };
}

const titles = { "branch-a": "Filter branch", "branch-b": "Else branch" };

describe("Automation join policy UI", () => {
  it("edits skip, failure, and partial policies for the correct source", () => {
    const onPolicies = vi.fn();
    const policies = [
      { binding: "branch-a", onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
      { binding: "branch-b", onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
    ];
    render(<AutomationJoinSettings stage={joinStage(policies)} sourceTitles={titles} onPolicies={onPolicies} />);
    fireEvent.change(screen.getByLabelText("Filter branch when skipped"), { target: { value: "fail" } });
    expect(onPolicies).toHaveBeenLastCalledWith([
      { binding: "branch-a", onSkipped: "fail", onFailed: "omit", onPartial: "accept" },
      { binding: "branch-b", onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
    ]);
  });

  it("exposes default text only when a branch policy requests it", () => {
    const onPolicies = vi.fn();
    const base = [
      { binding: "branch-a", onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
      { binding: "branch-b", onSkipped: "omit", onFailed: "omit", onPartial: "accept" },
    ];
    const { rerender } = render(<AutomationJoinSettings stage={joinStage(base)} sourceTitles={titles} onPolicies={onPolicies} />);
    fireEvent.change(screen.getByLabelText("Filter branch when failed"), { target: { value: "default" } });
    expect(onPolicies).toHaveBeenLastCalledWith([
      { binding: "branch-a", onSkipped: "omit", onFailed: "default", onPartial: "accept" },
      base[1],
    ]);
    rerender(<AutomationJoinSettings stage={joinStage([{ binding: "branch-a", onSkipped: "omit", onFailed: "default", onPartial: "accept" }, base[1]])} sourceTitles={titles} onPolicies={onPolicies} />);
    expect(screen.getByLabelText("Filter branch default text")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter branch default text"), { target: { value: "No rows" } });
    expect(onPolicies).toHaveBeenLastCalledWith([{ binding: "branch-a", onSkipped: "omit", onFailed: "default", onPartial: "accept", defaultText: "No rows" }, base[1]]);
  });
});
