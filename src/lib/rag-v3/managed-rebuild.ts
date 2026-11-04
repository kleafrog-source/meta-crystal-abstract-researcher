import { ChildProcess, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { loadEmbeddingRuntimeSettings, embeddingProcessEnv } from "@/lib/embedding-settings";
import { excludedRegistrySha, readExcludedRegistry } from "@/lib/combinatorial-genesis/registry";
import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";
import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { getConfiguredTextIndexModel, getEncoderArtifactDirectory, getTextIndexDirectory } from "@/lib/rag-v3/composite-index";
import { ensureOllamaModelAvailable, prepareGpuForEmbeddingModel } from "@/lib/ollama-memory";

export type RebuildKind = "composite" | "embeddinggemma2_text" | "atoms" | "anchors" | "range" | "select" | "relations" | "clap" | "gemma2_atoms" | "gemma2_anchors" | "gemma2_range" | "gemma2_select" | "gemma2_relations" | "all_qwen" | "catalogue";
export type ArtifactKind = Exclude<RebuildKind, "all_qwen" | "catalogue"> | "siglip";

export interface ManagedJob {
  running: boolean;
  kind: RebuildKind | null;
  stage: ArtifactKind | null;
  started_at: number;
  finished_at: number;
  exit_code: number | null;
  stop_requested: boolean;
  last_error: string | null;
  log_tail: string[];
}

export interface ArtifactStatus {
  kind: ArtifactKind;
  label: string;
  description: string;
  status: "built" | "not_built" | "stale" | "ready" | "missing" | "stale_data" | "stale_vectors" | "partial";
  built_at: string | null;
  model: string | null;
  dimensions: number | null;
  parameter_count: number;
  added_since_build: number;
  excluded_since_build: number;
  reason: string | null;
  fingerprint: string | null;
  data_fingerprint: string | null;
  vector_fingerprint: string | null;
  row_count: number;
  expected_count: number;
}

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
const V3_ROOT = path.join(DATA_ROOT, "v3");
const PYTHON = process.env.PYTHON_EXECUTABLE || "python";
const shared = globalThis as typeof globalThis & {
  __ragV3ManagedJob?: ManagedJob;
  __ragV3ManagedChild?: ChildProcess | null;
};
const idle = (): ManagedJob => ({ running: false, kind: null, stage: null, started_at: 0, finished_at: 0, exit_code: null, stop_requested: false, last_error: null, log_tail: [] });
if (!shared.__ragV3ManagedJob) shared.__ragV3ManagedJob = idle();

function append(job: ManagedJob, chunk: string) {
  job.log_tail.push(...chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  job.log_tail = job.log_tail.slice(-80);
}

async function command(kind: Exclude<ArtifactKind, "siglip">): Promise<{ args: string[]; env: NodeJS.ProcessEnv }> {
  const settings = await loadEmbeddingRuntimeSettings();
  const [qwenModel, gemmaModel] = await Promise.all([getConfiguredTextIndexModel("qwen3"), getConfiguredTextIndexModel("embeddinggemma2")]);
  const modelFor = (index: "qwen3" | "embeddinggemma2") => index === "qwen3" ? qwenModel : gemmaModel;
  const env = embeddingProcessEnv(settings);
  const anchoring = path.join(V3_ROOT, "anchoring");
  const valueArgs = (index: "qwen3" | "embeddinggemma2", target: "range" | "select") => [
    "-u", "python_engine/anchoring_v3/build_value_anchors.py",
    "--dataset", path.join(V3_ROOT, "dataset.json"),
    "--output", index === "qwen3" ? path.join(V3_ROOT, "value-anchors") : getEncoderArtifactDirectory(index, "range-anchors"),
    "--composite-dir", getTextIndexDirectory(index),
    "--endpoint", settings.baseUrl, "--model", modelFor(index), "--target", target, "--live-snapshot",
    ...(index === "embeddinggemma2" ? ["--direct"] : []),
  ];
  const atomArgs = (index: "qwen3" | "embeddinggemma2") => [
    "-u", "python_engine/build-combinatorial-runtime-index.py", "--endpoint", settings.baseUrl,
    "--model", modelFor(index), ...(index === "embeddinggemma2" ? ["--output-dir", getEncoderArtifactDirectory(index, "runtime-atoms")] : []),
  ];
  const relationArgs = (index: "qwen3" | "embeddinggemma2") => [
    "-u", "python_engine/anchoring_v3/build_relation_anchors.py",
    "--dataset", path.join(V3_ROOT, "dataset.json"),
    "--output", index === "qwen3" ? path.join(V3_ROOT, "relations") : getEncoderArtifactDirectory(index, "relations"),
    "--endpoint", settings.baseUrl, "--model", modelFor(index),
    "--live-snapshot",
  ];
  const liveAnchorArgs = (index: "qwen3" | "embeddinggemma2") => {
    const base = path.join(V3_ROOT, "anchoring");
    const indexDir = getTextIndexDirectory(index);
    return ["-u", "python_engine/anchoring_v3/build_anchors.py",
      "--endpoint", settings.baseUrl, "--model", modelFor(index),
      "--dataset", path.join(V3_ROOT, "dataset.json"),
      "--axes", path.join(base, "axes.json"), "--polarity", path.join(base, "polarity_matrix.json"),
      "--strong", path.join(base, "calibration", "strong_set.json"), "--neutral", path.join(base, "calibration", "neutral_set.json"),
      "--out", index === "qwen3" ? path.join(base, "anchors_build.json") : path.join(getEncoderArtifactDirectory(index, "anchors"), "anchors_build.json"),
      "--param-rows", path.join(indexDir, "rows.json"), "--param-embeddings", path.join(indexDir, "embeddings.f32"),
      "--live-snapshot"];
  };
  const specs: Record<Exclude<ArtifactKind, "siglip">, string[]> = {
    composite: ["-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl, "--model", qwenModel],
    embeddinggemma2_text: ["-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl, "--model", gemmaModel, "--batch-size", "16", "--output-dir", getTextIndexDirectory("embeddinggemma2"), "--retrieval-text-only"],
    atoms: atomArgs("qwen3"),
    anchors: liveAnchorArgs("qwen3"),
    range: valueArgs("qwen3", "range"),
    select: valueArgs("qwen3", "select"),
    relations: relationArgs("qwen3"),
    clap: ["-u", "python_engine/sidecar.py", "audio_index"],
    gemma2_atoms: atomArgs("embeddinggemma2"),
    gemma2_anchors: liveAnchorArgs("embeddinggemma2"),
    gemma2_range: valueArgs("embeddinggemma2", "range"),
    gemma2_select: valueArgs("embeddinggemma2", "select"),
    gemma2_relations: relationArgs("embeddinggemma2"),
  };
  return { args: specs[kind], env };
}

async function runStage(kind: Exclude<ArtifactKind, "siglip">, job: ManagedJob): Promise<number> {
  job.stage = kind;
  if (kind === "embeddinggemma2_text" || kind.startsWith("gemma2_")) {
    const model = await getConfiguredTextIndexModel("embeddinggemma2");
    await ensureOllamaModelAvailable(model);
    await prepareGpuForEmbeddingModel(model, 5_000, "embeddinggemma2-index-build");
  }
  const spec = await command(kind);
  if (kind === "gemma2_anchors") await fs.mkdir(path.dirname(spec.args[spec.args.indexOf("--out") + 1]!), { recursive: true });
  append(job, `[managed-rebuild] starting ${kind}`);
  return new Promise((resolve) => {
    const child = spawn(PYTHON, spec.args, { cwd: process.cwd(), env: spec.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    shared.__ragV3ManagedChild = child;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => append(job, String(chunk)));
    child.stderr?.on("data", (chunk) => { append(job, String(chunk)); job.last_error = String(chunk).trim() || job.last_error; });
    child.on("error", (error) => { job.last_error = error.message; resolve(-1); });
    child.on("close", (code) => { append(job, `[managed-rebuild] ${kind} exited ${code ?? -1}`); resolve(code ?? -1); });
  });
}

export function getManagedJob(): ManagedJob {
  return { ...shared.__ragV3ManagedJob!, log_tail: [...shared.__ragV3ManagedJob!.log_tail] };
}

export async function startManagedRebuild(kind: RebuildKind) {
  const current = shared.__ragV3ManagedJob!;
  if (current.running) return { started: false, reason: "another rebuild is already running", job: getManagedJob() };
  const isGemma = kind === "embeddinggemma2_text" || kind.startsWith("gemma2_");
  const slotOwner = isGemma ? "embeddinggemma2-index-build" : `${kind}-index-build`;
  if (!acquireEmbeddingModelSlot(slotOwner)) return { started: false, reason: `model slot is busy: ${getEmbeddingModelSlot()?.owner ?? "unknown operation"}`, job: getManagedJob() };
  const job = idle();
  job.running = true;
  job.kind = kind;
  job.started_at = Date.now();
  shared.__ragV3ManagedJob = job;
  const stages: Array<Exclude<ArtifactKind, "siglip">> = kind === "all_qwen"
    ? ["composite", "atoms", "anchors", "range", "select", "relations"]
    : kind === "catalogue"
      ? ["composite", "anchors"]
      : [kind as Exclude<ArtifactKind, "siglip">];
  void (async () => {
    let exitCode = 0;
    try {
      for (const stage of stages) {
        if (job.stop_requested) { exitCode = 130; break; }
        exitCode = await runStage(stage, job);
        if (exitCode !== 0) break;
      }
    } catch (error) {
      exitCode = -1;
      job.last_error = error instanceof Error ? error.message : String(error);
      append(job, `[managed-rebuild] ${job.last_error}`);
    } finally {
      job.running = false;
      job.exit_code = exitCode;
      job.finished_at = Date.now();
      shared.__ragV3ManagedChild = null;
      releaseEmbeddingModelSlot(slotOwner);
    }
    if (exitCode !== 0 && !job.last_error && !job.stop_requested) job.last_error = `rebuild exited with ${exitCode}`;
  })();
  return { started: true, job: getManagedJob() };
}

export function stopManagedRebuild() {
  const job = shared.__ragV3ManagedJob!;
  if (!job.running) return { stopped: false, reason: "no rebuild is running", job: getManagedJob() };
  job.stop_requested = true;
  shared.__ragV3ManagedChild?.kill("SIGTERM");
  return { stopped: true, job: getManagedJob() };
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>; } catch { return null; }
}

async function readJsonValue(filePath: string): Promise<unknown> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown; } catch { return null; }
}

function artifactPaths(versionId: string): Record<ArtifactKind, string> {
  return {
    composite: path.join(V3_ROOT, "composite-index", "manifest.json"),
    embeddinggemma2_text: path.join(getTextIndexDirectory("embeddinggemma2"), "manifest.json"),
    atoms: path.join(DATA_ROOT, "indexes", versionId, "manifest.json"),
    anchors: path.join(V3_ROOT, "anchoring", "anchors_build.json"),
    range: path.join(V3_ROOT, "value-anchors", "manifest.json"),
    select: path.join(V3_ROOT, "value-anchors", "select-options.json"),
    relations: path.join(V3_ROOT, "relations", "manifest.json"),
    clap: path.join(DATA_ROOT, "audio-clap-index", "index.json"),
    gemma2_atoms: path.join(getEncoderArtifactDirectory("embeddinggemma2", "runtime-atoms"), "manifest.json"),
    gemma2_anchors: path.join(getEncoderArtifactDirectory("embeddinggemma2", "anchors"), "anchors_build.json"),
    gemma2_range: path.join(getEncoderArtifactDirectory("embeddinggemma2", "range-anchors"), "manifest.json"),
    gemma2_select: path.join(getEncoderArtifactDirectory("embeddinggemma2", "range-anchors"), "select-options.json"),
    gemma2_relations: path.join(getEncoderArtifactDirectory("embeddinggemma2", "relations"), "manifest.json"),
    siglip: path.join(DATA_ROOT, "morpho-siglip", "manifest.json"),
  };
}

/** Cheap existence check for mode runtime; authoritative freshness audit is explicit in Service Bay. */
export async function isArtifactManifestAvailable(kind: ArtifactKind, expectedModel?: string): Promise<boolean> {
  const latest = await readJson(path.join(DATA_ROOT, "datasets", "latest.json"));
  const paths = artifactPaths(String(latest?.version_id ?? ""));
  const manifest = await readJson(paths[kind]);
  return Boolean(manifest && (!expectedModel || String(manifest.model ?? manifest.model_id ?? "") === expectedModel));
}

export interface BankStatus { mode_id: string; input: string; encoder: string; value_policy: string; status: "ready" | "partial" | "stale_data" | "stale_vectors" | "missing"; dependencies: string[] }

export async function getArtifactStatuses(): Promise<{ artifacts: ArtifactStatus[]; banks: BankStatus[]; active_model: string; active_endpoint: string; registry_sha256: string; active_parameters: number }> {
  const [settings, registry, latest, snapshot, tombstones] = await Promise.all([
    loadEmbeddingRuntimeSettings(),
    readExcludedRegistry(),
    readJson(path.join(DATA_ROOT, "datasets", "latest.json")),
    getV3SnapshotIdentity(),
    readJsonValue(path.join(DATA_ROOT, "library", "catalogue-deleted.json")),
  ]);
  const registrySha = excludedRegistrySha(registry);
  const [qwenModel, gemmaModel] = await Promise.all([getConfiguredTextIndexModel("qwen3"), getConfiguredTextIndexModel("embeddinggemma2")]);
  const versionId = String(latest?.version_id ?? "");
  const activeCount = snapshot.parameter_count;
  const [libraryRows, frozenAtoms] = await Promise.all([
    readJsonValue(path.join(DATA_ROOT, "library", "parameters.json")),
    readJsonValue(path.join(DATA_ROOT, "datasets", versionId, "atoms.json")),
  ]);
  const deletedNames = new Set(Array.isArray(tombstones) ? tombstones.filter((name): name is string => typeof name === "string") : tombstones && typeof tombstones === "object" && Array.isArray((tombstones as { technical_names?: unknown }).technical_names) ? (tombstones as { technical_names: unknown[] }).technical_names.filter((name): name is string => typeof name === "string") : []);
  const excludedNames = new Set(registry.entries.map((entry) => entry.technical_name));
  const parameterByName = new Map<string, Record<string, unknown>>();
  for (const row of Array.isArray(libraryRows) ? libraryRows as Array<Record<string, unknown>> : []) {
    const name = String(row.technical_name ?? "").trim();
    if (name) parameterByName.set(name, row);
  }
  const currentDataset = [...parameterByName.entries()].filter(([name]) => !excludedNames.has(name) && !deletedNames.has(name)).map(([, row]) => row);
  const rangeExpected = currentDataset.reduce((total, row) => total + (row.ui_element === "Range" && typeof row.min_value === "number" && typeof row.max_value === "number" ? 5 : 0), 0);
  const selectExpected = currentDataset.reduce((total, row) => total + (row.ui_element === "Select" && Array.isArray(row.options) ? row.options.length : 0), 0);
  const acousticLayers = new Set(["VOCAL_MORPHOLOGY_LAYER", "SYNTHESIS_PHYSICS_LAYER", "SPECTRAL_DSP_LAYER", "SPATIAL_BINAURAL_LAYER", "DYNAMICS_ENVELOPE_LAYER", "TEMPORAL_RHYTHM_LAYER", "GENERATIVE_CHAOS_LAYER", "COMPOSITIONAL_VECTOR_LAYER", "MODULATION_PERFORMANCE_LAYER"]);
  const siglipExpected = currentDataset.filter((row) => {
    const name = String(row.technical_name ?? "").toLowerCase();
    const namespace = [row.category, row.sub_category, row.domain, row.technical_name].map((value) => String(value ?? "")).join(" ").toLowerCase();
    if (/(^|[^a-z0-9])(ui|metric_monitoring|metrics|tier_management|ui_interaction|visual_effects|system_ui|dashboard|telemetry)([^a-z0-9]|$)/i.test(namespace)) return false;
    const layer = String(row.domain_layer ?? "").trim().toUpperCase();
    if (layer === "GLOBAL_CONSENSUS_LAYER" || (layer && !acousticLayers.has(layer))) return false;
    if (!layer && !["sound", "structure"].includes(String(row.retrieval_scope ?? "sound"))) return false;
    return !["validation_json_", "provenance_", "descriptive_metadata_", "classification_", "semantic_concept_", "smart_contract_", "licensing_", "contract_address_"].some((prefix) => name.startsWith(prefix)) && !name.includes("ownership_proof");
  }).length;
  const atomRows = Array.isArray(frozenAtoms) ? frozenAtoms as Array<Record<string, unknown>> : [];
  const atomsExpected = atomRows.filter((row) => {
    const sources = Array.isArray(row.source_parameters) ? row.source_parameters.filter((name): name is string => typeof name === "string" && !excludedNames.has(name) && !deletedNames.has(name)) : [];
    return !Array.isArray(row.source_parameters) || sources.length > 0;
  }).length;
  const paths = artifactPaths(versionId);
  const labels: Record<ArtifactKind, string> = {
    composite: "Qwen3 text index", embeddinggemma2_text: "EmbeddingGemma 2 text index", atoms: "Runtime atoms", anchors: "Live axes / anchors",
    range: "Range value anchors", select: "Select options", relations: "Relation anchors", clap: "CLAP audio index",
    gemma2_atoms: "Gemma 2 runtime atoms", gemma2_anchors: "Gemma 2 live axes / anchors", gemma2_range: "Gemma 2 Range value anchors",
    gemma2_select: "Gemma 2 Select options", gemma2_relations: "Gemma 2 relation anchors",
    siglip: "SigLIP2 / Morpho index",
  };
  const descriptions: Record<ArtifactKind, string> = {
    composite: "Main text retrieval parameter vectors.", embeddinggemma2_text: "Gemma-space text retrieval vectors; audio/spec queries use this bank.",
    atoms: "Genesis runtime atoms embedded with Qwen3; a separate structural source.", anchors: "Live axis anchors and per-parameter a_home mapping in Qwen3 space.",
    range: "Qwen3-space Range value anchors.", select: "Qwen3-space Select option anchors.", relations: "Qwen3 relation vectors and parameter bindings.", clap: "CLAP audio-to-parameter candidates.",
    gemma2_atoms: "Genesis runtime atoms embedded independently with Gemma; a separate structural source.", gemma2_anchors: "Gemma-space live axis anchors and parameter mapping.",
    gemma2_range: "Gemma-space Range value anchors.", gemma2_select: "Gemma-space Select option anchors.", gemma2_relations: "Gemma-space relation vectors and current parameter bindings.",
    siglip: "SigLIP2 spectrogram/image candidates; modality-specific index.",
  };
  const expectedForKind = (kind: ArtifactKind) => kind === "siglip" ? siglipExpected : kind.includes("atoms") ? atomsExpected
    : kind === "relations" || kind === "gemma2_relations" ? 12
      : kind === "range" || kind === "gemma2_range" ? rangeExpected
        : kind === "select" || kind === "gemma2_select" ? selectExpected : activeCount;
  const artifacts = await Promise.all((Object.keys(paths) as ArtifactKind[]).map(async (kind): Promise<ArtifactStatus> => {
    const manifest = await readJson(paths[kind]);
    if (!manifest) return { kind, label: labels[kind], description: descriptions[kind], status: "missing", built_at: null, model: null, dimensions: null, parameter_count: 0, added_since_build: activeCount, excluded_since_build: registry.entries.length, reason: "manifest not found", fingerprint: null, data_fingerprint: null, vector_fingerprint: null, row_count: 0, expected_count: expectedForKind(kind) };
    const model = String(manifest.model ?? manifest.model_id ?? "") || null;
    const dimensions = Number(manifest.dimensions ?? manifest.dim ?? 0) || null;
    const count = Number(manifest.parameter_count ?? manifest.count ?? manifest.atom_count ?? 0);
    const builtRegistrySha = String(manifest.excluded_sha256 ?? "");
    const isGemma = kind === "embeddinggemma2_text" || kind.startsWith("gemma2_");
    const expectedModel = kind === "clap" || kind === "siglip" ? model : isGemma ? gemmaModel : qwenModel;
    const modelMismatch = kind !== "clap" && kind !== "siglip" && model !== expectedModel;
    const expectedDimensions = kind === "siglip" ? 768 : isGemma ? 768 : 1024;
    const dimensionMismatch = kind !== "clap" && dimensions !== null && dimensions !== expectedDimensions;
    const siglipRevisionMismatch = kind === "siglip" && manifest.model_revision !== "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2";
    const registryMismatch = builtRegistrySha !== registrySha;
    const versionMismatch = ((kind === "composite" || kind === "embeddinggemma2_text") && String(manifest.dataset_version ?? "") !== versionId)
      || (kind === "atoms" && String(manifest.version_id ?? "") !== versionId);
    const sourceCount = kind === "siglip" ? activeCount : Number(manifest.source_parameter_count ?? manifest.parameter_count ?? activeCount);
    // These artifacts are built from the current live parameter snapshot. Runtime atoms are
    // intentionally tied to the frozen Genesis dataset and use versionMismatch instead.
    const snapshotBound = kind === "composite" || kind === "embeddinggemma2_text" || kind === "siglip" || kind.endsWith("_anchors")
      || kind === "anchors" || kind === "range" || kind === "select" || kind === "relations" || kind === "clap"
      || kind === "gemma2_range" || kind === "gemma2_select" || kind === "gemma2_relations";
    const countMismatch = snapshotBound && sourceCount !== activeCount;
    const expectedCount = expectedForKind(kind);
    const rowCount = kind === "anchors" || kind === "gemma2_anchors"
      ? Object.keys((manifest.a_home && typeof manifest.a_home === "object" ? manifest.a_home : {}) as object).length
      : Number(manifest.count ?? manifest.atom_count ?? manifest.parameter_count ?? 0);
    const partial = rowCount < expectedCount;
    const rowCountMismatch = rowCount !== expectedCount;
    const dataFingerprintMismatch = !kind.includes("atoms") && Boolean(manifest.source_snapshot_sha256) && String(manifest.source_snapshot_sha256) !== snapshot.content_sha256;
    const reason = [modelMismatch ? `model ${model} ≠ ${expectedModel}` : "", dimensionMismatch ? `dimensions ${dimensions} ≠ ${expectedDimensions}` : "", registryMismatch ? "registry changed" : "", versionMismatch || dataFingerprintMismatch ? "source data changed" : "", countMismatch ? `library count ${activeCount} ≠ indexed ${sourceCount}` : "", rowCountMismatch ? `rows ${rowCount} ≠ expected ${expectedCount}` : ""].filter(Boolean).join("; ") || null;
    return {
      kind, label: labels[kind], description: descriptions[kind], status: partial ? "partial" : modelMismatch || dimensionMismatch || siglipRevisionMismatch ? "stale_vectors" : registryMismatch || versionMismatch || countMismatch || dataFingerprintMismatch || rowCountMismatch ? "stale_data" : "ready",
      built_at: String(manifest.created_at ?? manifest.generated_at ?? "") || null,
      model, dimensions, parameter_count: count,
      added_since_build: Math.max(0, activeCount - sourceCount),
      excluded_since_build: registryMismatch ? registry.entries.length : 0,
      reason,
      fingerprint: String(manifest.cache_sha256 ?? manifest.source_snapshot_sha256 ?? "") || null,
      data_fingerprint: String(manifest.source_snapshot_sha256 ?? manifest.dataset_version ?? manifest.version_id ?? "") || null,
      vector_fingerprint: String(manifest.vector_fingerprint ?? manifest.cache_sha256 ?? manifest.source_fingerprint ?? manifest.model_revision ?? "") || null,
      row_count: rowCount,
      expected_count: expectedCount,
    };
  }));
  const banks: BankStatus[] = [
    { mode_id: "text.qwen.resolved", input: "text", encoder: "Qwen3", value_policy: "anchors / resolved values", dependencies: ["composite", "anchors", "range", "select"] },
    { mode_id: "text.gemma.awtd", input: "text", encoder: "EmbeddingGemma 2", value_policy: "defaults / roles only", dependencies: ["embeddinggemma2_text"] },
    { mode_id: "text.gemma.resolved", input: "text", encoder: "EmbeddingGemma 2", value_policy: "Gemma-space value pass", dependencies: ["embeddinggemma2_text", "gemma2_anchors", "gemma2_range", "gemma2_select"] },
    { mode_id: "audio.clap.resolved", input: "audio", encoder: "CLAP", value_policy: "values", dependencies: ["clap"] },
    { mode_id: "audio.gemma.awtd", input: "audio", encoder: "EmbeddingGemma 2", value_policy: "roles / defaults", dependencies: ["embeddinggemma2_text"] },
    { mode_id: "audio.gemma.resolved", input: "audio", encoder: "EmbeddingGemma 2", value_policy: "Gemma-space value pass", dependencies: ["embeddinggemma2_text", "gemma2_anchors", "gemma2_range", "gemma2_select"] },
    { mode_id: "spec.siglip.resolved", input: "spectrogram", encoder: "SigLIP2", value_policy: "values", dependencies: ["siglip"] },
    { mode_id: "spec.gemma.*", input: "spectrogram", encoder: "EmbeddingGemma 2", value_policy: "stub / partial", dependencies: ["embeddinggemma2_text"] },
  ].map((bank) => {
    const existing = bank.dependencies.map((kind) => artifacts.find((item) => item.kind === kind)).filter(Boolean);
    const unready = existing.filter((item) => item && item.status !== "ready" && item.status !== "built");
    const status: BankStatus["status"] = bank.mode_id === "spec.gemma.*" ? "partial" : !unready.length ? "ready" : unready.some((item) => item?.status === "stale_vectors") ? "stale_vectors" : unready.some((item) => item?.status === "stale_data") ? "stale_data" : unready.some((item) => item?.status === "partial") ? "partial" : "missing";
    const dependencyState = unready.map((item) => `${item?.kind}: ${item?.status}`);
    return { ...bank, status, dependencies: dependencyState.length ? [...bank.dependencies, ...dependencyState] : bank.dependencies };
  });
  return { artifacts, banks, active_model: qwenModel, active_endpoint: settings.baseUrl, registry_sha256: registrySha, active_parameters: activeCount };
}
