import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_SCENARIOS } from "@/lib/am-stage-automation/catalog";
import { AutomationAdvisorSettings } from "./AutomationAdvisorSettings";

const advisor = AUTOMATION_SCENARIOS.find((scenario) => scenario.id === "am2-llm-advisor-n")!.stages.find((stage) => stage.actionId === "llm.advisor")!;

describe("AutomationAdvisorSettings", () => {
  it("edits advisor contract settings without invoking a provider", () => {
    const onPatch = vi.fn();
    render(<AutomationAdvisorSettings stage={advisor as typeof advisor & { actionId: "llm.advisor" }} onPatch={onPatch} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Advisor question" }), { target: { value: "What is next?" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Advisor summary budget" }), { target: { value: "2400" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Expect advisor proposal" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Advisor allowed actions" }), { target: { value: "audio.segment, data.intersection" } });

    expect(onPatch.mock.calls.map(([patch]) => patch)).toEqual([
      { question: "What is next?" },
      { budgetChars: 2400 },
      { expectProposal: false },
      { allowedActions: ["audio.segment", "data.intersection"] },
    ]);
  });
});
