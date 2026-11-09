import { describe, expect, it } from "vitest";
import { buildSelectedSegmentBriefInputs, buildSelectedSegmentBriefPrompt, buildSegmentBriefInputs, buildSegmentBriefPrompt } from "./combine-segment-texts";

const windows = [
  { id: "seg-1", startSeconds: 0, endSeconds: 12 },
  { id: "seg-2", startSeconds: 12, endSeconds: 24 },
];
const reverse = {
  schema: "am_stage_segment_text_v1", actionId: "text_features.reverse_query",
  segments: windows.map((window) => ({ ...window, result: { reverse_query: { query_en: `reverse ${window.id}` } } })),
};
const interpretation = {
  schema: "am_stage_segment_text_v1", actionId: "text_features.describe_llm",
  segments: windows.map((window) => ({ ...window, result: { description_natural_en: `interpretation en ${window.id}`, description_natural_ru: `интерпретация ${window.id}` } })),
};

describe("complete per-fragment Brief evidence", () => {
  it("preserves every fragment in source order with its exact interval", () => {
    const fragments = buildSegmentBriefInputs(windows, reverse, interpretation);
    expect(fragments.map(({ id }) => id)).toEqual(["seg-1", "seg-2"]);
    expect(fragments[1]).toMatchObject({ startSeconds: 12, endSeconds: 24, reverseQuery: "reverse seg-2", interpretationRu: "интерпретация seg-2" });
    const prompt = JSON.parse(buildSegmentBriefPrompt(fragments)) as { required_fragment_ids_in_order: string[]; fragments: unknown[] };
    expect(prompt.required_fragment_ids_in_order).toEqual(["seg-1", "seg-2"]);
    expect(prompt.fragments).toHaveLength(2);
  });

  it("uses an exact saved sound_description as source text without relabeling it as English", () => {
    const savedAnswer = {
      ...reverse,
      segments: [{ ...windows[0], result: { reverse_query: { text: "A deep resonant industrial hum.", textSourceField: "sound_description", missingFields: ["query_en", "query_ru"] } } }, reverse.segments[1]],
    };
    const inputs = buildSelectedSegmentBriefInputs(windows, [{ actionId: "text_features.reverse_query", data: savedAnswer }], { reverseQuery: true, interpretations: false, textFeatures: false });
    expect(inputs[0].sources).toMatchObject({ reverseQuery: "A deep resonant industrial hum.", reverseQueryLanguage: "unknown" });
    const prompt = JSON.parse(buildSelectedSegmentBriefPrompt(inputs)) as { fragments: Array<Record<string, unknown>> };
    expect(prompt.fragments[0]).toMatchObject({ reverseQuery: "A deep resonant industrial hum.", reverseQueryLanguage: "unknown" });
    expect(prompt.fragments[0]).not.toHaveProperty("reverse_query_en");
  });

  it("rejects missing or extra fragments instead of silently truncating", () => {
    expect(() => buildSegmentBriefInputs(windows, { ...reverse, segments: reverse.segments.slice(0, 1) }, interpretation)).toThrow(/exactly one result for every audio fragment/u);
    expect(() => buildSegmentBriefInputs(windows, reverse, { ...interpretation, segments: [...interpretation.segments, { ...windows[0], result: {} }] })).toThrow(/duplicate fragment id/u);
  });

  it("rejects mismatched times and missing EN/RU interpretation", () => {
    const badTimes = { ...reverse, segments: [{ ...reverse.segments[0], endSeconds: 99 }, reverse.segments[1]] };
    expect(() => buildSegmentBriefInputs(windows, badTimes, interpretation)).toThrow(/timing mismatch/u);
    const noRu = { ...interpretation, segments: [{ ...interpretation.segments[0], result: { description_natural_en: "ok" } }, interpretation.segments[1]] };
    expect(() => buildSegmentBriefInputs(windows, reverse, noRu)).toThrow(/missing its reverse query or EN\/RU interpretation/u);
  });
});

