import { promises as fs } from "node:fs";
import path from "node:path";

export interface RuntimeAtomRow {
  atom: string;
  role: "unit" | "property" | "concept_or_descriptor";
  parameter_frequency: number;
  occurrence_weight: number;
  source_parameters: string[];
  embedding_text: string;
}

export interface RankedRuntimeAtom extends RuntimeAtomRow {
  similarity: number;
}

export interface RuntimeParameterRecord {
  technical_name: string;
  name_ru?: string;
  description_en?: string;
  description_ru?: string;
  category?: string;
  sub_category?: string;
  ui_element: string;
  unit?: string;
  min_value?: number;
  max_value?: number;
  step?: number;
  default?: number | string;
  options?: string[];
  quantity_kind?: string | null;
  lyria_prompt_tags?: string[];
  semantic_keywords?: string[];
}

interface RuntimeIndexManifest {
  version_id: string;
  model: string;
  dimensions: number;
  atom_count: number;
  files: { rows: string; embeddings: string };
}

interface LoadedRuntimeIndex {
  cacheSha256: string;
  manifest: RuntimeIndexManifest;
  rows: RuntimeAtomRow[];
  vectors: Float32Array[];
  frozenNames: Set<string>;
  frozenParameters: RuntimeParameterRecord[];
}

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
let cached: LoadedRuntimeIndex | null = null;

function normalize(vector: number[]): Float32Array {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) throw new Error("Query embedding has zero norm.");
  return Float32Array.from(vector, (value) => value / norm);
}

function cosine(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
  return value;
}

function readVectors(buffer: Buffer, expectedCount: number, expectedDimensions: number): Float32Array[] {
  const count = buffer.readUInt32LE(0);
  const dimensions = buffer.readUInt32LE(4);
  if (count !== expectedCount || dimensions !== expectedDimensions) {
    throw new Error(
      `Runtime atom index header mismatch: ${count}x${dimensions}, expected ${expectedCount}x${expectedDimensions}.`,
    );
  }
  const expectedBytes = 8 + count * dimensions * 4;
  if (buffer.length !== expectedBytes) throw new Error("Runtime atom index binary size mismatch.");
  const vectors: Float32Array[] = [];
  let offset = 8;
  for (let row = 0; row < count; row += 1) {
    const vector = new Float32Array(dimensions);
    for (let column = 0; column < dimensions; column += 1) {
      vector[column] = buffer.readFloatLE(offset);
      offset += 4;
    }
    vectors.push(vector);
  }
  return vectors;
}

async function loadRuntimeIndex(): Promise<LoadedRuntimeIndex> {
  const latest = JSON.parse(
    await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8"),
  ) as { version_id: string };
  const indexDir = path.join(DATA_ROOT, "indexes", latest.version_id);
  const versionDir = path.join(DATA_ROOT, "datasets", latest.version_id);
  const manifest = JSON.parse(
    await fs.readFile(path.join(indexDir, "manifest.json"), "utf8"),
  ) as RuntimeIndexManifest & { cache_sha256: string };
  if (
    cached?.manifest.version_id === latest.version_id &&
    cached.cacheSha256 === manifest.cache_sha256
  ) return cached;
  if (manifest.version_id !== latest.version_id) throw new Error("Runtime index version mismatch.");
  const [rows, binary, parameters] = await Promise.all([
    fs.readFile(path.join(indexDir, manifest.files.rows), "utf8").then((value) => JSON.parse(value) as RuntimeAtomRow[]),
    fs.readFile(path.join(indexDir, manifest.files.embeddings)),
    fs.readFile(path.join(versionDir, "parameters.json"), "utf8").then(
      (value) => JSON.parse(value) as RuntimeParameterRecord[],
    ),
  ]);
  if (rows.length !== manifest.atom_count) throw new Error("Runtime atom row count mismatch.");
  cached = {
    cacheSha256: manifest.cache_sha256,
    manifest,
    rows,
    vectors: readVectors(binary, manifest.atom_count, manifest.dimensions),
    frozenNames: new Set(parameters.flatMap((item) => item.technical_name ? [item.technical_name] : [])),
    frozenParameters: parameters,
  };
  return cached;
}

export async function getFrozenRuntimeParameters(): Promise<{
  versionId: string;
  parameters: RuntimeParameterRecord[];
}> {
  const index = await loadRuntimeIndex();
  return { versionId: index.manifest.version_id, parameters: index.frozenParameters };
}

export async function rankRuntimeAtoms(queryEmbedding: number[], limit = 160): Promise<{
  versionId: string;
  model: string;
  frozenNames: ReadonlySet<string>;
  atoms: RankedRuntimeAtom[];
}> {
  const index = await loadRuntimeIndex();
  const query = normalize(queryEmbedding);
  if (query.length !== index.manifest.dimensions) {
    throw new Error(
      `Query embedding dimension ${query.length} does not match runtime index ${index.manifest.dimensions}.`,
    );
  }
  const atoms = index.rows
    .map((row, position) => ({ ...row, similarity: cosine(query, index.vectors[position]) }))
    .sort((left, right) => right.similarity - left.similarity || left.atom.localeCompare(right.atom))
    .slice(0, Math.max(1, Math.min(index.rows.length, limit)));
  return {
    versionId: index.manifest.version_id,
    model: index.manifest.model,
    frozenNames: index.frozenNames,
    atoms,
  };
}
