import type { ConsensusParameter, CycleMetrics } from "./types";

const round = (value: number) =>
  Number(Math.max(0, Math.min(1, value)).toFixed(6));

export const CYCLE_CONFIG = {
  version: "cycle-v2" as const,
  weights: {
    weighted_overlap: 0.5,
    jaccard_at_k: 0.25,
    value_agreement: 0.2,
    scope_agreement: 0.05,
    verification_score: 0,
  },
  thresholds: { verified: 0.55, review: 0.2 },
};

export function cycleMetrics(
  source: ConsensusParameter[],
  replay: ConsensusParameter[],
): CycleMetrics {
  const left = new Map(source.map((item) => [item.technical_name, item]));
  const right = new Map(replay.map((item) => [item.technical_name, item]));
  const names = new Set([...left.keys(), ...right.keys()]);
  let weightedIntersection = 0;
  let weightedUnion = 0;
  for (const name of names) {
    const a = left.get(name);
    const b = right.get(name);
    const aw = a ? 1 / Math.log2(a.rank + 1) : 0;
    const bw = b ? 1 / Math.log2(b.rank + 1) : 0;
    weightedIntersection += Math.min(aw, bw);
    weightedUnion += Math.max(aw, bw);
  }
  const common = [...left.keys()].filter((name) => right.has(name));
  const jaccard = names.size ? common.length / names.size : 0;
  const valueAgreement = common.length
    ? common.reduce((sum, name) => {
        const a = left.get(name)!;
        const b = right.get(name)!;
        const av = Number(a.selected_value);
        const bv = Number(b.selected_value);
        if (Number.isFinite(av) && Number.isFinite(bv)) {
          const minimum = a.min_value ?? b.min_value;
          const maximum = a.max_value ?? b.max_value;
          const span =
            typeof minimum === "number" &&
            typeof maximum === "number" &&
            maximum > minimum
              ? maximum - minimum
              : Math.max(Math.abs(av), Math.abs(bv), 1);
          return sum + Math.max(0, 1 - Math.abs(av - bv) / span);
        }
        return (
          sum + (String(a.selected_value) === String(b.selected_value) ? 1 : 0)
        );
      }, 0) / common.length
    : 0;
  const leftScopes = new Set(
    source.map((item) => item.retrieval_scope).filter(Boolean),
  );
  const rightScopes = new Set(
    replay.map((item) => item.retrieval_scope).filter(Boolean),
  );
  const allScopes = new Set([...leftScopes, ...rightScopes]);
  const scopeAgreement = allScopes.size
    ? [...leftScopes].filter((scope) => rightScopes.has(scope)).length /
      allScopes.size
    : 0;
  const weightedOverlap = weightedUnion
    ? weightedIntersection / weightedUnion
    : 0;
  const score =
    0.5 * weightedOverlap +
    0.25 * jaccard +
    0.2 * valueAgreement +
    0.05 * scopeAgreement;
  return {
    weighted_overlap: round(weightedOverlap),
    jaccard_at_k: round(jaccard),
    value_agreement: round(valueAgreement),
    scope_agreement: round(scopeAgreement),
    verification_score: round(score),
  };
}

export function cycleStatus(score: number): "verified" | "review" | "rejected" {
  return score >= CYCLE_CONFIG.thresholds.verified
    ? "verified"
    : score >= CYCLE_CONFIG.thresholds.review
      ? "review"
      : "rejected";
}
