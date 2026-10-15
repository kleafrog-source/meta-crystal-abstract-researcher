import { describe, expect, it } from "vitest";

import type { EnrichedParameter } from "@/lib/rag-v3/types";

import { buildConsensus, type ConsensusSourceInput } from "./consensus";

const metadata = new Map<string, EnrichedParameter>([
  ["cutoff", { technical_name: "cutoff", category: "filter", sub_category: "tone", ui_element: "Range", min_value: 0, max_value: 100, step: 1, default: 50, lyria_prompt_tags: [], semantic_keywords: [], axes: [], retrieval_scope: "sound" }],
  ["mode", { technical_name: "mode", category: "filter", sub_category: "type", ui_element: "Select", default: "clean", options: ["clean", "rough"], lyria_prompt_tags: [], semantic_keywords: [], axes: [], retrieval_scope: "sound" }],
  ["neighbor", { technical_name: "neighbor", category: "space", sub_category: "graph", ui_element: "Range", min_value: 0, max_value: 1, step: .1, default: .5, lyria_prompt_tags: [], semantic_keywords: [], axes: [], retrieval_scope: "sound" }],
]);
const source = (id: string, weight: number, cutoff: number, mode: string): ConsensusSourceInput => ({ record_id: id, modality: id === "a" ? "audio" : "image", weight, parameters: [{ technical_name: "cutoff", rank: 1, retrieval_score: .9, normalized_score: .9, default_value: 50, selected_value: cutoff, ui_element: "Range", min_value: 0, max_value: 100, value_source: "fixture" }, { technical_name: "mode", rank: 2, retrieval_score: .8, normalized_score: .8, default_value: "clean", selected_value: mode, ui_element: "Select", value_source: "fixture" }] });

describe("consensus engine invariants", () => {
  it("is invariant to source order", () => { const a = source("a", .7, 80, "rough"); const b = source("b", .4, 20, "clean"); expect(buildConsensus([a, b], metadata, 10)).toEqual(buildConsensus([b, a], metadata, 10)); });
  it("ignores a disabled source", () => { const a = source("a", .7, 80, "rough"); expect(buildConsensus([a, source("b", 0, 10, "clean")], metadata, 10)).toEqual(buildConsensus([a], metadata, 10)); });
  it("uses weighted median and reports a conflict", () => { const row = buildConsensus([source("a", .9, 80, "rough"), source("b", .2, 20, "clean")], metadata, 10).find((item) => item.technical_name === "cutoff")!; expect(row.selected_value).toBe(80); expect(row.conflict).toBe(true); });
  it("uses default as the deterministic categorical tie break", () => { const row = buildConsensus([source("a", .5, 50, "rough"), source("b", .5, 50, "clean")], metadata, 10).find((item) => item.technical_name === "mode")!; expect(row.selected_value).toBe("clean"); });
  it("adds graph-only parameters with a penalty but never double-votes direct parameters", () => { const rows = buildConsensus([source("a", 1, 80, "rough")], metadata, 10, [{ source_name: "cutoff", target_name: "neighbor", similarity: 1 }, { source_name: "cutoff", target_name: "mode", similarity: 1 }], .35); const neighbor = rows.find((item) => item.technical_name === "neighbor")!; expect(neighbor.graph_only).toBe(true); expect(neighbor.consensus_score).toBeLessThan(rows.find((item) => item.technical_name === "cutoff")!.consensus_score); expect(rows.filter((item) => item.technical_name === "mode")).toHaveLength(1); });
});
