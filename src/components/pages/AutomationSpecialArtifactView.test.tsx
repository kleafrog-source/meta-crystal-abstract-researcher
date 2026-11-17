// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationSpecialArtifactView } from "./AutomationSpecialArtifactView";

afterEach(cleanup);

describe("AutomationSpecialArtifactView", () => {
  it("renders vocal matrix intent, assignments, and artifact links read-only", () => {
    render(<AutomationSpecialArtifactView
      actionId="vocal_allocation.search" kind="vocal-allocation" artifactId="vocal-artifact" inputRefs={["brief-artifact"]}
      data={{ query: "Latin lead", parsed: { languages: ["Latin"], techniques: ["belting"], effects: ["reverb"], digits: { I: 8 } }, total_scoped: 12, results: [{ technical_name: "technique_primary_lead_layer", current_value: "Belting", category: "technique", source: "catalogue" }] }}
    />);

    const region = screen.getByRole("region", { name: "Vocal Allocation result" });
    expect(within(region).getByText("Latin lead")).toBeTruthy();
    expect(within(region).getByText("technique_primary_lead_layer")).toBeTruthy();
    expect(within(region).getByText("Belting")).toBeTruthy();
    expect(within(region).getByText("vocal-artifact")).toBeTruthy();
    expect(within(region).getByText("brief-artifact")).toBeTruthy();
    expect(within(region).queryByRole("button")).toBeNull();
  });

  it("renders timeline modality, registry parameter names, timestamps, and source artifacts", () => {
    render(<AutomationSpecialArtifactView
      actionId="flowmusic.export" kind="flowmusic-timeline" artifactId="timeline-artifact" inputRefs={["plan-id", "clap-id", "siglip-id"]}
      data={{ schema: "FLOWMUSIC_PRIORITY_TIMELINE_V1", audio: { name: "fixture.wav", duration_seconds: 4 }, validation: { ok: true }, sourcePlan: "plan-id", sourceBanks: ["clap-id", "siglip-id"], clap_registry: ["filter_cutoff"], siglip_registry: ["reverb_mix"], timeline: [{ t: 1.5, clap: [[0, 0.42]], siglip: [[0, 0.8]] }] }}
    />);

    const region = screen.getByRole("region", { name: "FLOWMUSIC timeline result" });
    expect(within(region).getByText("fixture.wav")).toBeTruthy();
    expect(within(region).getAllByText("1.500")).toHaveLength(2);
    expect(within(region).getByText("CLAP")).toBeTruthy();
    expect(within(region).getByText("SigLIP2")).toBeTruthy();
    expect(within(region).getByText("filter_cutoff")).toBeTruthy();
    expect(within(region).getByText("reverb_mix")).toBeTruthy();
    expect(within(region).getByText("timeline-artifact")).toBeTruthy();
  });

  it("does not render a specialized projection for other artifacts", () => {
    const { container } = render(<AutomationSpecialArtifactView actionId="data.merge" kind="parameter-bank" data={[]} artifactId="merge" inputRefs={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
