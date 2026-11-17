import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { type TextIndexId } from "@/lib/rag-v3/composite-index";
import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";
import { withCatalogueFileLock } from "./catalogue-persistence";
import { excludedRegistrySha, readExcludedRegistry } from "./registry";
import { resolveGemmaRuntimeAtomIndexDirectory, resolveRuntimeAtomIndexDirectory } from "./runtime-index-path";

export interface RuntimeAtomRow {
  atom: string;
  role: "unit" | "property" | "concept_or_descriptor";
  parameter_frequency: number;
  occurrence_weight: number;
  source_parameters: string[];
  source_reference_diagnostics?: Array<{ technical_name: string; reason: string }>;
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
  default?: number | string | number[];
  options?: string[];
  quantity_kind?: string | null;
  lyria_prompt_tags?: string[];
  semantic_keywords?: string[];
  domain?: string;
}

interface RuntimeIndexManifest {
  version_id: string;
  model: string;
  dimensions: number;
  atom_count: number;
  files: { rows: string; embeddings: string };
  rows_sha256?: string;
  vectors_sha256?: string;
}

interface LoadedRuntimeIndex {
  cacheSha256: string;
  manifest: RuntimeIndexManifest;
  rows: RuntimeAtomRow[];
  vectors: Float32Array[];
}

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
const cached = new Map<TextIndexId, LoadedRuntimeIndex>();

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

export function assertRuntimeCorpusCurrent(input: {
  currentRevision: string;
  datasetSourceRevision?: unknown;
  runtimeSourceRevision?: unknown;
  archivedFallbackEnabled?: unknown;
}): void {
  if (input.archivedFallbackEnabled !== false) {
    throw new Error("Runtime atom index was built with archived-source fallback; rebuild from a current live-catalog candidate.");
  }
  if (!input.datasetSourceRevision || input.datasetSourceRevision !== input.currentRevision) {
    throw new Error("Active atom corpus does not match the current live catalogue; prepare, vectorize, technically finalize, and explicitly connect a current-snapshot candidate first.");
  }
  if (!input.runtimeSourceRevision || input.runtimeSourceRevision !== input.currentRevision) {
    throw new Error("Runtime atom rows are stale for the current live catalogue; finalize and connect the matching current-snapshot candidate.");
  }
}

export async function loadRuntimeAtomIndexFromDirectory(indexDir: string, expectedVersionId: string): Promise<LoadedRuntimeIndex> {
  const manifest = JSON.parse(await fs.readFile(path.join(indexDir, "manifest.json"), "utf8")) as RuntimeIndexManifest & { cache_sha256?: string };
  if (manifest.version_id !== expectedVersionId || !Number.isInteger(manifest.atom_count) || manifest.atom_count <= 0
      || !Number.isInteger(manifest.dimensions) || manifest.dimensions <= 0 || !manifest.files?.rows || !manifest.files?.embeddings) {
    throw new Error("Runtime atom manifest is incomplete or does not identify the requested dataset version.");
  }
  const root = path.resolve(indexDir);
  const rowsPath = path.resolve(root, manifest.files.rows);
  const vectorsPath = path.resolve(root, manifest.files.embeddings);
  if (!rowsPath.startsWith(root + path.sep) || !vectorsPath.startsWith(root + path.sep)) throw new Error("Runtime atom manifest file path escapes its index directory.");
  const [rowsBytes, binary] = await Promise.all([fs.readFile(rowsPath), fs.readFile(vectorsPath)]);
  if (!manifest.rows_sha256 || createHash("sha256").update(rowsBytes).digest("hex") !== manifest.rows_sha256) throw new Error("Runtime atom rows checksum is missing or invalid.");
  if (!manifest.vectors_sha256 || createHash("sha256").update(binary).digest("hex") !== manifest.vectors_sha256) throw new Error("Runtime atom vectors checksum is missing or invalid.");
  const rows = JSON.parse(rowsBytes.toString("utf8")) as RuntimeAtomRow[];
  if (rows.length !== manifest.atom_count || rows.some((row) => !row.atom || row.embedding_text !== row.atom.replaceAll("_", " ").trim())) {
    throw new Error("Runtime atom rows are incomplete or their embedding text does not match row identity.");
  }
  const vectors = readVectors(binary, manifest.atom_count, manifest.dimensions);
  for (let rowIndex = 0; rowIndex < vectors.length; rowIndex += 1) {
    const vector = vectors[rowIndex]!;
    let norm = 0;
    for (const value of vector) {
      if (!Number.isFinite(value)) throw new Error("Runtime atom vector contains a non-finite value.");
      norm += value * value;
    }
    if (Math.abs(Math.sqrt(norm) - 1) > 1e-4) throw new Error("Runtime atom vector is not normalized.");
  }
  return { cacheSha256: manifest.cache_sha256 ?? "", manifest, rows, vectors };
}

