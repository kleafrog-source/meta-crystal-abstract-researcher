// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationViewLoadingStatus } from "./AutomationViewLoadingStatus";

describe("AutomationViewLoadingStatus", () => {
  afterEach(() => cleanup());

  it("shows the selected artifact's pending state and clears it when the result is ready", () => {
    const view = render(<AutomationViewLoadingStatus loading />);
    expect(screen.getByRole("status", { name: "Loading Automation result" }).textContent).toContain("Loading selected Automation result");
    view.rerender(<AutomationViewLoadingStatus loading={false} />);
    expect(screen.queryByRole("status", { name: "Loading Automation result" })).toBeNull();
  });
});
