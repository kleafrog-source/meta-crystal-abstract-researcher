import { promises as fs } from "node:fs";
import path from "node:path";

const VALUE_DIR = path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "value-anchors");

interface ValueEntry {
  row_index: number;
  option: string | number;
}

interface SelectManifest {
  cache_sha256: string;
  dimensions: number;
  count: number;
  vectors_file: string;
  parameters: Record<string, ValueEntry[]>;
}

interface LoadedSelectIndex {
  manifest: SelectManifest;
  vectors: Float32Array[];
}

let cached: LoadedSelectIndex | null = null;

function normalized(vector: number[]): Float32Array {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return Float32Array.from(vector, (value) => value / (norm || 1));
}

function dot(left: Float32Array, right: Float32Array): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

async function loadSelectIndex(): Promise<LoadedSelectIndex | null> {
  const manifestPath = path.join(VALUE_DIR, "select-options.json");
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as SelectManifest;
    if (cached?.manifest.cache_sha256 === manifest.cache_sha256) return cached;
    const binary = await fs.readFile(path.join(VALUE_DIR, manifest.vectors_file));
    const count = binary.readUInt32LE(0);
    const dimensions = binary.readUInt32LE(4);
    if (count !== manifest.count || dimensions !== manifest.dimensions) throw new Error("V3 Select option index header mismatch.");
    const vectors: Float32Array[] = [];
    let offset = 8;
    for (let row = 0; row < count; row += 1) {
      const vector = new Float32Array(dimensions);
      for (let column = 0; column < dimensions; column += 1) {
        vector[column] = binary.readFloatLE(offset);
        offset += 4;
      }
      vectors.push(vector);
    }
    cached = { manifest, vectors };
    return cached;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function rankSelectOptionNames(queryVector: number[], allowedNames: Set<string>, limit: number) {
  const index = await loadSelectIndex();
  if (!index) return [];
  const query = normalized(queryVector);
  if (query.length !== index.manifest.dimensions) throw new Error("V3 query/Select option dimensions differ.");
  return Object.entries(index.manifest.parameters).flatMap(([name, entries]) => {
    if (!allowedNames.has(name)) return [];
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestOption: string | number | null = null;
    for (const entry of entries) {
      const score = dot(query, index.vectors[entry.row_index]);
      if (score > bestScore) {
        bestScore = score;
        bestOption = entry.option;
      }
    }
    return [{ name, similarity: bestScore, option: bestOption }];
  }).sort((left, right) => right.similarity - left.similarity || left.name.localeCompare(right.name)).slice(0, limit);
}
