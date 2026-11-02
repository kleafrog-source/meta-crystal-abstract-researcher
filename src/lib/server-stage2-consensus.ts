export interface Stage2SeedVector {
  technical_name: string;
  similarity: number;
  vector: number[];
}

export interface Stage2Centroid {
  vector: number[];
  seedNames: string[];
}

export function keepOnlyNewStage2Hits<T extends { technical_name: string }>(stage1Names: readonly string[], hits: readonly T[]): T[] {
  const excluded = new Set(stage1Names);
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (!hit.technical_name || excluded.has(hit.technical_name) || seen.has(hit.technical_name)) return false;
    seen.add(hit.technical_name);
    return true;
  });
}

const MAX_CENTROID_SEEDS = 32;

function normalized(vector: number[]): number[] | null {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) return null;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 1e-12) return null;
  return vector.map((value) => value / norm);
}

export function buildStage2Centroid(seeds: readonly Stage2SeedVector[]): Stage2Centroid | null {
  const unique = new Map<string, Stage2SeedVector>();
  for (const seed of seeds) {
    if (!seed.technical_name || !Number.isFinite(seed.similarity) || unique.has(seed.technical_name)) continue;
    unique.set(seed.technical_name, seed);
  }
  const ordered = Array.from(unique.values())
    .sort((left, right) => right.similarity - left.similarity || left.technical_name.localeCompare(right.technical_name))
    .slice(0, MAX_CENTROID_SEEDS);
  const valid = ordered.flatMap((seed) => {
    const vector = normalized(seed.vector);
    const weight = Math.max(0, Math.min(1, seed.similarity));
    return vector && weight > 0 ? [{ name: seed.technical_name, vector, weight }] : [];
  });
  if (!valid.length) return null;
  const dimensions = valid[0].vector.length;
  const compatible = valid.filter((seed) => seed.vector.length === dimensions);
  const centroid = Array.from({ length: dimensions }, (_, column) =>
    compatible.reduce((sum, seed) => sum + seed.vector[column] * seed.weight, 0) / compatible.reduce((sum, seed) => sum + seed.weight, 0),
  );
  const vector = normalized(centroid);
  return vector ? { vector, seedNames: compatible.map((seed) => seed.name) } : null;
}
