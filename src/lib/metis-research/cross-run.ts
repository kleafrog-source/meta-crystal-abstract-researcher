import type { ComparisonResult, CrossRunMetrics, RetrievalRun } from "@/lib/metis-research/types";

function overlap(idsA: string[], idsB: string[], limit: number) {
  const setA = new Set(idsA.slice(0, limit));
  const setB = new Set(idsB.slice(0, limit));
  let shared = 0;
  for (const id of setA) {
    if (setB.has(id)) shared += 1;
  }
  return shared;
}

export function compareRuns(baseline: RetrievalRun, comparison: RetrievalRun): CrossRunMetrics {
  const baselineIds = baseline.resultIds;
  const comparisonIds = comparison.resultIds;
  const overlap5 = overlap(baselineIds, comparisonIds, 5);
  const overlap16 = overlap(baselineIds, comparisonIds, 16);
  const baselineSet = new Set(baselineIds);
  const comparisonSet = new Set(comparisonIds);
  const union = new Set([...baselineIds, ...comparisonIds]);
  const stableObservedSet = [...baselineIds.filter((id) => comparisonSet.has(id))];
  const candidateDependentSet = [...union].filter((id) => !(baselineSet.has(id) && comparisonSet.has(id)));
  const newIds = comparisonIds.filter((id) => !baselineSet.has(id));
  const removedIds = baselineIds.filter((id) => !comparisonSet.has(id));

  let rankChanges = 0;
  let meanScoreDelta = 0;
  let compared = 0;

  for (const id of stableObservedSet) {
    const baselineRank = baselineIds.indexOf(id);
    const comparisonRank = comparisonIds.indexOf(id);
    if (baselineRank !== comparisonRank) rankChanges += 1;
    const baselineScore = baseline.results.find((item) => item.crystal.node_id === id)?.score.finalScore ?? 0;
    const comparisonScore = comparison.results.find((item) => item.crystal.node_id === id)?.score.finalScore ?? 0;
    meanScoreDelta += comparisonScore - baselineScore;
    compared += 1;
  }

  return {
    overlapAt5: overlap5 / 5,
    overlapAt16: overlap16 / 16,
    jaccardAtK: union.size ? stableObservedSet.length / union.size : 0,
    rankChanges,
    stableObservedSet,
    candidateDependentSet,
    newDiscoveryCount: newIds.length,
    removedFromPreviousCount: removedIds.length,
    meanScoreDelta: compared ? meanScoreDelta / compared : 0,
    scoreGapComparison: {
      baseline: baseline.metrics.scoreGapAtK,
      comparison: comparison.metrics.scoreGapAtK,
      delta: comparison.metrics.scoreGapAtK - baseline.metrics.scoreGapAtK,
    },
    runtimeComparison: {
      baseline: baseline.metrics.runtimeMs,
      comparison: comparison.metrics.runtimeMs,
      delta: comparison.metrics.runtimeMs - baseline.metrics.runtimeMs,
    },
  };
}

export function compareMultipleRuns(runs: RetrievalRun[]): ComparisonResult {
  const baseline = runs[0];
  const comparisons = runs.slice(1).map((run) => ({
    baselineId: baseline.runId,
    comparisonId: run.runId,
    metrics: compareRuns(baseline, run),
  }));

  const allSets = runs.map((run) => new Set(run.resultIds));
  const stableObservedSet = runs[0]?.resultIds.filter((id) => allSets.every((set) => set.has(id))) ?? [];
  const frequency = new Map<string, number>();
  for (const run of runs) {
    for (const id of run.resultIds) {
      frequency.set(id, (frequency.get(id) ?? 0) + 1);
    }
  }

  const candidateDependentSet = [...frequency.entries()]
    .filter(([, count]) => count > 0 && count < runs.length)
    .map(([id]) => id);

  const newDiscoverySets: Record<string, string[]> = {};
  for (let index = 1; index < runs.length; index += 1) {
    const previous = new Set(runs[index - 1].resultIds);
    newDiscoverySets[runs[index].runId] = runs[index].resultIds.filter((id) => !previous.has(id));
  }

  return {
    baselineRunId: baseline?.runId ?? "",
    comparisons,
    multiRun: {
      stableObservedSet,
      candidateDependentSet,
      newDiscoverySets,
    },
  };
}
