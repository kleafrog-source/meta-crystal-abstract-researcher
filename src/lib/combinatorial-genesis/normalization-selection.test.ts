import { describe, expect, it } from "vitest";
import { resolveNormalizationBatch, selectPendingNormalizationCandidates } from "./normalization-selection";

const candidates = [
  { technical_name: "first", llm_normalization: undefined },
  { technical_name: "already_done", llm_normalization: { description_ru: "готово" } },
  { technical_name: "third", llm_normalization: undefined },
];

describe("partial normalization selection", () => {
  it("selects one stable candidate ID", () => {
    expect(selectPendingNormalizationCandidates(candidates, ["third"]).map(({ technical_name }) => technical_name)).toEqual(["third"]);
  });

  it("selects multiple requested candidates and skips completed work", () => {
    expect(selectPendingNormalizationCandidates(candidates, ["third", "already_done", "first"]).map(({ technical_name }) => technical_name)).toEqual(["first", "third"]);
  });

  it("does no work for an empty selection", () => {
    expect(selectPendingNormalizationCandidates(candidates, [])).toEqual([]);
  });

  it("keeps successful results and reports only failed candidates for retry", () => {
    const result = resolveNormalizationBatch(["first", "third"], ["first"], "temporary provider error");
    expect(result).toEqual({ succeeded: ["first"], failed: { third: "temporary provider error" } });
    expect(selectPendingNormalizationCandidates(candidates.map((candidate) => candidate.technical_name === "first" ? { ...candidate, llm_normalization: { description_ru: "готово" } } : candidate), Object.keys(result.failed)).map(({ technical_name }) => technical_name)).toEqual(["third"]);
  });
});
