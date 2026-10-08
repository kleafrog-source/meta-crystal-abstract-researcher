import { promises as fs } from "node:fs";
import path from "node:path";

const INDEX_DIR = path.join(process.cwd(), "data", "combinatorial-genesis", "v3", "composite-index");

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
  library_count: number;
  frozen_count: number;
  dataset_version: string;
  vector_origins: Record<string, number>;
  files: { rows: string; embeddings: string };
}

interface LoadedIndex {
  manifest: CompositeManifest;
  rowByName: Map<string, { row: CompositeRow; vector: Float32Array }>;
}

let cached: LoadedIndex | null = null;

function normalized(vector: number[]): Float32Array {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return Float32Array.from(vector, (value) => value / (norm || 1));
}

function dot(left: Float32Array, right: Float32Array): number {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
  return value;
}

async function loadIndex(): Promise<LoadedIndex> {
  const manifest = JSON.parse(await fs.readFile(path.join(INDEX_DIR, "manifest.json"), "utf8")) as CompositeManifest;
  if (cached?.manifest.cache_sha256 === manifest.cache_sha256) return cached;
  const [rows, binary] = await Promise.all([
    fs.readFile(path.join(INDEX_DIR, manifest.files.rows), "utf8").then((value) => JSON.parse(value) as CompositeRow[]),
    fs.readFile(path.join(INDEX_DIR, manifest.files.embeddings)),
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
  cached = { manifest, rowByName };
  return cached;
}

export async function getCompositeIndexInfo(): Promise<CompositeManifest> {
  return (await loadIndex()).manifest;
}

export async function rankCompositeNames(queryVector: number[], names: string[], limit: number) {
  const index = await loadIndex();
  const query = normalized(queryVector);
  if (query.length !== index.manifest.dimensions) throw new Error("V3 query/index dimensions differ.");
  return names.flatMap((name) => {
    const entry = index.rowByName.get(name);
    return entry ? [{ name, similarity: dot(query, entry.vector), row: entry.row }] : [];
  }).sort((left, right) => right.similarity - left.similarity || left.name.localeCompare(right.name)).slice(0, limit);
}
