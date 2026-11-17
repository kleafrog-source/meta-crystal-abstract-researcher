import { readFileSync, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const INDEX_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis", "v3");
const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
export type TextIndexId = "qwen3" | "embeddinggemma2";

export const TEXT_INDEX_MODELS: Record<TextIndexId, string> = {
  qwen3: "qwen3-embedding:0.6b",
  embeddinggemma2: "embeddinggemma-2:740m",
};

export async function getConfiguredTextIndexModel(index: TextIndexId): Promise<string> {
  try {
    const { loadLLMSettings } = await import("@/lib/llm/factory");
    const settings = await loadLLMSettings();
    const slot = settings.capabilityRegistry.modelSlots[index === "qwen3" ? "textEmbedding" : "multimodalEmbedding"];
    return slot?.modelId.trim() || TEXT_INDEX_MODELS[index];
  } catch {
    return TEXT_INDEX_MODELS[index];
  }
}

export function getTextIndexDirectory(index: TextIndexId): string {
  if (index === "qwen3") return path.join(getActiveQwenBundleRoot() ?? INDEX_ROOT, "composite-index");
  const bundleRoot = getActiveGemmaBundleRoot();
  if (bundleRoot) return path.join(bundleRoot, "text-index");
  return path.join(INDEX_ROOT, "embeddinggemma2-text-index");
}

export function getEncoderArtifactDirectory(index: TextIndexId, artifact: "anchors" | "range-anchors" | "relations" | "runtime-atoms"): string {
  if (index === "qwen3") {
    const bundleRoot = getActiveQwenBundleRoot();
    if (bundleRoot) {
      const directory = artifact === "range-anchors" ? "value-anchors" : artifact;
      return path.join(bundleRoot, directory);
    }
    const legacyDirectory = artifact === "anchors" ? path.join(INDEX_ROOT, "anchoring")
      : artifact === "range-anchors" ? path.join(INDEX_ROOT, "value-anchors")
        : artifact === "relations" ? path.join(INDEX_ROOT, "relations")
          : path.join(INDEX_ROOT, "qwen3", artifact);
    return legacyDirectory;
  }
  const bundleRoot = getActiveGemmaBundleRoot();
  if (bundleRoot) {
    const directory = artifact === "range-anchors" ? "range-anchors" : artifact;
    return path.join(bundleRoot, directory);
  }
  return path.join(INDEX_ROOT, "embeddinggemma2", artifact);
}

export function resolveActiveGemmaBundleRoot(dataRoot: string = DATA_ROOT): string | null {
  let latest: { gemma_bundle_path?: unknown; artifact_bundle_required?: unknown };
  try {
    latest = JSON.parse(readFileSync(path.join(dataRoot, "datasets", "embeddinggemma2-latest.json"), "utf8")) as { gemma_bundle_path?: unknown; artifact_bundle_required?: unknown };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (typeof latest.gemma_bundle_path !== "string" || !latest.gemma_bundle_path) {
    if (latest.artifact_bundle_required === true) throw new Error("Active dataset requires a validated Gemma artifact bundle, but its pointer is missing.");
    return null;
  }
  const root = path.resolve(dataRoot, latest.gemma_bundle_path);
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  if (!root.startsWith(maintenanceRoot)) throw new Error("Active Gemma bundle pointer escapes the immutable candidate area.");
  return root;
}

export function getActiveGemmaBundleRoot(): string | null {
  return resolveActiveGemmaBundleRoot();
}

export function resolveActiveQwenBundleRoot(dataRoot: string = DATA_ROOT): string | null {
  let latest: { qwen_bundle_path?: unknown; artifact_bundle_required?: unknown };
  try {
    latest = JSON.parse(readFileSync(path.join(dataRoot, "datasets", "latest.json"), "utf8")) as { qwen_bundle_path?: unknown; artifact_bundle_required?: unknown };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (typeof latest.qwen_bundle_path !== "string" || !latest.qwen_bundle_path) {
    if (latest.artifact_bundle_required === true) throw new Error("Active dataset requires a validated Qwen artifact bundle, but its pointer is missing.");
    return null;
  }
  const root = path.resolve(dataRoot, latest.qwen_bundle_path);
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  if (!root.startsWith(maintenanceRoot)) throw new Error("Active Qwen bundle pointer escapes the immutable candidate area.");
  return root;
}

export function getActiveQwenBundleRoot(): string | null {
  return resolveActiveQwenBundleRoot();
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

export interface ValueSelectionBundle {
  bundleRoot: string;
  textIndexDirectory: string;
  valueDirectory: string;
  identity: {
    bundle_id: string;
    encoder: TextIndexId;
    model: string;
    dimensions: number;
    source_revision: string;
    source_snapshot_sha256: string;
    selection_contract_version: number;
    retrieval_fingerprint: string;
    range_candidates_fingerprint: string;
    typed_candidates_fingerprint: string;
    retrieval_preprocessing: string;
    value_preprocessing: string;
  };
}

function requireManifestString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Value-selection bundle is missing ${label}.`);
  return value;
}

export function selectionBundleDatasetIdentityMatches(input: {
  bundleDatasetVersion: unknown;
  activeDatasetVersion: unknown;
  retrievalDatasetVersion: unknown;
  retrievalSourceRevision: unknown;
}): boolean {
  return typeof input.bundleDatasetVersion === "string" && input.bundleDatasetVersion.length > 0
    && input.bundleDatasetVersion === input.activeDatasetVersion
    && typeof input.retrievalSourceRevision === "string" && input.retrievalSourceRevision.length > 0
    && input.retrievalDatasetVersion === input.retrievalSourceRevision;
}

export async function getValueSelectionBundle(indexId: TextIndexId, expectedModel: string): Promise<ValueSelectionBundle> {
  const bundleRoot = indexId === "qwen3" ? getActiveQwenBundleRoot() : getActiveGemmaBundleRoot();
  if (!bundleRoot) throw new Error(`No active ${indexId} candidate bundle is connected. Build and connect a current bundle in Service Bay.`);
  const resolvedRoot = path.resolve(bundleRoot);
  const maintenanceRoot = path.resolve(DATA_ROOT, "maintenance") + path.sep;
  if (!resolvedRoot.startsWith(maintenanceRoot)) throw new Error(`Active ${indexId} selection bundle is outside maintenance storage.`);
  const textIndexDirectory = path.join(resolvedRoot, indexId === "qwen3" ? "composite-index" : "text-index");
  const valueDirectory = path.join(resolvedRoot, indexId === "qwen3" ? "value-anchors" : "range-anchors");
  const bundleManifestPath = path.join(resolvedRoot, "bundle-manifest.json");
  const retrievalManifestPath = path.join(textIndexDirectory, "manifest.json");
  const rangeManifestPath = path.join(valueDirectory, "manifest.json");
  const typedManifestPath = path.join(valueDirectory, "select-options.json");
  const activeDatasetPointerPath = path.join(DATA_ROOT, "datasets", indexId === "qwen3" ? "latest.json" : "embeddinggemma2-latest.json");
  const [bundleBytes, retrievalBytes, rangeBytes, typedBytes] = await Promise.all([
    fs.readFile(bundleManifestPath), fs.readFile(retrievalManifestPath), fs.readFile(rangeManifestPath), fs.readFile(typedManifestPath),
  ]);
  const activeDatasetPointer = JSON.parse(await fs.readFile(activeDatasetPointerPath, "utf8")) as Record<string, unknown>;
  const bundle = JSON.parse(bundleBytes.toString("utf8")) as Record<string, unknown>;
  const retrieval = JSON.parse(retrievalBytes.toString("utf8")) as Record<string, unknown>;
  const range = JSON.parse(rangeBytes.toString("utf8")) as Record<string, unknown>;
  const typed = JSON.parse(typedBytes.toString("utf8")) as Record<string, unknown>;
  const bundleId = path.basename(path.dirname(path.dirname(resolvedRoot)));
  const sourceRevision = requireManifestString(retrieval.source_revision, "retrieval source revision");
  const sourceSnapshot = requireManifestString(retrieval.source_snapshot_sha256, "retrieval source fingerprint");
  const dimensions = Number(retrieval.dimensions);
  const preprocessing = requireManifestString(retrieval.embedding_preprocessing_version, "retrieval preprocessing version");
  if (bundle.status !== "complete" || bundle.encoder !== indexId || bundle.model !== expectedModel
    || Number(bundle.value_selection_contract_version) !== 2 || Number(bundle.candidate_text_version) !== 2
    || Number(bundle.dimensions) !== dimensions
    || Number(retrieval.dimensions) <= 0 || retrieval.model !== expectedModel
    || !Number.isInteger(dimensions)
    || (indexId === "qwen3" ? bundle.source_snapshot_sha256 : bundle.source_snapshot_content_sha256) !== sourceSnapshot
    || bundle.source_revision !== sourceRevision
    || !selectionBundleDatasetIdentityMatches({
      bundleDatasetVersion: bundle.dataset_version,
      activeDatasetVersion: activeDatasetPointer.version_id,
      retrievalDatasetVersion: retrieval.dataset_version,
      retrievalSourceRevision: sourceRevision,
    })
    || (indexId === "embeddinggemma2" && bundle.candidate_id !== bundleId)
    || retrieval.value_selection_bundle_id !== bundleId) {
    throw new Error(`Active ${indexId} retrieval bundle does not match its model, source snapshot, or candidate identity.`);
  }
  for (const [label, manifest] of [["Range", range], ["typed candidates", typed]] as const) {
    if (manifest.model !== expectedModel || Number(manifest.dimensions) !== dimensions
      || manifest.source_revision !== sourceRevision || manifest.source_snapshot_sha256 !== sourceSnapshot
      || manifest.value_selection_bundle_id !== bundleId
      || Number(manifest.selection_contract_version) !== 2
      || Number(manifest.candidate_text_version) !== 2
      || typeof manifest.embedding_preprocessing_version !== "string" || !manifest.embedding_preprocessing_version) {
      throw new Error(`Active ${indexId} ${label} artifact is stale or incompatible. Rebuild the value-candidate rows in Service Bay.`);
    }
  }
  if (range.embedding_preprocessing_version !== typed.embedding_preprocessing_version) {
    throw new Error(`Active ${indexId} Range and typed candidate artifacts use different embedding preprocessing.`);
  }
  const files = Array.isArray(bundle.files) ? bundle.files as Array<{ path?: unknown; sha256?: unknown; bytes?: unknown }> : [];
  const expectedFiles = [
    [path.relative(resolvedRoot, retrievalManifestPath), retrievalBytes],
    [path.relative(resolvedRoot, rangeManifestPath), rangeBytes],
    [path.relative(resolvedRoot, typedManifestPath), typedBytes],
  ] as const;
  for (const [relativePath, bytes] of expectedFiles) {
    const normalized = relativePath.split(path.sep).join("/");
    const entry = files.find((item) => item.path === normalized);
    if (!entry || entry.bytes !== bytes.length || entry.sha256 !== createHash("sha256").update(bytes).digest("hex")) {
      throw new Error(`Active ${indexId} bundle inventory does not authenticate ${normalized}. Re-finalize the candidate in Service Bay.`);
    }
  }
  const rangeFingerprint = requireManifestString(range.cache_sha256, "Range candidate fingerprint");
  const typedFingerprint = requireManifestString(typed.cache_sha256, "typed candidate fingerprint");
  const retrievalFingerprint = requireManifestString(retrieval.cache_sha256, "retrieval fingerprint");
  return {
    bundleRoot: resolvedRoot,
    textIndexDirectory,
    valueDirectory,
    identity: {
      bundle_id: bundleId,
      encoder: indexId,
      model: expectedModel,
      dimensions,
      source_revision: sourceRevision,
      source_snapshot_sha256: sourceSnapshot,
      selection_contract_version: 2,
      retrieval_fingerprint: retrievalFingerprint,
      range_candidates_fingerprint: rangeFingerprint,
      typed_candidates_fingerprint: typedFingerprint,
      retrieval_preprocessing: preprocessing,
      value_preprocessing: requireManifestString(typed.embedding_preprocessing_version, "typed candidate preprocessing version"),
    },
  };
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
