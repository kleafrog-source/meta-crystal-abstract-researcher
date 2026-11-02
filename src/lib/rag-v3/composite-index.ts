import { promises as fs } from "node:fs";
import path from "node:path";

const INDEX_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis", "v3");
export type TextIndexId = "qwen3" | "embeddinggemma2";

export const TEXT_INDEX_MODELS: Record<TextIndexId, string> = {
  qwen3: "qwen3-embedding:0.6b",
  embeddinggemma2: "embeddinggemma-2:740m",
};

export function getTextIndexDirectory(index: TextIndexId): string {
  return path.join(INDEX_ROOT, index === "qwen3" ? "composite-index" : "embeddinggemma2-text-index");
}

interface CompositeRow {
  technical_name: string;
  source: "library" | "frozen";
  generated: boolean;
  embedding_text: string;
  embedding_text_sha256: string;
  vector_origin: string;
  retrieval_scope: string;
}

interface CompositeManifest {
  created_at: string;
  cache_sha256: string;
  model: string;
  dimensions: number;
  parameter_count: number;
  dataset_version: string;
  vector_origins: Record<string, number>;
  files: { rows: string; embeddings: string };
}

interface LoadedIndex {
  manifest: CompositeManifest;
  rowByName: Map<string, { row: CompositeRow; vector: Float32Array }>;
}

const cached = new Map<TextIndexId, LoadedIndex>();

function normalized(vector: number[]): Float32Array {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return Float32Array.from(vector, (value) => value / (norm || 1));
}

function dot(left: Float32Array, right: Float32Array): number {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
  return value;
}

async function loadIndex(indexId: TextIndexId): Promise<LoadedIndex> {
  const indexDir = getTextIndexDirectory(indexId);
  const manifest = JSON.parse(await fs.readFile(path.join(indexDir, "manifest.json"), "utf8")) as CompositeManifest;
  const current = cached.get(indexId);
  if (current?.manifest.cache_sha256 === manifest.cache_sha256) return current;
  const [rows, binary] = await Promise.all([
    fs.readFile(path.join(indexDir, manifest.files.rows), "utf8").then((value) => JSON.parse(value) as CompositeRow[]),
    fs.readFile(path.join(indexDir, manifest.files.embeddings)),
  ]);
  const count = binary.readUInt32LE(0);
  const dimensions = binary.readUInt32LE(4);
  if (count !== rows.length || count !== manifest.parameter_count || dimensions !== manifest.dimensions) {
    throw new Error("V3 composite index header mismatch.");
  }
  const rowByName = new Map<string, { row: CompositeRow; vector: Float32Array }>();
  let offset = 8;
  for (const row of rows) {
    const vector = new Float32Array(dimensions);
    for (let column = 0; column < dimensions; column += 1) {
      vector[column] = binary.readFloatLE(offset);
      offset += 4;
    }
    rowByName.set(row.technical_name, { row, vector });
  }
  const loaded = { manifest, rowByName };
  cached.set(indexId, loaded);
  return loaded;
}

export async function getCompositeIndexInfo(indexId: TextIndexId = "qwen3"): Promise<CompositeManifest> {
  return (await loadIndex(indexId)).manifest;
}

export async function getCompositeParameterNames(indexId: TextIndexId = "qwen3"): Promise<string[]> {
  return Array.from((await loadIndex(indexId)).rowByName.keys());
}

export async function getCompositeVectorsByNames(names: string[], indexId: TextIndexId = "qwen3"): Promise<Array<{ name: string; vector: number[] }>> {
  const index = await loadIndex(indexId);
  return names.flatMap((name) => {
    const entry = index.rowByName.get(name);
    return entry ? [{ name, vector: Array.from(entry.vector) }] : [];
  });
}

export async function rankCompositeNames(queryVector: number[], names: string[], limit: number, indexId: TextIndexId = "qwen3") {
  const index = await loadIndex(indexId);
  const query = normalized(queryVector);
  if (query.length !== index.manifest.dimensions) throw new Error("V3 query/index dimensions differ.");
  return names.flatMap((name) => {
    const entry = index.rowByName.get(name);
    return entry ? [{ name, similarity: dot(query, entry.vector), row: entry.row }] : [];
  }).sort((left, right) => right.similarity - left.similarity || left.name.localeCompare(right.name)).slice(0, limit);
}

export async function rankCompositeNamesMulti(
  queryVectors: Array<{ vector: number[]; weight: number }>,
  names: string[],
  limit: number,
  indexId: TextIndexId = "qwen3",
) {
  const index = await loadIndex(indexId);
  const queries = queryVectors.map(({ vector, weight }) => ({ vector: normalized(vector), weight }));
  if (queries.some((query) => query.vector.length !== index.manifest.dimensions)) {
    throw new Error("V3 multi-query/index dimensions differ.");
  }
  return names.flatMap((name) => {
    const entry = index.rowByName.get(name);
    if (!entry) return [];
    let similarity = Number.NEGATIVE_INFINITY;
    let conceptIndex = 0;
    const conceptScores: number[] = [];
    for (let indexValue = 0; indexValue < queries.length; indexValue += 1) {
      const score = dot(queries[indexValue].vector, entry.vector) * queries[indexValue].weight;
      conceptScores.push(score);
      if (score > similarity) {
        similarity = score;
        conceptIndex = indexValue;
      }
    }
    return [{ name, similarity, concept_index: conceptIndex, concept_scores: conceptScores, row: entry.row, vector: entry.vector }];
  }).sort((left, right) => right.similarity - left.similarity || left.name.localeCompare(right.name)).slice(0, limit);
}
