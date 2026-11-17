// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HistoricalClientStage2Results } from "./HistoricalClientStage2Results";

afterEach(cleanup);

describe("historical client Stage-2 result view", () => {
  it("shows read-only rows with exact artifact and input references", () => {
    render(<HistoricalClientStage2Results
      data={[{ technical_name: "filter.cutoff", automation_segment: "seg-a", consensus_frame: "text.qwen.resolved", current_value: 0.42 }]}
      artifactId="artifact-stage2"
      inputRefs={["artifact-qwen", "artifact-clap"]}
      labels={{ section: "Historical client Stage-2 result", title: "Client Stage-2 consensus · read only", artifact: "Artifact", inputs: "Input artifacts", parameter: "Parameter", segment: "Segment", frame: "Source frame", value: "Value", empty: "No rows" }}
    />);

    expect(screen.getByRole("region", { name: "Historical client Stage-2 result" })).toBeTruthy();
    expect(screen.getByText("artifact-stage2")).toBeTruthy();
    expect(screen.getByText("artifact-qwen")).toBeTruthy();
    expect(screen.getByText("artifact-clap")).toBeTruthy();
    expect(screen.getByText("filter.cutoff")).toBeTruthy();
    expect(screen.getByText("seg-a")).toBeTruthy();
    expect(screen.getByText("text.qwen.resolved")).toBeTruthy();
    expect(screen.getByText("0.42")).toBeTruthy();
  });
});
