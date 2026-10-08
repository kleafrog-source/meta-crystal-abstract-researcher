import { RAG_V3_CONFIG } from "./config";
import type { ActiveRelation } from "./relation-index";

export interface RelationHint {
  direction: number;
  confidence: number;
  relation: string;
}

export function buildRelationAlignment(relations: ActiveRelation[], allowedNames: Set<string>) {
  const biasByName = new Map<string, number>();
  const hints: Record<string, RelationHint> = {};
  const names = new Set<string>();
  const coverageGroups: Set<string>[] = [];
  for (const relation of relations) {
    for (const [relationNames, direction] of [[relation.params_a, relation.direction_a], [relation.params_b, relation.direction_b]] as const) {
      const allowedRelationNames = relationNames.filter((name) => allowedNames.has(name));
      if (allowedRelationNames.length) coverageGroups.push(new Set(allowedRelationNames));
      for (const name of relationNames) {
        if (!allowedNames.has(name)) continue;
        names.add(name);
        biasByName.set(name, Math.min(
          RAG_V3_CONFIG.relationAlphaMax,
          (biasByName.get(name) ?? 0) + relation.alpha,
        ));
        if (!hints[name] || relation.confidence > hints[name].confidence) {
          hints[name] = { direction, confidence: relation.confidence, relation: relation.id };
        }
      }
    }
  }
  return { biasByName, hints, names, coverageGroups };
}

export function ensureConceptCoverage<T extends { name: string; concept_scores: number[] }>(
  ranked: T[],
  limit: number,
  conceptIndexes: number[],
  requiredNameGroups: Set<string>[] = [],
): T[] {
  if (ranked.length <= limit) return ranked.slice(0, limit);
  const selected = ranked.slice(0, limit);
  const protectedNames = new Set<string>();
  const required = conceptIndexes.map((conceptIndex) => ranked.reduce<T | null>((current, item) => {
      if (!current) return item;
      return (item.concept_scores[conceptIndex] ?? Number.NEGATIVE_INFINITY)
        > (current.concept_scores[conceptIndex] ?? Number.NEGATIVE_INFINITY) ? item : current;
    }, null)).filter((item): item is T => item !== null);
  for (const group of requiredNameGroups) {
    const best = ranked.find((item) => group.has(item.name));
    if (best) required.push(best);
  }
  for (const best of required) {
    if (!best) continue;
    protectedNames.add(best.name);
    if (selected.some((item) => item.name === best.name)) continue;
    let replacement = selected.length - 1;
    while (replacement >= 0 && protectedNames.has(selected[replacement].name)) replacement -= 1;
    if (replacement >= 0) selected[replacement] = best;
  }
  const unique = new Map(selected.map((item) => [item.name, item]));
  return ranked.filter((item) => unique.has(item.name)).slice(0, limit);
}

/** Optional diagnostic implementation; disabled by default in config. */
export function sinkhornAlign(scores: number[][], epsilon = RAG_V3_CONFIG.sinkhornEpsilon, iterations = RAG_V3_CONFIG.sinkhornIterations) {
  if (!scores.length || !scores[0]?.length) return [];
  const rows = scores.length;
  const columns = scores[0].length;
  const kernel = scores.map((row) => row.map((score) => Math.exp(score / Math.max(epsilon, 1e-6))));
  const u = Array(rows).fill(1 / rows);
  const v = Array(columns).fill(1 / columns);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let row = 0; row < rows; row += 1) {
      const sum = kernel[row].reduce((total, value, column) => total + value * v[column], 0);
      u[row] = (1 / rows) / (sum || 1);
    }
    for (let column = 0; column < columns; column += 1) {
      let sum = 0;
      for (let row = 0; row < rows; row += 1) sum += kernel[row][column] * u[row];
      v[column] = (1 / columns) / (sum || 1);
    }
  }
  return kernel.map((row, rowIndex) => row.map((value, column) => value * u[rowIndex] * v[column]));
}