describe("explicit Brief source selection", () => {
  it("preserves sampled-node status and keeps text features distinct", () => {
    const sampledReverse = { ...reverse, segments: [reverse.segments[0], { ...windows[1], status: "not_selected" }] };
    const features = { schema: "am_stage_segment_features_v1", segments: windows.map((window) => ({ ...window, snapshot: { ranked_fragments: [{ text: `feature ${window.id}` }] } })) };
    const output = buildSelectedSegmentBriefInputs(windows, [
      { actionId: "text_features.reverse_query", data: sampledReverse },
      { actionId: "text_features.build", data: features },
    ], { reverseQuery: true, interpretations: false, textFeatures: true });
    expect(output.map((item) => item.id)).toEqual(["seg-1", "seg-2"]);
    expect(output[1].sources.status.reverseQuery).toBe("not_selected");
    expect(output[1].sources.reverseQuery).toBeUndefined();
    expect(output[1].sources.textFeatures).toEqual(["feature seg-2"]);
  });

  it("adds the saved description draft only when supplied as the chosen separate source", () => {
    const prompt = JSON.parse(buildSelectedSegmentBriefPrompt([], { sessionId: "session-1", language: "ru", snapshotUpdatedAt: "2026-11-09T00:00:00.000Z", text: "Описание сохранённого трека" })) as { saved_track_draft?: { session_id: string; language: string; text: string } };
    expect(prompt.saved_track_draft).toMatchObject({ session_id: "session-1", language: "RU", text: "Описание сохранённого трека" });
  });

  it("supports the saved track draft as the sole Brief source without audio nodes", () => {
    expect(buildSelectedSegmentBriefInputs([], [], { reverseQuery: false, interpretations: false, textFeatures: false })).toEqual([]);
    expect(() => buildSelectedSegmentBriefInputs([], [], { reverseQuery: true, interpretations: false, textFeatures: false })).toThrow(/without audio fragments/u);
    const prompt = JSON.parse(buildSelectedSegmentBriefPrompt([], { sessionId: "session-1", language: "en", snapshotUpdatedAt: "2026-11-09T00:00:00.000Z", text: "Saved track description" })) as { saved_track_draft?: { text: string }; fragments: unknown[] };
    expect(prompt.saved_track_draft?.text).toBe("Saved track description");
    expect(prompt.fragments).toEqual([]);
  });

  it("keeps every node as coverage metadata when only the separate track draft is selected", () => {
    const inputs = buildSelectedSegmentBriefInputs(windows, [], { reverseQuery: false, interpretations: false, textFeatures: false });
    expect(inputs.map((item) => item.id)).toEqual(["seg-1", "seg-2"]);
    expect(inputs[0].sources.status).toEqual({ reverseQuery: "unavailable", interpretation: "unavailable", textFeatures: "unavailable", gapDescriptions: "unavailable" });
    const prompt = JSON.parse(buildSelectedSegmentBriefPrompt(inputs, { sessionId: "session-1", language: "en", snapshotUpdatedAt: "2026-11-09T00:00:00.000Z", text: "Saved draft" })) as { fragments: unknown[] };
    expect(prompt.fragments).toHaveLength(2);
  });

  it("rejects an enabled source whose node record is missing", () => {
    expect(() => buildSelectedSegmentBriefInputs(windows, [{ actionId: "text_features.reverse_query", data: { ...reverse, segments: reverse.segments.slice(0, 1) } }], { reverseQuery: true, interpretations: false, textFeatures: false })).toThrow(/not identified as intentionally outside the sample/u);
  });

  it("keeps center-sampled gap evidence distinct from the wider node range", () => {
    const gapArtifact = {
      schema: "am_stage_interstitial_gap_descriptions_v1",
      segments: [{
        id: "seg-1", status: "gap_described", targetRange: { startSeconds: 0, endSeconds: 12 },
        sentAudioRange: { startSeconds: 4, endSeconds: 8, durationSeconds: 4 },
        leftAnchor: { id: "left" }, rightAnchor: { id: "right" }, result: { text: "A brief rising metallic tone." },
      }, { id: "seg-2", status: "not_bracketed_by_successful_anchors" }],
    };
    const inputs = buildSelectedSegmentBriefInputs(windows, [{ actionId: "audio.describe_gaps.lfm3", data: gapArtifact }], { reverseQuery: false, interpretations: false, textFeatures: false, gapDescriptions: true });
    expect(inputs[0].sources.gapDescription).toEqual({
      text: "A brief rising metallic tone.", targetRange: { startSeconds: 0, endSeconds: 12 },
      sentAudioRange: { startSeconds: 4, endSeconds: 8, durationSeconds: 4 }, leftAnchorId: "left", rightAnchorId: "right",
    });
    expect(inputs[1].sources.status.gapDescriptions).toBe("not_selected");
    const prompt = JSON.parse(buildSelectedSegmentBriefPrompt(inputs)) as { task: string; fragments: Array<Record<string, unknown>> };
    expect(prompt.task).toMatch(/do not imply the full target node was heard/u);
    expect(prompt.fragments[0]).toHaveProperty("gapDescription.sentAudioRange");
  });
});
