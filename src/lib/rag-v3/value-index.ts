import { promises as fs } from "node:fs";
import path from "node:path";
import { getEncoderArtifactDirectory, type TextIndexId } from "./composite-index";

const ROOT = path.join(process.cwd(), "data", "combinatorial-genesis", "v3");

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

const cached = new Map<TextIndexId, LoadedSelectIndex>();

function normalized(vector: number[]): Float32Array {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return Float32Array.from(vector, (value) => value / (norm || 1));
}

function dot(left: Float32Array, right: Float32Array): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

async function loadSelectIndex(indexId: TextIndexId): Promise<LoadedSelectIndex | null> {
  const valueDir = indexId === "qwen3" ? path.join(ROOT, "value-anchors") : getEncoderArtifactDirectory(indexId, "range-anchors");
  const manifestPath = path.join(valueDir, "select-options.json");
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as SelectManifest;
    if (cached.get(indexId)?.manifest.cache_sha256 === manifest.cache_sha256) return cached.get(indexId)!;
    const binary = await fs.readFile(path.join(valueDir, manifest.vectors_file));
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
    const loaded = { manifest, vectors };
    cached.set(indexId, loaded);
    return loaded;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function rankSelectOptionNames(queryVector: number[], allowedNames: Set<string>, limit: number, indexId: TextIndexId = "qwen3") {
  const index = await loadSelectIndex(indexId);
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
