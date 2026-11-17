import { describe, expect, it } from "vitest";
import { buildAutomationFlowmusicTimeline, validateFlowmusicDocument, type FlowmusicInputArtifact } from "./flowmusic-export";

const plan: FlowmusicInputArtifact = {
  artifactId: "plan-1", kind: "segment-plan", validity: "valid", actionId: "audio.segment",
  data: { windows: [
    { id: "segment-1", startSeconds: 0, endSeconds: 3 },
    { id: "segment-2", startSeconds: 3, endSeconds: 6 },
  ] },
};
const parameter = (technical_name: string, current_value: number) => ({ technical_name, category: "test", sub_category: "test", ui_element: "Range", default: 0, current_value, suggested_value: current_value, similarity: 0.9, source: "fixed-test-provider" });
const clap: FlowmusicInputArtifact = { artifactId: "clap-1", actionId: "audio.clap.resolved", kind: "parameter-bank", validity: "valid", data: { schema: "am_stage_segment_bank_v1", segments: [
  { id: "segment-1", parameters: [parameter("filter_cutoff", 0.4)] },
  { id: "segment-2", parameters: [parameter("filter_cutoff", 0.5)] },
] } };
const siglip: FlowmusicInputArtifact = { artifactId: "siglip-1", actionId: "spec.siglip.resolved", kind: "parameter-bank", validity: "valid", data: { schema: "am_stage_segment_bank_v1", segments: [
  { id: "segment-1", parameters: [parameter("filter_cutoff", 0.7)] },
  { id: "segment-2", parameters: [parameter("filter_cutoff", 0.6)] },
] } };

describe("AM2 FlowMusic export mapping", () => {
  it("builds the versioned timeline from ordered per-window CLAP then SigLIP banks", () => {
    const result = buildAutomationFlowmusicTimeline({ plan, banks: [clap, siglip], audioName: "fixture.wav", audioDurationSeconds: 6, settings: { blend: false, vocalMatrix: true } });
    expect(validateFlowmusicDocument(result.data)).toEqual([]);
    expect(result.data).toMatchObject({
      schema: "FLOWMUSIC_PRIORITY_TIMELINE_V1", audio: { name: "fixture.wav", duration_seconds: 6 },
      sourcePlan: "plan-1", sourceBanks: ["clap-1", "siglip-1"], vocal_allocation_matrix: true,
      clap_registry: ["filter_cutoff"], siglip_registry: ["filter_cutoff"],
      timeline: [{ t: 0, clap: [[0, 0.4]], siglip: [[0, 0.7]] }, { t: 3, clap: [[0, 0.5]], siglip: [[0, 0.6]] }],
      validation: { ok: true, mode: "schema" },
    });
    expect(result.segmentRefs.map((item) => item.id)).toEqual(["segment-1", "segment-2"]);
  });

  it("supports the existing weighted blend setting without changing the external document contract", () => {
    const result = buildAutomationFlowmusicTimeline({ plan, banks: [clap, siglip], assetId: "asset-1", settings: { blend: true, clapWeight: 0.25 } });
    expect(result.data).toMatchObject({ blended_registry: ["filter_cutoff"], timeline: expect.arrayContaining([{ t: 0, blended: [[0, expect.any(Number)]] }]) });
    expect(validateFlowmusicDocument(result.data)).toEqual([]);
  });

  it("rejects reversed or incomplete bank bindings instead of swapping modalities silently", () => {
    expect(() => buildAutomationFlowmusicTimeline({ plan, banks: [siglip, clap], audioDurationSeconds: 6, settings: {} })).toThrow("FLOWMUSIC_BANK_ORDER_INVALID");
    expect(() => buildAutomationFlowmusicTimeline({ plan, banks: [clap], audioDurationSeconds: 6, settings: {} })).toThrow("FLOWMUSIC_BANK_ORDER_INVALID");
  });

  it("rejects missing window results, duplicate rows, invalid banks and malformed windows", () => {
    const missingWindow = { ...clap, data: { schema: "am_stage_segment_bank_v1", segments: [{ id: "segment-1", parameters: [] }] } };
    expect(() => buildAutomationFlowmusicTimeline({ plan, banks: [missingWindow, siglip], audioDurationSeconds: 6, settings: {} })).toThrow("FLOWMUSIC_SEGMENT_COVERAGE_INVALID");
    const duplicate = { ...clap, data: { schema: "am_stage_segment_bank_v1", segments: [{ id: "segment-1", parameters: [] }, { id: "segment-1", parameters: [] }] } };
    expect(() => buildAutomationFlowmusicTimeline({ plan, banks: [duplicate, siglip], audioDurationSeconds: 6, settings: {} })).toThrow("FLOWMUSIC_SEGMENT_BANK_INVALID");
    expect(() => buildAutomationFlowmusicTimeline({ plan, banks: [{ ...clap, validity: "partial" }, siglip], audioDurationSeconds: 6, settings: {} })).toThrow("FLOWMUSIC_BANK_INVALID");
    const invalidPlan = { ...plan, data: { windows: [{ id: "segment-1", startSeconds: 3, endSeconds: 3 }] } };
    expect(() => buildAutomationFlowmusicTimeline({ plan: invalidPlan, banks: [clap, siglip], audioDurationSeconds: 6, settings: {} })).toThrow("FLOWMUSIC_SEGMENT_PLAN_INVALID");
    const invalidName = { ...clap, data: { schema: "am_stage_segment_bank_v1", segments: [{ id: "segment-1", parameters: [parameter("Not valid!", 1)] }, { id: "segment-2", parameters: [] }] } };
    expect(() => buildAutomationFlowmusicTimeline({ plan, banks: [invalidName, siglip], audioDurationSeconds: 6, settings: {} })).toThrow("FLOWMUSIC_PARAMETER_INVALID");
  });

  it("rejects a structurally invalid external timeline document", () => {
    expect(validateFlowmusicDocument({ schema: "wrong", timeline: [] })).toContain("schema: expected FLOWMUSIC_PRIORITY_TIMELINE_V1");
    expect(validateFlowmusicDocument({ schema: "wrong", timeline: [] })).toContain("timeline: expected non-empty array");
  });
});
