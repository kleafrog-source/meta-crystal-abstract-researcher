export interface SegmentWindow {
  id: string;
  startSeconds: number;
  endSeconds: number;
}

/** Deterministically select ordered text-LLM nodes. K=1 selects the first node. */
export function selectTextLlmSegments<T extends SegmentWindow>(segments: readonly T[], requestedLimit: number): {
  limit: number;
  selected: T[];
  skipped: T[];
  selectedIndexes: number[];
} {
  const limit = Math.max(1, Math.min(500, Math.trunc(Number.isFinite(requestedLimit) ? requestedLimit : 5)));
  if (segments.length <= limit) return { limit, selected: [...segments], skipped: [], selectedIndexes: segments.map((_, index) => index) };
  const indexes = limit === 1
    ? [0]
    : Array.from({ length: limit }, (_, slot) => Math.floor(slot * (segments.length - 1) / (limit - 1)));
  const unique = [...new Set(indexes)];
  const selectedSet = new Set(unique);
  return {
    limit,
    selected: unique.map((index) => segments[index]),
    skipped: segments.filter((_, index) => !selectedSet.has(index)),
    selectedIndexes: unique,
  };
}
