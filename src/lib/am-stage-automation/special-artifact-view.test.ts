import { describe, expect, it } from "vitest";
import { projectSpecialAutomationArtifact } from "./special-artifact-view";

describe("projectSpecialAutomationArtifact", () => {
  it("projects Vocal Allocation parsed intent and assignment fields without changing values", () => {
    const result = projectSpecialAutomationArtifact("vocal_allocation.search", "vocal-allocation", {
      query: "Lead in Latin with a ritual chant",
      parsed: { languages: ["Latin"], techniques: ["ritual chant"], effects: ["reverb"], digits: { I: 8, S: 7, E: 5, A: 9 } },
      total_scoped: 14,
      results: [{ technical_name: "technique_primary_lead_layer", current_value: "Ritual Chant", category: "technique", sub_category: "lead", source: "catalogue", extra_field: "ignored by projection, retained by raw artifact" }],
    });

    expect(result).toEqual({
      kind: "vocal-allocation",
      query: "Lead in Latin with a ritual chant",
      languages: ["Latin"], techniques: ["ritual chant"], effects: ["reverb"],
      digits: [["I", 8], ["S", 7], ["E", 5], ["A", 9]],
      totalScoped: 14,
      parameters: [{ technicalName: "technique_primary_lead_layer", value: "Ritual Chant", category: "technique · lead", source: "catalogue" }],
    });
  });

  it("maps FLOWMUSIC registry indexes to names and preserves ordered input identities", () => {
    const result = projectSpecialAutomationArtifact("flowmusic.export", "flowmusic-timeline", {
      schema: "FLOWMUSIC_PRIORITY_TIMELINE_V1",
      audio: { name: "fixture.wav", duration_seconds: 6 },
      validation: { ok: true, mode: "schema" },
      sourcePlan: "plan-a",
      sourceBanks: ["clap-a", "siglip-a"],
      clap_registry: ["filter_cutoff"],
      siglip_registry: ["filter_cutoff", "reverb_mix"],
      timeline: [{ t: 1.25, clap: [[0, 0.4]], siglip: [[1, 0.8], [0, 0.2]] }],
    });

    expect(result).toEqual({
      kind: "flowmusic-timeline", audioName: "fixture.wav", durationSeconds: 6,
      validationRecorded: true, sourcePlan: "plan-a", sourceBanks: ["clap-a", "siglip-a"],
      points: [{ time: 1.25, values: [
        { modality: "CLAP", technicalName: "filter_cutoff", value: 0.4 },
        { modality: "SigLIP2", technicalName: "reverb_mix", value: 0.8 },
        { modality: "SigLIP2", technicalName: "filter_cutoff", value: 0.2 },
      ] }],
    });
  });

  it("supports blended timelines and labels unknown registry indexes without inventing names", () => {
    expect(projectSpecialAutomationArtifact("flowmusic.export", "flowmusic-timeline", {
      schema: "FLOWMUSIC_PRIORITY_TIMELINE_V1", audio: { name: "x.wav", duration_seconds: 2 },
      validation: { ok: false }, sourcePlan: null, sourceBanks: [], blended_registry: ["blend_key"],
      timeline: [{ t: 0, blended: [[4, 0.75]] }],
    })).toMatchObject({ points: [{ values: [{ modality: "Blended", technicalName: "registry[4]", value: 0.75 }] }] });
  });

  it("falls back to raw JSON for malformed or unrelated payloads", () => {
    expect(projectSpecialAutomationArtifact("vocal_allocation.search", "vocal-allocation", { results: [] })).toBeNull();
    expect(projectSpecialAutomationArtifact("flowmusic.export", "flowmusic-timeline", {
      schema: "FLOWMUSIC_PRIORITY_TIMELINE_V1", audio: { name: "x", duration_seconds: 2 },
      sourcePlan: null, sourceBanks: [], clap_registry: [], siglip_registry: [], timeline: [{ t: "bad", clap: [], siglip: [] }],
    })).toBeNull();
    expect(projectSpecialAutomationArtifact("data.merge", "parameter-bank", [])).toBeNull();
  });
});
