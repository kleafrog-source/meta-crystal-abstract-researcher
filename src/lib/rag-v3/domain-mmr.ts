import { ACOUSTIC_DOMAIN_LAYERS, type AcousticDomainLayerId } from "@/lib/domain-layers";

export interface DomainRankCandidate {
  name: string;
  layer: string | null;
  relevance: number;
  vector: ArrayLike<number>;
}

type WeightedCandidate<T extends DomainRankCandidate> = T & { weightedRelevance: number };

/** Data-driven layer multiplier; absent values preserve the neutral 1.0 default. */
export function applyLayerWeights<T extends DomainRankCandidate>(
  candidates: T[],
  weights: Partial<Record<AcousticDomainLayerId, number>> = {},
): WeightedCandidate<T>[] {
  return candidates.map((candidate) => {
    const configured = candidate.layer ? weights[candidate.layer as AcousticDomainLayerId] : undefined;
    const weight = typeof configured === "number" && Number.isFinite(configured) && configured >= 0 ? configured : 1;
    return { ...candidate, weightedRelevance: candidate.relevance * weight };
  });
}

function normalized(vector: ArrayLike<number>): Float64Array {
  let squared = 0;
  for (let index = 0; index < vector.length; index += 1) squared += vector[index] * vector[index];
  const norm = Math.sqrt(squared) || 1;
  return Float64Array.from(vector, (value) => value / norm);
}

function cosine(left: Float64Array, right: Float64Array): number {
  const dimensions = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < dimensions; index += 1) score += left[index] * right[index];
  return Math.max(-1, Math.min(1, score));
}

function mmrPick<T extends DomainRankCandidate>(
  pool: Array<WeightedCandidate<T>>,
  limit: number,
  selected: Array<WeightedCandidate<T>>,
  lambda: number,
  useWeightedRelevance: boolean,
): void {
  const chosenNames = new Set(selected.map((candidate) => candidate.name));
  const remaining = new Map(pool.filter((candidate) => !chosenNames.has(candidate.name)).map((candidate) => [candidate.name, candidate]));
  const vectorByName = new Map<string, Float64Array>();
  for (const candidate of [...pool, ...selected]) {
    if (!vectorByName.has(candidate.name)) vectorByName.set(candidate.name, normalized(candidate.vector));
  }
  const scoreFor = (candidate: WeightedCandidate<T>) => (
    useWeightedRelevance || candidate.weightedRelevance !== 0
      ? candidate.weightedRelevance
      : candidate.relevance
  );
  const relevanceValues = pool.map(scoreFor);
  const min = Math.min(...relevanceValues);
  const max = Math.max(...relevanceValues);
  const normalizedRelevance = (candidate: WeightedCandidate<T>) => (
    max === min ? 1 : (scoreFor(candidate) - min) / (max - min)
  );

  while (remaining.size > 0 && selected.length < limit) {
    let best: WeightedCandidate<T> | undefined;
    let bestMmr = Number.NEGATIVE_INFINITY;
    let bestRelevance = Number.NEGATIVE_INFINITY;
    for (const candidate of remaining.values()) {
      let redundancy = 0;
      const vector = vectorByName.get(candidate.name)!;
      for (const chosen of selected) {
        if (chosen.name === candidate.name) continue;
        redundancy = Math.max(redundancy, cosine(vector, vectorByName.get(chosen.name)!));
      }
      const relevance = normalizedRelevance(candidate);
      const mmr = lambda * relevance - (1 - lambda) * Math.max(0, redundancy);
      if (
        mmr > bestMmr
        || (mmr === bestMmr && relevance > bestRelevance)
        || (mmr === bestMmr && relevance === bestRelevance && candidate.name.localeCompare(best?.name ?? "") < 0)
      ) {
        best = candidate;
        bestMmr = mmr;
        bestRelevance = relevance;
      }
    }
    if (!best) break;
    selected.push(best);
    remaining.delete(best.name);
  }
}

/**
 * Selects from a 70/30 layer split when a strict subset is active, then fills any
 * shortage from the remaining global pool. MMR novelty is cosine distance from
 * already selected Stage 1 embeddings. Future Flowmusic presets can supply
 * layer multipliers without changing this retrieval contract.
 */
export function selectDomainFirstMmr<T extends DomainRankCandidate>(
  candidates: T[],
  topK: number,
  selectedDomainLayers: string[] = [],
  layerWeights: Partial<Record<AcousticDomainLayerId, number>> = {},
  lambda = 0.7,
): T[] {
  const limit = Math.max(0, Math.min(candidates.length, Math.round(topK)));
  if (limit === 0) return [];
  const weighted = applyLayerWeights(candidates, layerWeights);
  const selected = new Set(selectedDomainLayers);
  const strictSubset = selected.size > 0 && selected.size < ACOUSTIC_DOMAIN_LAYERS.length;
  const chosen: Array<WeightedCandidate<T>> = [];

  if (!strictSubset) {
    mmrPick(weighted, limit, chosen, lambda, false);
    return chosen;
  }

  const preferred = weighted.filter((candidate) => candidate.layer !== null && selected.has(candidate.layer));
  const outside = weighted.filter((candidate) => candidate.layer === null || !selected.has(candidate.layer));
  const preferredTarget = Math.min(preferred.length, Math.max(1, Math.round(limit * 0.7)));
  mmrPick(preferred, preferredTarget, chosen, lambda, true);
  mmrPick(outside, limit, chosen, lambda, false);
  mmrPick(preferred, limit, chosen, lambda, true);
  return chosen.slice(0, limit);
}