async function currentCatalogueRevision(): Promise<string> {
  const tombstonesPath = path.join(DATA_ROOT, "library", "catalogue-deleted.json");
  const [libraryBytes, tombstonesRaw, registry] = await Promise.all([
    fs.readFile(path.join(DATA_ROOT, "library", "parameters.json")),
    fs.readFile(tombstonesPath, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "[]" : Promise.reject(error)),
    readExcludedRegistry(),
  ]);
  const librarySha = createHash("sha256").update(libraryBytes).digest("hex");
  const tombstonesSha = createHash("sha256").update(tombstonesRaw).digest("hex");
  const registrySha = excludedRegistrySha(registry);
  return createHash("sha256").update(`${librarySha}\0${tombstonesSha}\0${registrySha}`).digest("hex");
}

export async function activeRuntimeCorpusMatchesLive(): Promise<boolean> {
  return withCatalogueFileLock(async () => {
    const latest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8")) as { version_id?: string };
    if (!latest.version_id) return false;
    const [manifest, currentRevision, snapshot] = await Promise.all([
      fs.readFile(path.join(DATA_ROOT, "datasets", latest.version_id, "manifest.json"), "utf8").then((value) => JSON.parse(value) as { source_revision?: string; parameter_count?: number }),
      currentCatalogueRevision(),
      getV3SnapshotIdentity(),
    ]);
    return manifest.source_revision === currentRevision && Number(manifest.parameter_count) === snapshot.parameter_count;
  });
}

async function loadRuntimeIndex(indexId: TextIndexId = "qwen3"): Promise<LoadedRuntimeIndex> {
  const pointerName = indexId === "qwen3" ? "latest.json" : "embeddinggemma2-latest.json";
  const latest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", pointerName), "utf8")) as {
    version_id: string; runtime_atom_index_path?: unknown; gemma_bundle_path?: unknown; encoder?: unknown;
  };
  if (!latest.version_id) throw new Error(`${indexId} runtime pointer has no dataset version.`);
  if (indexId === "embeddinggemma2" && latest.encoder !== "embeddinggemma2") throw new Error("Gemma runtime pointer has the wrong encoder identity.");
  const indexDir = indexId === "qwen3"
    ? resolveRuntimeAtomIndexDirectory(DATA_ROOT, latest.version_id, latest.runtime_atom_index_path)
    : resolveGemmaRuntimeAtomIndexDirectory(DATA_ROOT, latest).directory;
  const versionDir = path.join(DATA_ROOT, "datasets", latest.version_id);
  const manifest = JSON.parse(
    await fs.readFile(path.join(indexDir, "manifest.json"), "utf8"),
  ) as RuntimeIndexManifest & { cache_sha256: string };
  const [datasetManifest, currentRevision] = await Promise.all([
    fs.readFile(path.join(versionDir, "manifest.json"), "utf8").then((value) => JSON.parse(value) as { source_revision?: string }),
    currentCatalogueRevision(),
  ]);
  assertRuntimeCorpusCurrent({
    currentRevision,
    datasetSourceRevision: datasetManifest.source_revision,
    runtimeSourceRevision: (manifest as RuntimeIndexManifest & { effective_catalogue_revision?: string }).effective_catalogue_revision,
    archivedFallbackEnabled: (manifest as RuntimeIndexManifest & { frozen_donor_fallback_enabled?: boolean }).frozen_donor_fallback_enabled,
  });
  const cacheIdentity = `${path.resolve(indexDir)}\0${manifest.cache_sha256 ?? ""}`;
  if (cached.get(indexId)?.manifest.version_id === latest.version_id && cached.get(indexId)?.cacheSha256 === cacheIdentity) return cached.get(indexId)!;
  if (manifest.version_id !== latest.version_id) throw new Error("Runtime index version mismatch.");
  const [rows, binary] = await Promise.all([
    fs.readFile(path.join(indexDir, manifest.files.rows), "utf8").then((value) => JSON.parse(value) as RuntimeAtomRow[]),
    fs.readFile(path.join(indexDir, manifest.files.embeddings)),
  ]);
  if (manifest.rows_sha256 && createHash("sha256").update(await fs.readFile(path.join(indexDir, manifest.files.rows))).digest("hex") !== manifest.rows_sha256) {
    throw new Error("Runtime atom rows integrity check failed.");
  }
  if (manifest.vectors_sha256 && createHash("sha256").update(binary).digest("hex") !== manifest.vectors_sha256) {
    throw new Error("Runtime atom vectors integrity check failed.");
  }
  if (rows.length !== manifest.atom_count) throw new Error("Runtime atom row count mismatch.");
  const loaded = {
    cacheSha256: cacheIdentity,
    manifest,
    rows,
    vectors: readVectors(binary, manifest.atom_count, manifest.dimensions),
  };
  cached.set(indexId, loaded);
  return loaded;
}

export async function rankRuntimeAtoms(queryEmbedding: number[], limit = 160, indexId: TextIndexId = "qwen3"): Promise<{
  versionId: string;
  model: string;
  atoms: RankedRuntimeAtom[];
}> {
  const index = await loadRuntimeIndex(indexId);
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
    atoms,
  };
}
