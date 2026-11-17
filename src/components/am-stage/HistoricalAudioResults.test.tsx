// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HistoricalAudioDescriptionsView, HistoricalAudioTextView } from "./HistoricalAudioResults";

afterEach(cleanup);

describe("historical audio result views", () => {
  it("renders a segment description with its artifact identity and target/evidence ranges", () => {
    render(<HistoricalAudioDescriptionsView
      descriptions={[{ sourceActionId: "audio.describe_gaps.lfm3", artifactId: "gap-artifact", text: "Centered LFM3 evidence.", targetRange: { startSeconds: 12, endSeconds: 20 }, evidenceRange: { startSeconds: 14, endSeconds: 18 }, semantics: "The model only heard the evidence range." }]}
      labels={{ section: "Historical audio descriptions", title: "LFM3 audio descriptions", artifact: "Artifact", unknown: "unknown", target: "Target node", evidence: "Audio evidence window" }}
    />);

    expect(screen.getByRole("region", { name: "Historical audio descriptions" })).toBeTruthy();
    expect(screen.getByText("gap-artifact")).toBeTruthy();
    expect(screen.getByText("Target node: 12.00–20.00 s")).toBeTruthy();
    expect(screen.getByText("Audio evidence window: 14.00–18.00 s")).toBeTruthy();
    expect(screen.getByText("Centered LFM3 evidence.")).toBeTruthy();
  });

  it("renders full-range descriptions and transcripts as distinct text results", () => {
    render(<HistoricalAudioTextView
      actionId="audio.transcribe.lfm3"
      text="Transcript text."
      model="lfm3-audio:latest"
      runtime="ollama"
      labels={{ section: "Historical audio text", description: "Historical audio description", transcription: "Historical transcription" }}
    />);

    expect(screen.getByRole("region", { name: "Historical audio text" })).toBeTruthy();
    expect(screen.getByText("Historical transcription")).toBeTruthy();
    expect(screen.getByText("Transcript text.")).toBeTruthy();
    expect(screen.getByText("lfm3-audio:latest · ollama")).toBeTruthy();
  });
});
