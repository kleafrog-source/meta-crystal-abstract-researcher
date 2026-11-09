// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationBriefResult, type BriefViewArtifact } from "./AutomationBriefResult";
import type { BriefImportState, BriefSelectionIdentity } from "@/lib/am-stage-automation/brief-stage-apply";

const selection: BriefSelectionIdentity = { runId: "run-1", stageId: "stage-1", attemptId: "attempt-1", artifactId: "artifact-1" };
const artifact: BriefViewArtifact = {
  ...selection, runTitle: "Saved result", successfulAttemptId: "attempt-1", schemaVersion: 1,
  kind: "brief", actionId: "brief.combine_segment_texts", modality: "text", validity: "valid",
  artifactContractConsistent: true, data: { text: "Generated Brief" },
};
const applied: BriefImportState = {
  source: { ...selection, actionId: "brief.combine_segment_texts", schemaVersion: 1, modality: "text" },
  appliedText: "Generated Brief", manuallyEdited: true,
  appliedSources: [JSON.stringify([selection.runId, selection.stageId, selection.attemptId, selection.artifactId])],
  operationReceipts: { "op-first": JSON.stringify([selection.runId, selection.stageId, selection.attemptId, selection.artifactId]) },
};

const props = (overrides: Partial<React.ComponentProps<typeof AutomationBriefResult>> = {}) => ({
  artifact, selection, selectionCurrent: true, currentText: "", targetSessionId: "session-1", importState: null,
  onApply: vi.fn(), ...overrides,
});

describe("AutomationBriefResult", () => {
  beforeEach(() => { vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "op-test") }); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("views the explicitly selected Brief without mutating the session", () => {
    const onApply = vi.fn();
    render(<AutomationBriefResult {...props({ onApply })} />);
    expect(screen.getByTestId("automation-brief-text").textContent).toBe("Generated Brief");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("applies to an empty Brief without opening replacement confirmation", () => {
    const onApply = vi.fn();
    render(<AutomationBriefResult {...props({ onApply })} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to Brief" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ mode: "ordinary", expectedText: "", expectedSessionId: "session-1", selection }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("requires confirmation for nonempty replacement and cancel leaves state untouched", () => {
    const onApply = vi.fn();
    render(<AutomationBriefResult {...props({ currentText: "Current Brief", onApply })} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to Brief" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Current Brief");
    expect(screen.getByRole("alertdialog").textContent).toContain("Generated Brief");
    fireEvent.click(screen.getByRole("button", { name: "Cancel replacement" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("confirms replacement only while target session, text, and selected source are unchanged", () => {
    const onApply = vi.fn();
    const view = render(<AutomationBriefResult {...props({ currentText: "Current Brief", onApply })} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to Brief" }));
    view.rerender(<AutomationBriefResult {...props({ currentText: "Edited while dialog open", onApply })} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("Edited while dialog open");
    expect(screen.getByRole("alertdialog").textContent).toContain("proposal was refreshed");
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ expectedText: "Edited while dialog open", expectedSessionId: "session-1", mode: "confirmed-replace" }));
  });

  it("refreshes the pending source after artifact or session selection changes", () => {
    const onApply = vi.fn();
    const view = render(<AutomationBriefResult {...props({ currentText: "Current Brief", onApply })} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to Brief" }));
    const nextArtifact: BriefViewArtifact = { ...artifact, artifactId: "artifact-2", data: { text: "New selected Brief" } };
    const nextSelection = { ...selection, artifactId: "artifact-2" };
    view.rerender(<AutomationBriefResult {...props({ artifact: nextArtifact, selection: nextSelection, currentText: "Current Brief changed", targetSessionId: "session-2", onApply })} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("New selected Brief");
    expect(screen.getByRole("alertdialog").textContent).toContain("Current Brief changed");
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ selection: nextSelection, expectedSessionId: "session-2", expectedText: "Current Brief changed" }));
  });

  it("offers intentional replacement after edit but preserves the source on ordinary repeat", () => {
    const onApply = vi.fn();
    render(<AutomationBriefResult {...props({ currentText: "My edit", importState: applied, onApply })} />);
    fireEvent.click(screen.getByRole("button", { name: /Apply to Brief/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ mode: "ordinary" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Replace edited Brief with this artifact" }));
    expect(screen.getByRole("alertdialog")).not.toBeNull();
  });

  it("does not offer Apply for an invalid or stale artifact selection", () => {
    render(<AutomationBriefResult {...props({ selectionCurrent: false })} />);
    expect((screen.getByRole("button", { name: "Apply to Brief" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
