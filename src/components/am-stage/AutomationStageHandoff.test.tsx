// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { AutomationStageHandoff } from "./AutomationStageHandoff";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));

const props = (initialSelection = { runId: "", stageId: "", attemptId: "", artifactId: "" }) => ({
  rangeStart: 0, rangeEnd: 0, brief: "", textIndex: "qwen3" as const, topK: 5, sources: {}, scopes: {}, domainLayers: [],
  vocalMatrixMode: false, searchMode: "single" as const, queryB: "", transitionRatio: 0.5, instructionContext: [], initialSelection,
});

describe("AutomationStageHandoff", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => cleanup());

  it("does not replace an explicit selection with the first Run and links the exact artifact attempt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("?limit=50")) return Response.json({ runs: [
        { id: "run-first", title: "First", status: "succeeded", scenarioId: null, createdAt: "", currentStageId: null, stageCount: 1 },
        { id: "run-explicit", title: "Explicit", status: "succeeded", scenarioId: null, createdAt: "", currentStageId: null, stageCount: 1 },
      ] });
      return Response.json({ run: { stages: [{ stageId: "step-1", actionId: "text.qwen.resolved", status: "succeeded", successfulAttemptId: "attempt-9", artifacts: [{ id: "artifact-7", attemptId: "attempt-9", kind: "parameter-bank", bankId: "qwen-text", pass: "resolved" }] }] } });
    });
    render(<AutomationStageHandoff {...props({ runId: "run-explicit", stageId: "step-1", attemptId: "attempt-9", artifactId: "artifact-7" })} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/am-stage/automation/runs/run-explicit", expect.objectContaining({ cache: "no-store" })));
    expect((screen.getByLabelText("Run") as HTMLSelectElement).value).toBe("run-explicit");
    expect((screen.getByLabelText("Stage") as HTMLSelectElement).value).toBe("step-1");
    expect((screen.getByLabelText("Artifact") as HTMLSelectElement).value).toBe("artifact-7:attempt-9");
    expect(screen.getByRole("link", { name: "View selected result" }).getAttribute("href")).toBe("/am-stage?automationRun=run-explicit&stage=step-1&attempt=attempt-9&artifact=artifact-7&automationView=1#am-stage-project");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/am-stage/automation/runs/run-first");
  });

  it("does not load or select a Run until a user chooses one", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ runs: [
      { id: "run-first", title: "First", status: "succeeded", scenarioId: null, createdAt: "", currentStageId: null, stageCount: 1 },
    ] }));
    render(<AutomationStageHandoff {...props()} />);
    await screen.findByRole("option", { name: "First · succeeded" });
    expect((screen.getByLabelText("Run") as HTMLSelectElement).value).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Run"), { target: { value: "run-first" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/am-stage/automation/runs/run-first", expect.objectContaining({ cache: "no-store" }));
  });
});
