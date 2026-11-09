import { describe, expect, it } from "vitest";
import { collectHistoricalSegmentResults, extractStageBankParameters } from "./historical-segment-results";

describe("historical segment result projection", () => {
  it("keeps each model bank and text outputs attached to the matching saved window", () => {
    const stages = [
      { stageId: "segments", actionId: "audio.segment", artifacts: [{ payload: { data: { windows: [{ id: "b", startSeconds: 12, endSeconds: 24 }, { id: "a", startSeconds: 0, endSeconds: 12 }] } } }] },
      { stageId: "clap", actionId: "audio.clap.resolved", artifacts: [{ payload: { data: { schema: "am_stage_segment_bank_v1", segments: [{ id: "a", parameters: [{ technical_name: "clap.a" }] }, { id: "b", parameters: [{ technical_name: "clap.b" }] }] } } }] },
      { stageId: "gemma", actionId: "audio.gemma.awtd", artifacts: [{ payload: { data: { schema: "am_stage_segment_bank_v1", segments: [{ id: "a", parameters: [{ technical_name: "gemma.a" }] }, { id: "b", parameters: [{ technical_name: "gemma.b" }] }] } } }] },
      { stageId: "siglip", actionId: "spec.siglip.resolved", artifacts: [{ payload: { data: { schema: "am_stage_segment_bank_v1", segments: [{ id: "a", parameters: [{ technical_name: "siglip.a" }] }, { id: "b", parameters: [{ technical_name: "siglip.b" }] }] } } }] },
      { stageId: "reverse", actionId: "text_features.reverse_query", artifacts: [{ payload: { data: { schema: "am_stage_segment_text_v1", segments: [{ id: "a", result: { reverse_query: { query_en: "query a" } } }, { id: "b", result: { reverse_query: { query_en: "query b" } } }] } } }] },
      { stageId: "describe", actionId: "text_features.describe_llm", artifacts: [{ payload: { data: { schema: "am_stage_segment_text_v1", segments: [{ id: "a", result: { description_natural_en: "description a" } }, { id: "b", result: { description_natural_en: "description b" } }] } } }] },
    ];
    const result = collectHistoricalSegmentResults(stages);
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result[0]).toMatchObject({ banks: { clap: [{ technical_name: "clap.a" }], gemmaAudio: [{ technical_name: "gemma.a" }], siglip: [{ technical_name: "siglip.a" }] }, reverseQuery: { en: "query a" }, interpretation: { en: "description a" } });
    expect(result[1].banks.clap[0].technical_name).toBe("clap.b");
    expect(result[1].reverseQuery?.en).toBe("query b");
  });

  it("ignores unbound segment data instead of showing it under another node", () => {
    const result = collectHistoricalSegmentResults([
      { stageId: "segments", actionId: "audio.segment", artifacts: [{ payload: { data: { windows: [{ id: "kept", startSeconds: 0, endSeconds: 1 }] } } }] },
      { stageId: "clap", actionId: "audio.clap.resolved", artifacts: [{ payload: { data: { segments: [{ id: "unknown", parameters: [{ technical_name: "wrong" }] }] } } }] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].banks.clap).toEqual([]);
  });
});

describe("extractStageBankParameters", () => {
  const parameter = (technical_name: string) => ({
    technical_name,
    category: "sound",
    sub_category: "test",
    ui_element: "Range" as const,
    default: 0,
    suggested_value: 1,
    current_value: 1,
    before: 0,
    source: "retrieval" as const,
    detail: "test",
    lyria_prompt_tags: [],
    semantic_keywords: [],
    similarity: 1,
    axes: [],
    retrieval_scope: "sound" as const,
  });

  it("flattens segmented banks and retains each source window", () => {
    const result = extractStageBankParameters({
      schema: "am_stage_segment_bank_v1",
      segments: [
        { id: "segment-1", startSeconds: 0, endSeconds: 10, parameters: [parameter("first")] },
        { id: "segment-2", startSeconds: 10, endSeconds: 22.5, parameters: [parameter("second")] },
      ],
    });

    expect(result).toMatchObject([
      { technical_name: "first", source_window: { offset_seconds: 0, duration_seconds: 10 } },
      { technical_name: "second", source_window: { offset_seconds: 10, duration_seconds: 12.5 } },
    ]);
  });

  it("selects only the requested historical fragment when a segment id is supplied", () => {
    const result = extractStageBankParameters({
      segments: [
        { id: "segment-1", startSeconds: 0, endSeconds: 10, parameters: [parameter("first")] },
        { id: "segment-2", startSeconds: 10, endSeconds: 20, parameters: [parameter("second")] },
      ],
    }, "segment-2");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ technical_name: "second", source_window: { offset_seconds: 10, duration_seconds: 10 } });
  });

  it("preserves flat banks and rejects malformed segment entries", () => {
    const flat = [parameter("flat")];
    expect(extractStageBankParameters(flat)).toEqual(flat);
    expect(extractStageBankParameters({ segments: [{ id: "x", parameters: [{ nope: true }] }] })).toEqual([]);
    expect(extractStageBankParameters({ schema: "unexpected" })).toEqual([]);
  });

  it("unwraps server Stage-2 hits for historical apply", () => {
    const result = extractStageBankParameters({
      stage2_hits: [parameter("stage2.hit")],
      stage2_meta: { text_index: "qwen3" },
    });

    expect(result).toEqual([parameter("stage2.hit")]);
  });
});
