import { ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { freemem } from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";

import { loadEmbeddingRuntimeSettings, embeddingProcessEnv } from "@/lib/embedding-settings";
import { excludedRegistrySha, readExcludedRegistry } from "@/lib/combinatorial-genesis/registry";
import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";
import { withCatalogueFileLock } from "@/lib/combinatorial-genesis/catalogue-persistence";
import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";
import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { getConfiguredTextIndexModel, getEncoderArtifactDirectory, getTextIndexDirectory, selectionBundleDatasetIdentityMatches } from "@/lib/rag-v3/composite-index";
import { ensureOllamaModelAvailable, prepareGpuForEmbeddingModel } from "@/lib/ollama-memory";
import { assertRuntimeCorpusCurrent, loadRuntimeAtomIndexFromDirectory } from "@/lib/combinatorial-genesis/runtime-index";
import { resolveRuntimeAtomIndexDirectory } from "@/lib/combinatorial-genesis/runtime-index-path";
import { GEMMA_ARTIFACT_DIRECTORIES, GEMMA_CANDIDATE_ARTIFACTS, type GemmaBuildIdentity, type GemmaCandidateArtifactKind } from "@/lib/rag-v3/gemma-bundle";
import { ensureGemmaCandidateArtifactDirectory, gemmaBuildIdentitySha256 } from "@/lib/rag-v3/gemma-build-identity";

export type RebuildKind = "composite" | "embeddinggemma2_text" | "atoms" | "anchors" | "range" | "select" | "relations" | "clap" | "gemma2_atoms" | "gemma2_anchors" | "gemma2_range" | "gemma2_select" | "gemma2_relations" | "all_qwen" | "catalogue" | "corpus_candidate" | "vectorize_candidate" | "finalize_candidate" | "qwen_component" | "gemma_component" | "finalize_gemma_candidate";
export type ArtifactKind = Exclude<RebuildKind, "all_qwen" | "catalogue" | "corpus_candidate" | "vectorize_candidate" | "finalize_candidate" | "qwen_component" | "gemma_component" | "finalize_gemma_candidate"> | "siglip";
export type QwenCandidateArtifactKind = "composite" | "atoms" | "anchors" | "range" | "select" | "relations";
export type ManagedStage = ArtifactKind | "prepare_candidate" | "vectorize_candidate" | "finalize_candidate" | "finalize_gemma_candidate" | "value-anchors";

export interface ManagedJob {
  running: boolean;
  kind: RebuildKind | null;
  stage: ManagedStage | null;
  started_at: number;
  finished_at: number;
  exit_code: number | null;
  stop_requested: boolean;
  safe_to_stop: boolean;
  source_revision: string | null;
  source_snapshot_path: string | null;
  source_snapshot_sha256: string | null;
  excluded_sha256: string | null;
  excluded_count: number;
  candidate_version: string | null;
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
  embeddings_reused: number | null;
  embeddings_computed: number | null;
  runtime_path: string;
  runtime_in_use: boolean;
  source_freshness: "current" | "stale" | "unknown";
  vectors_ready: boolean;
  job_status: "running" | "complete" | "error" | "idle";
  candidate_status: string | null;
  candidate_path: string | null;
  prepared_inputs: string[];
  prepared_input_dispositions: Record<string, string>;
  preparation_fingerprint: string | null;
  snapshot_file_fingerprint: string | null;
  missing_dependencies: string[];
}


async function artifactOutputFilesReady(kind: ArtifactKind, manifest: Record<string, unknown>, manifestPath: string): Promise<boolean> {
  const directory = path.dirname(manifestPath);
  const files: string[] = kind === "composite" || kind === "embeddinggemma2_text" ? ["rows.json", "embeddings.f32"]
    : kind === "atoms" || kind === "gemma2_atoms" ? ["atoms.json", "atom_embeddings.f32"]
      : kind === "anchors" || kind === "gemma2_anchors" ? ["anchors_build.json"]
        : kind === "range" || kind === "gemma2_range" ? ["manifest.json", String(manifest.vectors_file ?? "embeddings.f32")]
          : kind === "select" || kind === "gemma2_select" ? ["select-options.json", String(manifest.vectors_file ?? "select-options.f32")]
            : kind === "relations" || kind === "gemma2_relations" ? ["manifest.json", String(manifest.vectors_file ?? "embeddings.f32")]
          : kind === "clap" ? ["index.json"] : kind === "siglip" ? ["rows.json", "embeddings.f32"] : ["manifest.json"];
  try {
    const stats = await Promise.all(files.map((file) => fs.stat(path.join(directory, file))));
    if (stats.some((stat) => !stat.isFile() || stat.size === 0)) return false;
    const binary = files.find((file) => file.endsWith(".f32"));
    if (binary) {
      const handle = await fs.open(path.join(directory, binary), "r");
      try {
        const header = Buffer.alloc(8);
        const { bytesRead } = await handle.read(header, 0, 8, 0);
        if (bytesRead !== 8) return false;
        const count = header.readUInt32LE(0);
        const dimensions = header.readUInt32LE(4);
        const expectedCount = Number(manifest.count ?? manifest.parameter_count ?? manifest.atom_count ?? 0);
        const expectedDimensions = Number(manifest.dimensions ?? manifest.dim ?? 0);
        if (dimensions <= 0 || (expectedCount > 0 && count !== expectedCount)
          || (expectedDimensions > 0 && dimensions !== expectedDimensions)
          || stats[files.indexOf(binary)]!.size !== 8 + count * dimensions * 4) return false;
      } finally { await handle.close(); }
    }
    return true;
  } catch { return false; }
}

export function activeCorpusBlockReason(
  active: { source_revision?: unknown; parameter_count?: unknown } | null,
  current: { revision: string; parameter_count: number },
): string | null {
  if (!active || typeof active.source_revision !== "string" || !active.source_revision) {
    return "The active dataset is historical and has no current-catalogue source revision. Prepare the current snapshot, build each required artifact row, and technically finalize before explicit connection.";
  }
  if (active.source_revision !== current.revision || Number(active.parameter_count) !== current.parameter_count) {
    return `The active dataset is stale for the live catalogue (active ${String(active.parameter_count ?? "?")} / ${active.source_revision.slice(0, 12)}, current ${current.parameter_count} / ${current.revision.slice(0, 12)}). Prepare the current snapshot, build each required artifact row, and technically finalize before explicit connection.`;
  }
  return null;
}

export function snapshotArtifactIsCurrent(
  manifest: { source_snapshot_sha256?: unknown; excluded_sha256?: unknown; dataset_version?: unknown },
  current: { content_sha256: string; excluded_sha256: string; dataset_version: string },
  requiresActiveDatasetVersion: boolean,
): boolean {
  return manifest.source_snapshot_sha256 === current.content_sha256
    && manifest.excluded_sha256 === current.excluded_sha256
    && (!requiresActiveDatasetVersion || manifest.dataset_version === current.dataset_version);
}

export function textArtifactIsCurrent(
  kind: "composite" | "embeddinggemma2_text",
  manifest: Record<string, unknown> & { source_snapshot_sha256?: unknown; excluded_sha256?: unknown; dataset_version?: unknown },
  current: { content_sha256: string; excluded_sha256: string; dataset_version: string },
  sourceRevision: string,
): boolean {
  return snapshotArtifactIsCurrent(manifest, current, false)
    && artifactDatasetVersionMatches(kind, manifest, current.dataset_version, "", sourceRevision);
}

export function candidateRuntimeIndexFinalizeArgs(input: {
  versionId: string;
  versionDir: string;
  model: string;
  endpoint: string;
  outputDir: string;
  snapshotPath: string;
  sourceRevision: string;
  snapshotFileSha256: string;
  excludedSha256: string;
}): string[] {
  return [
    "-u", "python_engine/build-combinatorial-runtime-index.py",
    "--version-id", input.versionId,
    "--version-dir", input.versionDir,
    "--model", input.model,
    "--endpoint", input.endpoint,
    "--output-dir", input.outputDir,
    "--effective-snapshot", input.snapshotPath,
    "--source-revision", input.sourceRevision,
    "--source-snapshot-sha256", input.snapshotFileSha256,
    "--excluded-sha256", input.excludedSha256,
    "--finalize-only",
  ];
}

export function serviceBayPreflightDecision(input: {
  liveCount: number;
  localEndpoint: boolean;
  modelInstalled: boolean;
  outputWritable: boolean;
  missingDependencies?: string[];
  availableMemoryBytes: number;
  jobRunning: boolean;
  modelSlotBusy: boolean;
  candidateBundleCurrent?: boolean;
  candidateRowsReady?: boolean;
}) {
  const candidateBlockers = [
    input.liveCount <= 0 ? "effective live catalogue is empty" : "",
    !input.localEndpoint ? "candidate embeddings require a local Ollama endpoint" : "",
    !input.modelInstalled ? "configured embedding model is unavailable locally" : "",
    !input.outputWritable ? "candidate output directory is not writable" : "",
    ...(input.missingDependencies ?? []).map((dependency) => `required builder input is missing: ${dependency}`),
    input.availableMemoryBytes < 2 * 1024 * 1024 * 1024 ? "less than 2 GiB of free RAM is available" : "",
    input.jobRunning ? "another Service Bay job is running" : "",
    input.modelSlotBusy ? "embedding model slot is busy" : "",
  ].filter(Boolean);
  const candidateBusy = input.jobRunning || input.modelSlotBusy;
  const candidateReady = Boolean(input.candidateBundleCurrent);
  return {
    can_build_candidate: candidateBlockers.length === 0,
    candidate_blockers: candidateBlockers,
    dependent_indexes_build_with_candidate: true,
    can_build_dependent_indexes: candidateBlockers.length === 0,
    dependent_index_reason: candidateBlockers.length === 0 ? null : candidateBlockers.join("; "),
    can_prepare_candidate: input.liveCount > 0 && input.outputWritable && (input.missingDependencies ?? []).length === 0 && !input.jobRunning,
    can_vectorize_candidate: false,
    can_finalize_candidate: Boolean(input.candidateRowsReady) && !candidateBusy,
    can_activate: candidateReady && !candidateBusy,
    activation_reason: !candidateReady
      ? "Prepare, vectorize, and technically finalize a current-snapshot candidate first."
      : candidateBusy
        ? "Wait for the active Service Bay job or embedding model operation to finish."
        : "A complete current-snapshot candidate passed technical validation; connection remains explicit.",
  };
}

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
const V3_ROOT = path.join(DATA_ROOT, "v3");
const PYTHON = process.env.PYTHON_EXECUTABLE || "python";
const shared = globalThis as typeof globalThis & {
  __ragV3ManagedJob?: ManagedJob;
  __ragV3ManagedChild?: ChildProcess | null;
};
const idle = (): ManagedJob => ({ running: false, kind: null, stage: null, started_at: 0, finished_at: 0, exit_code: null, stop_requested: false, safe_to_stop: false, source_revision: null, source_snapshot_path: null, source_snapshot_sha256: null, excluded_sha256: null, excluded_count: 0, candidate_version: null, last_error: null, log_tail: [] });
if (!shared.__ragV3ManagedJob) shared.__ragV3ManagedJob = idle();

function append(job: ManagedJob, chunk: string) {
  const safe = chunk
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s&,;"']+/gi, "$1[redacted]")
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, "$1[redacted]");
  job.log_tail.push(...safe.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  job.log_tail = job.log_tail.slice(-80);
}

async function command(kind: Exclude<ArtifactKind, "siglip">, atomCandidateDir?: string, rowsOnly = false, job?: ManagedJob): Promise<{ args: string[]; env: NodeJS.ProcessEnv }> {
  const settings = await loadEmbeddingRuntimeSettings();
  const [qwenModel, gemmaModel] = await Promise.all([getConfiguredTextIndexModel("qwen3"), getConfiguredTextIndexModel("embeddinggemma2")]);
  const modelFor = (index: "qwen3" | "embeddinggemma2") => index === "qwen3" ? qwenModel : gemmaModel;
  const env = embeddingProcessEnv(settings);
  const pinnedArgs = job?.source_snapshot_path ? ["--parameter-snapshot", job.source_snapshot_path, "--source-revision", job.source_revision ?? "", "--source-snapshot-sha256", job.source_snapshot_sha256 ?? "", "--excluded-sha256", job.excluded_sha256 ?? "", "--excluded-count", String(job.excluded_count)] : [];
  const pinnedAtomArgs = job?.source_snapshot_path ? ["--effective-snapshot", job.source_snapshot_path, "--source-revision", job.source_revision ?? "", "--excluded-sha256", job.excluded_sha256 ?? ""] : [];
  const anchoring = path.join(V3_ROOT, "anchoring");
  const valueArgs = (index: "qwen3" | "embeddinggemma2", target: "range" | "select") => [
    "-u", "python_engine/anchoring_v3/build_value_anchors.py",
    "--dataset", path.join(V3_ROOT, "dataset.json"),
    "--output", index === "qwen3" ? path.join(V3_ROOT, "value-anchors") : getEncoderArtifactDirectory(index, "range-anchors"),
    "--composite-dir", getTextIndexDirectory(index),
    "--endpoint", settings.baseUrl, "--model", modelFor(index), "--target", target,
    ...(job?.source_snapshot_path ? pinnedArgs : ["--live-snapshot"]),
    ...(index === "embeddinggemma2" ? ["--direct"] : []),
  ];
  const atomArgs = (index: "qwen3" | "embeddinggemma2") => [
    "-u", "python_engine/build-combinatorial-runtime-index.py", "--endpoint", settings.baseUrl,
    "--model", modelFor(index), ...(index === "embeddinggemma2" ? ["--output-dir", getEncoderArtifactDirectory(index, "runtime-atoms")] : []),
    ...(index === "qwen3" && atomCandidateDir ? ["--output-dir", atomCandidateDir] : []),
    ...(job?.source_snapshot_path ? pinnedAtomArgs : []),
    ...(rowsOnly && index === "qwen3" ? ["--rows-only"] : []),
  ];
  const relationArgs = (index: "qwen3" | "embeddinggemma2") => [
    "-u", "python_engine/anchoring_v3/build_relation_anchors.py",
    "--dataset", path.join(V3_ROOT, "dataset.json"),
    "--output", index === "qwen3" ? path.join(V3_ROOT, "relations") : getEncoderArtifactDirectory(index, "relations"),
    "--endpoint", settings.baseUrl, "--model", modelFor(index),
    ...(job?.source_snapshot_path ? pinnedArgs : ["--live-snapshot"]),
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
      ...(job?.source_snapshot_path ? pinnedArgs : ["--live-snapshot"])];
  };
  const specs: Record<Exclude<ArtifactKind, "siglip">, string[]> = {
    composite: ["-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl, "--model", qwenModel, ...pinnedArgs],
    embeddinggemma2_text: ["-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl, "--model", gemmaModel, "--batch-size", "16", "--output-dir", getTextIndexDirectory("embeddinggemma2"), "--retrieval-text-only", ...pinnedArgs],
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
  let atomCandidateDir: string | undefined;
  let atomActiveDir: string | undefined;
  let atomBackupDir: string | undefined;
  let atomSourceRevision: string | undefined;
  const rowsOnly = kind === "atoms" && job.kind === "atoms";
  if (kind === "atoms") {
    atomSourceRevision = job.source_revision ?? (await captureEffectiveCatalogue()).revision;
    job.source_revision = atomSourceRevision;
    const latest = await readJson(path.join(DATA_ROOT, "datasets", "latest.json"));
    const versionId = String(latest?.version_id ?? "");
    if (!versionId) throw new Error("Cannot stage runtime atoms: no active immutable dataset version.");
    atomActiveDir = path.join(DATA_ROOT, "indexes", versionId);
    const maintenanceDir = path.join(DATA_ROOT, "maintenance");
    await fs.mkdir(maintenanceDir, { recursive: true });
    atomCandidateDir = path.join(maintenanceDir, `runtime-atoms-candidate-${randomUUID()}`);
    atomBackupDir = path.join(maintenanceDir, `runtime-atoms-backup-${Date.now()}-${randomUUID()}`);
    if (await existsPath(atomActiveDir)) {
      await fs.cp(atomActiveDir, atomCandidateDir, { recursive: true, errorOnExist: true, force: false });
    } else if (rowsOnly) {
      throw new Error("Rows-only rebuild requires the existing runtime index; no active vectors were found to reuse.");
    } else {
      await fs.mkdir(atomCandidateDir, { recursive: false });
    }
    append(job, `[managed-rebuild] staging runtime rows for ${versionId}; vectors are required to be reusable${rowsOnly ? " (rows-only guard enabled)" : ""}`);
  }
  const spec = await command(kind, atomCandidateDir, rowsOnly, job);
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
    child.on("close", async (code) => {
      append(job, `[managed-rebuild] ${kind} exited ${code ?? -1}`);
      if (code === 0 && atomCandidateDir && atomActiveDir && atomBackupDir) {
        try {
          const manifest = await readJson(path.join(atomCandidateDir, "manifest.json"));
          const rowsPath = path.join(atomCandidateDir, "atoms.json");
          const vectorsPath = path.join(atomCandidateDir, "atom_embeddings.f32");
          const [rowsBytes, vectorBytes] = await Promise.all([fs.readFile(rowsPath), fs.readFile(vectorsPath)]);
          const rows = JSON.parse(rowsBytes.toString("utf8")) as Array<{ atom?: string; embedding_text?: string }>;
          const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
          const currentSourceRevision = (await captureEffectiveCatalogue()).revision;
          if (!manifest || manifest.version_id !== path.basename(atomActiveDir)
            || rows.length !== Number(manifest.atom_count)
            || manifest.rows_sha256 !== sha(rowsBytes) || manifest.vectors_sha256 !== sha(vectorBytes)
            || manifest.effective_catalogue_revision !== atomSourceRevision || currentSourceRevision !== atomSourceRevision
            || vectorBytes.length !== 8 + rows.length * Number(manifest.dimensions) * 4) {
            throw new Error("staged runtime rows/vectors failed source revision, manifest, hash, or alignment validation");
          }
          if (rowsOnly) {
            const [oldRowsBytes, oldVectorBytes] = await Promise.all([
              fs.readFile(path.join(atomActiveDir, "atoms.json")), fs.readFile(path.join(atomActiveDir, "atom_embeddings.f32")),
            ]);
            const oldRows = JSON.parse(oldRowsBytes.toString("utf8")) as Array<{ atom?: string; embedding_text?: string }>;
            if (JSON.stringify(oldRows.map((row) => [row.atom, row.embedding_text])) !== JSON.stringify(rows.map((row) => [row.atom, row.embedding_text]))
              || !oldVectorBytes.equals(vectorBytes)) {
              throw new Error("rows-only candidate changed atom identity/text or vector bytes");
            }
          }
          await fs.rename(atomActiveDir, atomBackupDir);
          try { await fs.rename(atomCandidateDir, atomActiveDir); }
          catch (error) { await fs.rename(atomBackupDir, atomActiveDir); throw error; }
          append(job, `[managed-rebuild] activated validated runtime index; previous index retained at ${atomBackupDir}`);
        } catch (error) {
          job.last_error = error instanceof Error ? error.message : String(error);
          append(job, `[managed-rebuild] candidate not activated: ${job.last_error}`);
          resolve(2);
          return;
        }
      }
      resolve(job.stop_requested ? 130 : code ?? -1);
    });
  });
}

export function getManagedJob(): ManagedJob {
  return { ...shared.__ragV3ManagedJob!, log_tail: [...shared.__ragV3ManagedJob!.log_tail] };
}

async function verifyCompletedStages(stages: Array<Exclude<ArtifactKind, "siglip">>): Promise<string[]> {
  const audit = await getArtifactStatuses();
  return stages.flatMap((stage) => {
    const artifact = audit.artifacts.find((item) => item.kind === stage);
    return !artifact || artifact.status !== "ready"
      ? [`${stage}: ${artifact?.status ?? "missing"}${artifact?.reason ? ` (${artifact.reason})` : ""}`]
      : [];
  });
}

async function captureEffectiveCatalogue() {
  return withCatalogueFileLock(async () => {
    const [library, registry, tombstonesRaw, libraryRaw] = await Promise.all([
      readGenesisLibrary(), readExcludedRegistry(),
      fs.readFile(path.join(DATA_ROOT, "library", "catalogue-deleted.json"), "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "[]" : Promise.reject(error)),
      fs.readFile(path.join(DATA_ROOT, "library", "parameters.json")),
    ]);
    const tombstonePayload = JSON.parse(tombstonesRaw) as unknown;
    const tombstones = new Set<string>(Array.isArray(tombstonePayload)
      ? tombstonePayload.filter((name): name is string => typeof name === "string")
      : tombstonePayload && typeof tombstonePayload === "object" && Array.isArray((tombstonePayload as { technical_names?: unknown }).technical_names)
        ? (tombstonePayload as { technical_names: unknown[] }).technical_names.filter((name): name is string => typeof name === "string") : []);
    const excluded = new Map(registry.entries.map((entry) => [entry.technical_name, entry.reason]));
    const effective = library.filter((row) => {
      const name = String(row.technical_name ?? "");
      return name && !excluded.has(name) && !tombstones.has(name);
    }).sort((left, right) => String(left.technical_name).localeCompare(String(right.technical_name)))
      .map((row) => ({ ...row, source: "library" }));
    const librarySha256 = createHash("sha256").update(libraryRaw).digest("hex");
    const tombstonesSha256 = createHash("sha256").update(tombstonesRaw).digest("hex");
    const registrySha256 = excludedRegistrySha(registry);
    const revision = createHash("sha256").update(`${librarySha256}\0${tombstonesSha256}\0${registrySha256}`).digest("hex");
    const contentSha256 = createHash("sha256").update(Buffer.concat([libraryRaw, Buffer.from([0]), Buffer.from(tombstonesRaw)])).digest("hex");
    return {
      parameters: effective,
      revision,
      librarySha256,
      tombstonesSha256,
      registrySha256,
      contentSha256,
      excludedCount: registry.entries.length,
      libraryCount: library.length,
      excludedLive: library.filter((row) => excluded.has(String(row.technical_name))).map((row) => ({ technical_name: row.technical_name, reason: excluded.get(String(row.technical_name)) ?? "excluded" })),
      tombstonedLive: library.filter((row) => tombstones.has(String(row.technical_name))).map((row) => String(row.technical_name)),
    };
  });
}

export async function getBuildPreflight() {
  const source = await captureEffectiveCatalogue();
  const settings = await loadEmbeddingRuntimeSettings();
  const qwenModel = await getConfiguredTextIndexModel("qwen3");
  const endpoint = new URL(settings.baseUrl);
  const localEndpoint = ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
  const modelSlotBusy = Boolean(getEmbeddingModelSlot());
  let modelInstalled = false;
  let modelCheckError: string | null = null;
  if (localEndpoint) {
    try {
      const response = await fetch(`${settings.baseUrl}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!response.ok) modelCheckError = `Ollama model list returned HTTP ${response.status}`;
      else {
        const tags = await response.json() as { models?: Array<{ name?: string; model?: string }> };
        modelInstalled = (tags.models ?? []).some((item) => item.name === qwenModel || item.model === qwenModel);
      }
    } catch (error) { modelCheckError = error instanceof Error ? error.message : String(error); }
  }
  const outputDirectory = path.join(DATA_ROOT, "maintenance");
  let outputWritable = false;
  try { await fs.access(outputDirectory, 2); outputWritable = true; } catch { outputWritable = false; }
  const builderInputs = [
    path.join(process.cwd(), "python_engine", "prepare-combinatorial-corpus.py"),
    path.join(process.cwd(), "python_engine", "freeze-combinatorial-dataset.py"),
    path.join(process.cwd(), "python_engine", "build-combinatorial-runtime-index.py"),
    path.join(process.cwd(), "python_engine", "build-genesis-v3-composite-index.py"),
    path.join(process.cwd(), "python_engine", "anchoring_v3", "build_anchors.py"),
    path.join(process.cwd(), "python_engine", "anchoring_v3", "build_value_anchors.py"),
    path.join(process.cwd(), "python_engine", "anchoring_v3", "build_relation_anchors.py"),
    path.join(V3_ROOT, "anchoring", "axes.json"),
    path.join(V3_ROOT, "anchoring", "polarity_matrix.json"),
    path.join(V3_ROOT, "anchoring", "calibration", "strong_set.json"),
    path.join(V3_ROOT, "anchoring", "calibration", "neutral_set.json"),
  ];
  const missingDependencies: string[] = [];
  for (const inputPath of builderInputs) if (!(await existsPath(inputPath))) missingDependencies.push(path.relative(process.cwd(), inputPath));
  const latest = await readJson(path.join(DATA_ROOT, "datasets", "latest.json"));
  const activeManifest = latest?.version_id ? await readJson(path.join(DATA_ROOT, "datasets", String(latest.version_id), "manifest.json")) : null;
  const activeCorpusCurrent = activeCorpusBlockReason(activeManifest, { revision: source.revision, parameter_count: source.parameters.length }) === null;
  const candidateRecords = await listCorpusCandidates();
  let currentCandidate: Record<string, unknown> | null = null;
  for (const candidate of candidateRecords) {
    if (candidate.source_revision !== source.revision) continue;
    if (candidate.model !== qwenModel || candidate.endpoint !== settings.baseUrl) continue;
    const wrapped = typeof candidate.candidate_path === "string" ? { root: candidate.candidate_path, record: candidate } : null;
    if (!wrapped) continue;
    try {
      await validateQwenCandidateBundle(wrapped, source);
      currentCandidate = candidate;
      break;
    } catch { /* A stale or incomplete candidate must not be offered for activation. */ }
  }
  const decision = serviceBayPreflightDecision({
    liveCount: source.parameters.length, localEndpoint, modelInstalled, outputWritable,
    missingDependencies,
    availableMemoryBytes: freemem(),
    jobRunning: getManagedJob().running, modelSlotBusy,
    candidateBundleCurrent: Boolean(currentCandidate),
    candidateRowsReady: candidateRecords.some((candidate) => {
      if (candidate.source_revision !== source.revision || candidate.source_snapshot_sha256 !== source.contentSha256
        || candidate.model !== qwenModel || candidate.endpoint !== settings.baseUrl
        || candidate.status === "active" || candidate.status === "ready_to_connect") return false;
      const builds = candidate.artifact_builds as Record<string, unknown> | undefined;
      return ["composite", "anchors", "range", "select", "relations"].every((kind) => builds?.[kind] === "complete")
        && (builds?.atoms === "complete" || (builds?.atoms === "vectorization_complete" && candidate.vectorization_status === "complete"));
    }),
  });
  return {
    checked_at: new Date().toISOString(), source: {
      kind: "effective-live-catalogue", revision: source.revision, content_sha256: source.contentSha256,
      parameter_count: source.parameters.length, tombstoned_live_count: source.tombstonedLive.length,
      excluded_live_count: source.excludedLive.length, excluded_sha256: source.registrySha256,
    },
    model: { endpoint: settings.baseUrl, model: qwenModel, local_endpoint: localEndpoint, installed: modelInstalled, check_error: modelCheckError },
    output_directory: outputDirectory, output_writable: outputWritable,
    builder_dependencies: { ready: missingDependencies.length === 0, missing: missingDependencies },
    available_memory_bytes: freemem(), minimum_memory_bytes: 2 * 1024 * 1024 * 1024,
    active_corpus_current: activeCorpusCurrent, active_corpus_version: String(latest?.version_id ?? ""),
    qwen_candidate: currentCandidate ? {
      version_id: currentCandidate.version_id,
      status: currentCandidate.status,
      bundle_status: currentCandidate.qwen_bundle_status,
      source_revision: currentCandidate.source_revision,
      source_snapshot_sha256: source.contentSha256,
      model: currentCandidate.model,
    } : null,
    legacy_routes: "disabled", ...decision,
  };
}

async function runLoggedCommand(args: string[], env: NodeJS.ProcessEnv, job: ManagedJob): Promise<number> {
  append(job, `[managed-rebuild] $ python ${args.slice(1).join(" ")}`);
  return new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: process.cwd(), env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    shared.__ragV3ManagedChild = child;
    child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => append(job, String(chunk)));
    child.stderr?.on("data", (chunk) => append(job, String(chunk)));
    child.on("error", (error) => { job.last_error = error.message; resolve(-1); });
    child.on("close", (code) => resolve(job.stop_requested ? 130 : code ?? -1));
  });
}

export async function buildQwenCandidateArtifacts(input: {
  candidateRoot: string; snapshotPath: string; source: Awaited<ReturnType<typeof captureEffectiveCatalogue>>;
  versionId: string; model: string; endpoint: string; env: NodeJS.ProcessEnv; job: ManagedJob;
  dataRoot?: string;
  finalizeOnly?: boolean;
  onlyArtifact?: Exclude<QwenCandidateArtifactKind, "atoms">;
  runStage?: (name: string, args: string[], env: NodeJS.ProcessEnv, job: ManagedJob) => Promise<number>;
  captureCurrent?: () => Promise<Awaited<ReturnType<typeof captureEffectiveCatalogue>>>;
}): Promise<string> {
  const valueSelectionBundleId = path.basename(path.resolve(input.candidateRoot));
  const bundleRoot = path.join(input.candidateRoot, "artifacts", "qwen3");
  const compositeDir = path.join(bundleRoot, "composite-index");
  const anchorsDir = path.join(bundleRoot, "anchors");
  const valueDir = path.join(bundleRoot, "value-anchors");
  const relationsDir = path.join(bundleRoot, "relations");
  await fs.mkdir(anchorsDir, { recursive: true });
  const pinned = ["--parameter-snapshot", input.snapshotPath, "--source-revision", input.source.revision,
    "--source-snapshot-sha256", input.source.contentSha256, "--excluded-sha256", input.source.registrySha256,
    "--excluded-count", String(input.source.excludedCount)];
  const reusableCompositeDir = await findReusableCompositeDir(input.candidateRoot, input.source, input.model, input.dataRoot ?? DATA_ROOT);
  const stages: Array<{ name: "composite" | "anchors" | "value-anchors" | "relations"; artifact: Exclude<QwenCandidateArtifactKind, "atoms">; args: string[] }> = [
    { name: "composite", artifact: "composite", args: ["-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", input.endpoint,
      "--model", input.model, "--output-dir", compositeDir, "--batch-size", "16", "--value-selection-bundle-id", valueSelectionBundleId, ...(reusableCompositeDir ? ["--reuse-index-dir", reusableCompositeDir] : []), ...pinned] },
    { name: "anchors", artifact: "anchors", args: ["-u", "python_engine/anchoring_v3/build_anchors.py", "--endpoint", input.endpoint,
      "--model", input.model, "--dataset", input.snapshotPath,
      "--axes", path.join(input.candidateRoot, "prepared", "qwen3", "anchors", "axes.json"),
      "--polarity", path.join(input.candidateRoot, "prepared", "qwen3", "anchors", "polarity_matrix.json"),
      "--strong", path.join(input.candidateRoot, "prepared", "qwen3", "anchors", "calibration", "strong_set.json"),
      "--neutral", path.join(input.candidateRoot, "prepared", "qwen3", "anchors", "calibration", "neutral_set.json"),
      "--out", path.join(anchorsDir, "anchors_build.json"),
      "--param-rows", path.join(compositeDir, "rows.json"),
      "--param-embeddings", path.join(compositeDir, "embeddings.f32"), ...pinned] },
    { name: "value-anchors", artifact: "range", args: ["-u", "python_engine/anchoring_v3/build_value_anchors.py", "--dataset", input.snapshotPath,
      "--output", valueDir, "--composite-dir", compositeDir, "--endpoint", input.endpoint,
      "--model", input.model, "--target", "all", "--direct", "--value-selection-bundle-id", valueSelectionBundleId, ...pinned] },
    { name: "relations", artifact: "relations", args: ["-u", "python_engine/anchoring_v3/build_relation_anchors.py", "--dataset", input.snapshotPath,
      "--output", relationsDir, "--endpoint", input.endpoint, "--model", input.model,
      "--value-selection-bundle-id", valueSelectionBundleId, ...pinned] },
  ];
  const runStage = input.runStage ?? ((_name, args, env, job) => runLoggedCommand(args, env, job));
  const captureCurrent = input.captureCurrent ?? captureEffectiveCatalogue;
  const selectedStages = input.onlyArtifact
    ? stages.filter((stage) => stage.artifact === input.onlyArtifact || (input.onlyArtifact === "select" && stage.name === "value-anchors"))
    : stages;
  if (input.onlyArtifact === "range" || input.onlyArtifact === "select") {
    const valueStage = selectedStages.find((stage) => stage.name === "value-anchors");
    if (valueStage) valueStage.args[valueStage.args.indexOf("--target") + 1] = input.onlyArtifact;
  }
  for (const stage of input.finalizeOnly ? [] : selectedStages) {
    if (input.job.stop_requested) throw new Error(`Candidate bundle cancelled before ${stage.name}; active artifacts remain unchanged.`);
    input.job.stage = stage.name;
    append(input.job, `[managed-rebuild] building inactive Qwen candidate artifact ${stage.name}`);
    const code = await runStage(stage.name, stage.args, input.env, input.job);
    if (code !== 0) throw new Error(`Qwen candidate artifact ${stage.name} exited ${code}; active artifacts remain unchanged.`);
    if ((await captureCurrent()).revision !== input.source.revision) {
      throw new Error(`Catalogue changed during candidate ${stage.name}; candidate remains tied to ${input.source.revision} and cannot be activated.`);
    }
  }

  if (input.onlyArtifact) {
    const current = await captureCurrent();
    if (current.revision !== input.source.revision) throw new Error("Catalogue changed while building this candidate artifact; it remains pinned to the captured snapshot.");
    return path.relative(input.dataRoot ?? DATA_ROOT, bundleRoot).split(path.sep).join("/");
  }

  if (input.finalizeOnly === false) return path.relative(input.dataRoot ?? DATA_ROOT, bundleRoot).split(path.sep).join("/");

  const required = [
    path.join(compositeDir, "manifest.json"), path.join(compositeDir, "rows.json"), path.join(compositeDir, "embeddings.f32"),
    path.join(anchorsDir, "anchors_build.json"), path.join(valueDir, "manifest.json"),
    path.join(valueDir, "select-options.json"), path.join(relationsDir, "manifest.json"), path.join(relationsDir, "embeddings.f32"),
  ];
  const [composite, range, select, relations, anchors] = await Promise.all([
    readJson(required[0]), readJson(required[4]), readJson(required[5]), readJson(required[6]), readJson(required[3]),
  ]);
  const sourceManifests = [composite, range, select, relations];
  if (sourceManifests.some((manifest) => !manifest || manifest.source_revision !== input.source.revision
      || manifest.source_snapshot_sha256 !== input.source.contentSha256
      || manifest.excluded_sha256 !== input.source.registrySha256
      || Number(manifest.source_parameter_count) !== input.source.parameters.length)
    || sourceManifests.some((manifest) => manifest?.value_selection_bundle_id !== valueSelectionBundleId)
    || Number(range?.selection_contract_version) !== 2 || Number(select?.selection_contract_version) !== 2
    || Number(range?.candidate_text_version) !== 2 || Number(select?.candidate_text_version) !== 2
    || String(composite?.dataset_version ?? "") !== input.source.revision
    || !anchors || !anchors.a_home || Object.keys(anchors.a_home as object).length !== input.source.parameters.length) {
    throw new Error("Qwen candidate artifact manifests do not agree on the pinned source snapshot or expected parameter coverage.");
  }

  const files: Array<{ path: string; sha256: string; bytes: number }> = [];
  async function collect(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(filePath);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(filePath);
        files.push({ path: path.relative(bundleRoot, filePath).split(path.sep).join("/"), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
      } else throw new Error(`Unexpected non-file in candidate artifact bundle: ${filePath}`);
    }
  }
  await collect(bundleRoot);
  await fs.writeFile(path.join(bundleRoot, "bundle-manifest.json"), `${JSON.stringify({
    schema_version: 1, status: "complete", encoder: "qwen3", dataset_version: input.versionId,
    source_revision: input.source.revision, source_snapshot_sha256: input.source.contentSha256,
    excluded_sha256: input.source.registrySha256, source_parameter_count: input.source.parameters.length,
    model: input.model, dimensions: Number(composite?.dimensions), value_selection_contract_version: 2,
    candidate_text_version: 2, artifacts: ["composite", "anchors", "range", "select", "relations", "runtime_atoms"], files,
    created_at: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  return path.relative(input.dataRoot ?? DATA_ROOT, bundleRoot).split(path.sep).join("/");
}

async function loadPinnedCandidate(candidateId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(candidateId)) throw new Error("Invalid candidate identifier.");
  const maintenanceRoot = path.resolve(DATA_ROOT, "maintenance");
  const candidateRoot = path.resolve(maintenanceRoot, candidateId);
  if (!candidateRoot.startsWith(maintenanceRoot + path.sep)) throw new Error("Candidate path escapes maintenance storage.");
  const snapshotPath = path.join(candidateRoot, "effective-live-snapshot.json");
  const sourceStatus = await readJson(path.join(candidateRoot, "source-status.json"));
  if (!sourceStatus) throw new Error("Candidate has no captured source-status receipt.");
  const snapshotBytes = await fs.readFile(snapshotPath);
  const inputSha = createHash("sha256").update(snapshotBytes).digest("hex");
  if (inputSha !== sourceStatus.input_sha256) throw new Error("Candidate snapshot checksum does not match its capture receipt.");
  const parameters = JSON.parse(snapshotBytes.toString("utf8")) as Array<Record<string, unknown>>;
  if (!Array.isArray(parameters) || parameters.length !== Number(sourceStatus.effective_record_count)) throw new Error("Candidate snapshot count does not match its capture receipt.");
  const source = {
    parameters, revision: String(sourceStatus.source_revision ?? ""),
    librarySha256: String(sourceStatus.library_sha256 ?? ""), tombstonesSha256: String(sourceStatus.tombstones_sha256 ?? ""),
    registrySha256: String(sourceStatus.excluded_registry_sha256 ?? ""), contentSha256: String(sourceStatus.source_snapshot_sha256 ?? ""),
    excludedCount: Array.isArray(sourceStatus.excluded_live) ? sourceStatus.excluded_live.length : 0,
    libraryCount: Number(sourceStatus.library_record_count ?? parameters.length),
    excludedLive: Array.isArray(sourceStatus.excluded_live) ? sourceStatus.excluded_live : [],
    tombstonedLive: Array.isArray(sourceStatus.tombstoned_live) ? sourceStatus.tombstoned_live : [],
  } as Awaited<ReturnType<typeof captureEffectiveCatalogue>>;
  if (!source.revision || !source.registrySha256 || !source.contentSha256) throw new Error("Candidate receipt is missing pinned source fingerprints.");
  return { candidateRoot, snapshotPath, inputSha, source };
}

export async function getPreparedCandidateRowInputs(candidateId: string) {
  const pinned = await loadPinnedCandidate(candidateId);
  const record = await readJson(path.join(pinned.candidateRoot, "candidate.json"));
  if (!record || record.prepare_status !== "complete" || record.status === "ready_to_connect" || record.status === "active") {
    throw new Error("The selected workset is not an editable prepared candidate.");
  }
  await verifyPreparedCandidate(path.join(pinned.candidateRoot, "prepared"), pinned.inputSha);
  const current = await captureEffectiveCatalogue();
  if (current.revision !== pinned.source.revision || current.contentSha256 !== pinned.source.contentSha256) {
    throw new Error("Prepared source is stale; run model-free Prepare for the current catalogue before building this row.");
  }
  const preparedRoot = path.join(pinned.candidateRoot, "prepared");
  for (const name of ["clap-input.json", "siglip-input.json"]) {
    const receipt = await readJson(path.join(preparedRoot, name));
    if (!receipt || receipt.source_revision !== pinned.source.revision
      || receipt.source_snapshot_sha256 !== pinned.source.contentSha256 || !Array.isArray(receipt.rows)) {
      throw new Error(`Prepared row input is missing or belongs to another source snapshot: ${name}`);
    }
  }
  return {
    candidateId, sourceRevision: pinned.source.revision,
    sourceSnapshotSha256: pinned.source.contentSha256,
    excludedSha256: pinned.source.registrySha256,
    excludedCount: pinned.source.excludedCount,
    snapshotPath: pinned.snapshotPath,
    clapInputPath: path.join(preparedRoot, "clap-input.json"),
    siglipInputPath: path.join(preparedRoot, "siglip-input.json"),
  };
}

async function verifyPreparedCandidate(prepared: string, inputSha: string): Promise<void> {
  const manifest = await readJson(path.join(prepared, "prepare-manifest.json"));
  if (!manifest || manifest.status !== "prepared" || manifest.source_sha256 !== inputSha || !Array.isArray(manifest.outputs)) {
    throw new Error("Candidate Prepare is not complete for its pinned snapshot.");
  }
  for (const entry of manifest.outputs as Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }>) {
    if (typeof entry.path !== "string" || !Number.isInteger(entry.bytes) || typeof entry.sha256 !== "string") throw new Error("Prepared-input manifest contains a malformed entry.");
    const root = path.resolve(prepared);
    const filePath = path.resolve(root, entry.path);
    if (!filePath.startsWith(root + path.sep)) throw new Error("Prepared-input manifest path escapes its candidate directory.");
    const bytes = await fs.readFile(filePath);
    if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Prepared input checksum failed: " + entry.path);
    JSON.parse(bytes.toString("utf8"));
  }
}

async function prepareGemmaInputs(
  candidateRoot: string, snapshotPath: string, source: Awaited<ReturnType<typeof captureEffectiveCatalogue>>,
  inputSha: string, frozenVersion: string, settings: Awaited<ReturnType<typeof loadEmbeddingRuntimeSettings>>,
): Promise<{ files: string[]; reused: string[] }> {
  const prepared = path.join(candidateRoot, "prepared");
  const preparedManifestPath = path.join(prepared, "prepare-manifest.json");
  const previousManifest = await readJson(preparedManifestPath);
  const previousOutputs = new Map<string, string>((previousManifest?.outputs as Array<{ path?: unknown; sha256?: unknown }> ?? [])
    .filter((entry) => typeof entry.path === "string" && typeof entry.sha256 === "string")
    .map((entry) => [String(entry.path), String(entry.sha256)]));
  const gemmaModel = await getConfiguredTextIndexModel("embeddinggemma2");
  const sharedArgs = ["--parameter-snapshot", snapshotPath, "--source-revision", source.revision,
    "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256,
    "--excluded-count", String(source.excludedCount)];
  const configRoot = path.join(prepared, "qwen3", "anchors");
  const run = async (args: string[], reason: string) => {
    const code = await runLoggedCommand(["-u", ...args], embeddingProcessEnv(settings), getManagedJob());
    if (code !== 0) throw new Error(reason + ` (exit ${code})`);
  };
  const textOutput = path.join(prepared, "gemma2", "text-index");
  await run(["python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl,
    "--model", gemmaModel, "--output-dir", textOutput, "--retrieval-text-only", "--prepare-only", ...sharedArgs],
  "Gemma text row preparation failed");
  const atomOutput = path.join(prepared, "shared", "runtime-atoms");
  await run(["python_engine/build-combinatorial-runtime-index.py", "--data-root", DATA_ROOT,
    "--model", "model-independent-row-plan", "--output-dir", atomOutput,
    "--version-id", frozenVersion, "--version-dir", path.join(candidateRoot, "frozen", frozenVersion),
    "--effective-snapshot", snapshotPath, "--source-revision", source.revision,
    "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256, "--prepare-only"],
  "Model-free runtime atom row preparation failed");
  const anchorOut = path.join(prepared, "gemma2", "anchors", "anchors_build.json");
  await run(["python_engine/anchoring_v3/build_anchors.py", "--model", gemmaModel,
    "--parameter-snapshot", snapshotPath, "--source-revision", source.revision,
    "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256,
    "--excluded-count", String(source.excludedCount), "--axes", path.join(configRoot, "axes.json"),
    "--polarity", path.join(configRoot, "polarity_matrix.json"),
    "--strong", path.join(configRoot, "calibration", "strong_set.json"),
    "--neutral", path.join(configRoot, "calibration", "neutral_set.json"), "--out", anchorOut, "--prepare-only"],
  "Gemma anchor input validation failed");
  const valueOutput = path.join(prepared, "shared", "value-anchors");
  await run(["python_engine/anchoring_v3/build_value_anchors.py", "--model", "model-independent-row-plan",
    "--output", valueOutput, "--target", "all", "--direct", "--parameter-snapshot", snapshotPath,
    "--source-revision", source.revision, "--source-snapshot-sha256", source.contentSha256,
    "--excluded-sha256", source.registrySha256, "--excluded-count", String(source.excludedCount), "--prepare-only"],
  "Model-free Gemma Range/Select row preparation failed");
  const relationOutput = path.join(prepared, "shared", "relations");
  await run(["python_engine/anchoring_v3/build_relation_anchors.py", "--model", "model-independent-row-plan",
    "--output", relationOutput, ...sharedArgs, "--prepare-only"],
  "Model-free Gemma relation input preparation failed");

  const preparedManifest = await readJson(preparedManifestPath);
  if (!preparedManifest || preparedManifest.status !== "prepared" || preparedManifest.source_sha256 !== inputSha) {
    throw new Error("Pinned source preparation manifest is missing or stale before Gemma input registration.");
  }
  const outputs = new Map<string, { path: string; bytes: number; sha256: string }>();
  for (const item of (preparedManifest.outputs as Array<{ path: string; bytes: number; sha256: string }>)) outputs.set(item.path, item);
  const gemmaRoot = path.join(prepared, "gemma2");
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else {
        const bytes = await fs.readFile(file);
        JSON.parse(bytes.toString("utf8"));
        const relative = path.relative(prepared, file).split(path.sep).join("/");
        outputs.set(relative, { path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      }
    }
  };
  await walk(gemmaRoot);
  for (const relative of ["shared/runtime-atoms/atoms.json", "shared/runtime-atoms/prepare-manifest.json",
    "shared/value-anchors/range-rows.json", "shared/value-anchors/select-rows.json", "shared/value-anchors/prepare-manifest.json",
    "shared/relations/relations-rows.json", "shared/relations/prepare-manifest.json"]) {
    const file = path.join(prepared, relative);
    const bytes = await fs.readFile(file);
    JSON.parse(bytes.toString("utf8"));
    outputs.set(relative, { path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  await writeJsonAtomic(preparedManifestPath, { ...preparedManifest, outputs: [...outputs.values()].sort((a, b) => a.path.localeCompare(b.path)) });
  await verifyPreparedCandidate(prepared, inputSha);
  const files = [...outputs.keys()];
  const reused = files.filter((relative) => previousOutputs.get(relative) === outputs.get(relative)?.sha256);
  return { files, reused };
}

function candidateInputPath(file: string): string {
  const rooted = file === "effective-live-snapshot.json" || file.startsWith("artifacts/") || file.startsWith("frozen/") || file.startsWith("prepared/")
    ? file : `prepared/${file}`;
  return rooted
    .replace(/^artifacts\/qwen\//, "artifacts/qwen3/")
    .replace(/^prepared\/qwen\//, "prepared/qwen3/")
    .replace(/^artifacts\/gemma\//, "artifacts/embeddinggemma2/")
    .replace(/^prepared\/gemma\//, "prepared/gemma2/");
}

export function artifactDatasetVersionMatches(
  kind: ArtifactKind,
  manifest: Record<string, unknown>,
  qwenVersionId: string,
  gemmaVersionId: string,
  sourceRevision: string,
): boolean {
  if (kind === "composite" || kind === "embeddinggemma2_text") {
    return String(manifest.dataset_version ?? "") === sourceRevision;
  }
  if (kind === "atoms") return String(manifest.version_id ?? "") === qwenVersionId;
  if (kind === "gemma2_atoms") return !gemmaVersionId || String(manifest.version_id ?? "") === gemmaVersionId;
  return true;
}

async function prepareCorpusCandidate(job: ManagedJob, existingCandidateId?: string): Promise<void> {
  const settings = await loadEmbeddingRuntimeSettings();
  const model = await getConfiguredTextIndexModel("qwen3");
  let candidateRoot = "";
  let candidateId = "";
  let source: Awaited<ReturnType<typeof captureEffectiveCatalogue>>;
  let snapshotPath = "";
  let inputSha = "";
  let candidateToExtend: Record<string, unknown> | null = null;
  if (existingCandidateId) {
    ({ candidateRoot, snapshotPath, inputSha, source } = await loadPinnedCandidate(existingCandidateId));
    candidateId = existingCandidateId;
    append(job, "[managed-rebuild] checking saved candidate inputs without an embedding call: " + candidateId);
  } else {
    source = await captureEffectiveCatalogue();
    // Preparation is repeatable: reuse a candidate already prepared for this exact
    // snapshot/model/endpoint instead of creating another copy of its inputs.
    for (const candidate of await listCorpusCandidates()) {
      if (candidate.source_revision !== source.revision
        || candidate.source_snapshot_sha256 !== source.contentSha256
        || candidate.model !== model || candidate.endpoint !== settings.baseUrl
        || candidate.prepare_status !== "complete"
        || candidate.status === "ready_to_connect" || candidate.status === "active"
        || typeof candidate.candidate_id !== "string") continue;
      try {
        const pinned = await loadPinnedCandidate(candidate.candidate_id);
        await verifyPreparedCandidate(path.join(pinned.candidateRoot, "prepared"), pinned.inputSha);
        const rowsPath = path.join(pinned.candidateRoot, "artifacts", "qwen3", "composite-index", "rows.json");
        const plan = await readJson(path.join(path.dirname(rowsPath), "prepare-manifest.json"));
        const builtManifestPath = path.join(path.dirname(rowsPath), "manifest.json");
        const builtManifest = await readJson(builtManifestPath);
        const rows = await fs.readFile(rowsPath);
        const preparedRowsValid = Boolean(plan?.status === "prepared" && plan.source_revision === source.revision
          && plan.source_snapshot_sha256 === source.contentSha256
          && plan.rows_sha256 === createHash("sha256").update(rows).digest("hex"));
        const builtRowsValid = (candidate.artifact_builds as Record<string, unknown> | undefined)?.composite === "complete"
          && builtManifest?.source_revision === source.revision && builtManifest?.source_snapshot_sha256 === source.contentSha256
          && Number(builtManifest?.parameter_count) === source.parameters.length && builtManifest?.model === model
          && await artifactOutputFilesReady("composite", builtManifest, builtManifestPath);
        if (!preparedRowsValid && !builtRowsValid) continue;
        const preparedManifest = await readJson(path.join(pinned.candidateRoot, "prepared", "prepare-manifest.json"));
        const preparedPaths = new Set(Array.isArray(preparedManifest?.outputs)
          ? (preparedManifest.outputs as Array<{ path?: unknown }>).map((item) => String(item.path ?? "")) : []);
        const gemmaPlans = await Promise.all([
          readJson(path.join(pinned.candidateRoot, "prepared", "gemma2", "text-index", "prepare-manifest.json")),
          readJson(path.join(pinned.candidateRoot, "prepared", "shared", "runtime-atoms", "prepare-manifest.json")),
          readJson(path.join(pinned.candidateRoot, "prepared", "gemma2", "anchors", "prepare-manifest.json")),
          readJson(path.join(pinned.candidateRoot, "prepared", "shared", "value-anchors", "prepare-manifest.json")),
          readJson(path.join(pinned.candidateRoot, "prepared", "shared", "relations", "prepare-manifest.json")),
        ]);
        const gemmaPlansCurrent = gemmaPlans.every((entry) => entry?.status === "prepared"
          && entry?.source_revision === source.revision && entry?.source_snapshot_sha256 === source.contentSha256);
        candidateRoot = pinned.candidateRoot;
        candidateId = candidate.candidate_id;
        snapshotPath = pinned.snapshotPath;
        inputSha = pinned.inputSha;
        source = pinned.source;
        job.source_revision = source.revision;
        job.source_snapshot_path = snapshotPath;
        job.source_snapshot_sha256 = source.contentSha256;
        job.excluded_sha256 = source.registrySha256;
        job.excluded_count = source.excludedCount;
        job.candidate_version = candidateId;
        const requiredPreparedPaths = ["clap-input.json", "siglip-input.json", "qwen3/anchors/axes.json", "qwen3/anchors/polarity_matrix.json", "qwen3/anchors/calibration/strong_set.json", "qwen3/anchors/calibration/neutral_set.json", "gemma2/text-index/rows.json", "gemma2/text-index/prepare-manifest.json", "shared/runtime-atoms/atoms.json", "shared/runtime-atoms/prepare-manifest.json", "gemma2/anchors/prepare-manifest.json", "shared/value-anchors/range-rows.json", "shared/value-anchors/select-rows.json", "shared/value-anchors/prepare-manifest.json", "shared/relations/relations-rows.json", "shared/relations/prepare-manifest.json"];
        if (requiredPreparedPaths.every((file) => preparedPaths.has(file)) && gemmaPlansCurrent && typeof candidate.version_id === "string") {
          const existingRecord = await readJson(path.join(pinned.candidateRoot, "candidate.json"));
          if (existingRecord && Array.isArray(existingRecord.prepared_inputs)) {
            await writeJsonAtomic(path.join(pinned.candidateRoot, "candidate.json"), {
              ...existingRecord,
              prepared_input_dispositions: Object.fromEntries((existingRecord.prepared_inputs as string[]).map((file) => [candidateInputPath(file), "reused"])),
              last_prepare_disposition: "reused", last_prepared_at: new Date().toISOString(),
            });
          }
          append(job, `[managed-rebuild] Prepare reused verified files for ${candidateId}; same source fingerprint, no duplicate files created`);
          return;
        }
        append(job, `[managed-rebuild] Prepare is extending the existing incomplete workset ${candidateId} with model-free CLAP/SigLIP row inputs; no new candidate will be created`);
        candidateToExtend = candidate;
        break;
      } catch { /* An unreadable or incomplete candidate is not reusable. */ }
    }
    if (!candidateId) {
      candidateId = "corpus-candidate-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID();
      candidateRoot = path.join(DATA_ROOT, "maintenance", candidateId);
      snapshotPath = path.join(candidateRoot, "effective-live-snapshot.json");
      await fs.mkdir(candidateRoot, { recursive: false });
      await fs.writeFile(snapshotPath, JSON.stringify(source.parameters, null, 2) + "\n", "utf8");
      inputSha = createHash("sha256").update(await fs.readFile(snapshotPath)).digest("hex");
      await fs.writeFile(path.join(candidateRoot, "source-status.json"), JSON.stringify({
        schema_version: 1, captured_at: new Date().toISOString(), source_revision: source.revision,
        input_sha256: inputSha, source_snapshot_sha256: source.contentSha256,
        library_sha256: source.librarySha256, tombstones_sha256: source.tombstonesSha256,
        excluded_registry_sha256: source.registrySha256, library_record_count: source.libraryCount,
        effective_record_count: source.parameters.length, excluded_live: source.excludedLive,
        tombstoned_live: source.tombstonedLive,
      }, null, 2) + "\n", "utf8");
    }
  }
  if (!candidateRoot || !snapshotPath || !candidateId || !inputSha) throw new Error("Prepare could not resolve its candidate workset.");
  const prepared = path.join(candidateRoot, "prepared");
  if (candidateToExtend) {
    const rowInputsCode = await runLoggedCommand([
      "-u", "python_engine/prepare-search-row-inputs.py", "--snapshot", snapshotPath,
      "--output-dir", prepared, "--source-revision", source.revision,
      "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256,
      "--excluded-count", String(source.excludedCount),
    ], embeddingProcessEnv(settings), job);
    if (rowInputsCode !== 0) throw new Error("Model-free CLAP/SigLIP row-input preparation failed with exit " + rowInputsCode + ".");
    let frozenVersion = await resolveFrozenCandidateVersion(path.join(candidateRoot, "frozen"), source.revision, source.parameters.length).catch(() => null);
    const frozenVersionReused = Boolean(frozenVersion);
    if (!frozenVersion) {
      const freezeCode = await runLoggedCommand([
        "-u", "python_engine/freeze-combinatorial-dataset.py", "--source-dir", prepared,
        "--datasets-dir", path.join(candidateRoot, "frozen"), "--no-activate", "--candidate-inputs-only",
      ], embeddingProcessEnv(settings), job);
      if (freezeCode !== 0) throw new Error("Model-free frozen input preparation for the Runtime atoms row failed with exit " + freezeCode + ".");
      frozenVersion = await resolveFrozenCandidateVersion(path.join(candidateRoot, "frozen"), source.revision, source.parameters.length);
    }
    const gemmaInputs = await prepareGemmaInputs(candidateRoot, snapshotPath, source, inputSha, frozenVersion, settings);
    await verifyPreparedCandidate(prepared, inputSha);
    const existingRecord = await readJson(path.join(candidateRoot, "candidate.json"));
    if (!existingRecord) throw new Error("Existing candidate metadata disappeared while extending its prepared inputs.");
    const preparedInputs = ["effective-live-snapshot.json", ...gemmaInputs.files.map(candidateInputPath), "artifacts/qwen3/composite-index/rows.json", `frozen/${frozenVersion}/manifest.json`, `frozen/${frozenVersion}/parameters.json`, `frozen/${frozenVersion}/atoms.json`];
    const reusedInputs = new Set([
      "effective-live-snapshot.json", "artifacts/qwen3/composite-index/rows.json",
      ...(frozenVersionReused ? [`frozen/${frozenVersion}/manifest.json`, `frozen/${frozenVersion}/parameters.json`, `frozen/${frozenVersion}/atoms.json`] : []),
    ]);
    const preparedInputPaths = preparedInputs.map(candidateInputPath);
    for (const file of gemmaInputs.reused) reusedInputs.add(candidateInputPath(file));
    await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), {
      ...existingRecord, version_id: frozenVersion, snapshot_file_sha256: inputSha,
      prepared_inputs: preparedInputs,
      prepared_input_dispositions: Object.fromEntries(preparedInputPaths.map((file, index) => [file, reusedInputs.has(preparedInputs[index]!) ? "reused" : "prepared"])),
      last_prepare_disposition: "extended", last_prepared_at: new Date().toISOString(),
    });
    append(job, `[managed-rebuild] Extended existing workset ${candidateId}; retained its artifact_builds and candidate outputs; no model call`);
    return;
  }
  await fs.writeFile(path.join(candidateRoot, "acceptance-plan.json"), JSON.stringify({
    schema_version: 2, source_revision: source.revision, source_snapshot_sha256: source.contentSha256,
    required: ["snapshot and prepared-input checksums", "runtime row/vector count and identity alignment", "fixed vector dimension", "manifest checksums", "candidate index load"],
    comparison_with_previous_corpus_or_index: false, automatic_activation: false,
  }, null, 2) + "\n", "utf8");
  job.source_revision = source.revision;
  job.source_snapshot_path = snapshotPath;
  job.source_snapshot_sha256 = source.contentSha256;
  job.excluded_sha256 = source.registrySha256;
  job.excluded_count = source.excludedCount;
  job.candidate_version = candidateId;
  job.safe_to_stop = true;
  job.stage = "prepare_candidate";
  append(job, "[managed-rebuild] Prepare: snapshot=" + source.parameters.length + ", revision=" + source.revision + "; no model call");
  const code = await runLoggedCommand([
    "-u", "python_engine/prepare-combinatorial-corpus.py", "--input", snapshotPath,
    "--output-dir", prepared, "--source-revision", source.revision, "--expected-input-sha256", inputSha, "--prepare-only",
  ], embeddingProcessEnv(settings), job);
  if (code !== 0) throw new Error(job.stop_requested ? "Prepare cancelled; active index is unchanged." : "Model-free Prepare exited " + code + ".");
  const rowInputsCode = await runLoggedCommand([
    "-u", "python_engine/prepare-search-row-inputs.py", "--snapshot", snapshotPath,
    "--output-dir", prepared, "--source-revision", source.revision,
    "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256,
    "--excluded-count", String(source.excludedCount),
  ], embeddingProcessEnv(settings), job);
  if (rowInputsCode !== 0) throw new Error("Model-free CLAP/SigLIP row-input preparation failed with exit " + rowInputsCode + ".");
  await verifyPreparedCandidate(prepared, inputSha);
  const compositeDir = path.join(candidateRoot, "artifacts", "qwen3", "composite-index");
  const compositePlanCode = await runLoggedCommand([
    "-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl,
    "--model", model, "--output-dir", compositeDir, "--prepare-only", "--parameter-snapshot", snapshotPath,
    "--source-revision", source.revision, "--source-snapshot-sha256", source.contentSha256,
    "--excluded-sha256", source.registrySha256, "--excluded-count", String(source.excludedCount),
  ], embeddingProcessEnv(settings), job);
  if (compositePlanCode !== 0) throw new Error("Model-free composite output planning exited " + compositePlanCode + ".");
  const [compositePlan, compositeRows] = await Promise.all([
    readJson(path.join(compositeDir, "prepare-manifest.json")), fs.readFile(path.join(compositeDir, "rows.json")),
  ]);
  if (!compositePlan || compositePlan.status !== "prepared" || compositePlan.source_revision !== source.revision
    || compositePlan.source_snapshot_sha256 !== source.contentSha256
    || compositePlan.rows_sha256 !== createHash("sha256").update(compositeRows).digest("hex")) {
    throw new Error("Pinned composite output plan failed read-back verification.");
  }
  let frozenVersion = await resolveFrozenCandidateVersion(path.join(candidateRoot, "frozen"), source.revision, source.parameters.length).catch(() => null);
  if (!frozenVersion) {
    job.stage = "prepare_candidate";
    append(job, "[managed-rebuild] preparing the immutable current-source package required by the Runtime atoms row; no model call and no latest.json update");
    const freezeCode = await runLoggedCommand([
      "-u", "python_engine/freeze-combinatorial-dataset.py", "--source-dir", prepared,
      "--datasets-dir", path.join(candidateRoot, "frozen"), "--no-activate", "--candidate-inputs-only",
    ], embeddingProcessEnv(settings), job);
    if (freezeCode !== 0) throw new Error("Model-free frozen input preparation for the Runtime atoms row failed with exit " + freezeCode + ".");
    frozenVersion = await resolveFrozenCandidateVersion(path.join(candidateRoot, "frozen"), source.revision, source.parameters.length);
  }
  const gemmaInputs = await prepareGemmaInputs(candidateRoot, snapshotPath, source, inputSha, frozenVersion, settings);
  const previousLatest = await readJson(path.join(DATA_ROOT, "datasets", "latest.json"));
  const preparedInputs = ["effective-live-snapshot.json", ...gemmaInputs.files.map(candidateInputPath), "artifacts/qwen3/composite-index/rows.json", `frozen/${frozenVersion}/manifest.json`, `frozen/${frozenVersion}/parameters.json`, `frozen/${frozenVersion}/atoms.json`];
  const record = {
    schema_version: 2, candidate_id: candidateId, candidate_path: candidateRoot,
    status: "prepared", prepare_status: "complete", vectorization_status: "not_started", finalization_status: "not_started",
    source_revision: source.revision, source_snapshot_sha256: source.contentSha256,
    source_record_count: source.parameters.length, version_id: frozenVersion, snapshot_file_sha256: inputSha,
    prepared_inputs: preparedInputs,
    prepared_input_dispositions: Object.fromEntries(preparedInputs.map((file) => [candidateInputPath(file), gemmaInputs.reused.includes(file.startsWith("prepared/") ? file.slice("prepared/".length) : file) ? "reused" : "prepared"])),
    last_prepare_disposition: "prepared", last_prepared_at: new Date().toISOString(),
    qwen_bundle_status: "incomplete", qwen_bundle_path: "maintenance/" + candidateId + "/artifacts/qwen3",
    runtime_atom_index_path: "maintenance/" + candidateId + "/artifacts/qwen3/runtime-atoms",
    previous_active_version: previousLatest?.version_id ?? null, model, endpoint: settings.baseUrl,
    gemma_model: await getConfiguredTextIndexModel("embeddinggemma2"), gemma_endpoint: settings.baseUrl,
    created_at: new Date().toISOString(),
  };
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), record);
  job.safe_to_stop = false;
  append(job, "[managed-rebuild] Prepare complete: " + candidateId + "; read-back checksums pass; Vectorize has not started");
}

async function vectorizeCorpusCandidate(candidateId: string, job: ManagedJob): Promise<void> {
  if (freemem() < 2 * 1024 * 1024 * 1024) throw new Error("Vectorization stopped before launch: less than 2 GiB RAM is available.");
  const found = await findCorpusCandidate(candidateId);
  if (!found) throw new Error("No prepared candidate found for " + candidateId + ".");
  const { candidateRoot, snapshotPath, inputSha, source } = await loadPinnedCandidate(candidateId);
  await verifyPreparedCandidate(path.join(candidateRoot, "prepared"), inputSha);
  const record = await readJson(path.join(candidateRoot, "candidate.json"));
  if (!record || record.status === "ready_to_connect") throw new Error("Candidate is not in a vectorizable state.");
  const settings = await loadEmbeddingRuntimeSettings();
  const endpoint = new URL(settings.baseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname)) throw new Error("Vectorization is restricted to the configured local Ollama endpoint.");
  const tagsResponse = await fetch(settings.baseUrl + "/api/tags", { cache: "no-store" });
  if (!tagsResponse.ok) throw new Error("Cannot verify local Ollama models: HTTP " + tagsResponse.status + ".");
  const tags = await tagsResponse.json() as { models?: Array<{ name?: string; model?: string }> };
  const model = String(record.model ?? await getConfiguredTextIndexModel("qwen3"));
  if (model !== await getConfiguredTextIndexModel("qwen3")) throw new Error("Configured Qwen3 model differs from the prepared candidate; prepare a new candidate rather than mixing model outputs.");
  if (!(tags.models ?? []).some((item) => item.name === model || item.model === model)) throw new Error("Configured Qwen3 model is not installed locally: " + model + "; no download was attempted.");
  const env = embeddingProcessEnv(settings);
  job.source_revision = source.revision;
  job.source_snapshot_path = snapshotPath;
  job.source_snapshot_sha256 = source.contentSha256;
  job.excluded_sha256 = source.registrySha256;
  job.candidate_version = candidateId;
  job.safe_to_stop = true;
  job.stage = "vectorize_candidate";
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), { ...record, status: "vectorizing", vectorization_status: "running", model, endpoint: settings.baseUrl });
  append(job, "[managed-rebuild] Vectorize: candidate=" + candidateId + "; model=" + model + "; pinned source=" + source.revision);
  let code = await runLoggedCommand([
    "-u", "python_engine/prepare-combinatorial-corpus.py", "--input", snapshotPath,
    "--output-dir", path.join(candidateRoot, "prepared"), "--expected-input-sha256", inputSha,
    "--source-revision", source.revision, "--model", model, "--endpoint", settings.baseUrl, "--vectorize-only",
  ], env, job);
  if (code !== 0) throw new Error(job.stop_requested ? "Vectorize cancelled; completed batches remain saved in this candidate." : "Prepared semantic vectorization exited " + code + "; completed batches remain saved in this candidate.");
  const frozenRoot = path.join(candidateRoot, "frozen");
  let versionId = await resolveFrozenCandidateVersion(frozenRoot, source.revision, source.parameters.length).catch(() => null);
  if (!versionId) {
    job.stage = "vectorize_candidate";
    code = await runLoggedCommand([
      "-u", "python_engine/freeze-combinatorial-dataset.py", "--source-dir", path.join(candidateRoot, "prepared"),
      "--datasets-dir", frozenRoot, "--no-activate",
    ], env, job);
    if (code !== 0) throw new Error("Immutable candidate freeze exited " + code + "; latest.json was not changed.");
    versionId = await resolveFrozenCandidateVersion(frozenRoot, source.revision, source.parameters.length);
  }
  const versionManifest = await readJson(path.join(frozenRoot, versionId, "manifest.json"));
  if (!versionManifest || versionManifest.source_revision !== source.revision || Number(versionManifest.parameter_count) !== source.parameters.length) throw new Error("Frozen candidate manifest does not match the pinned snapshot.");
  const datasetVersionDir = path.join(DATA_ROOT, "datasets", versionId);
  if (!(await existsPath(datasetVersionDir))) {
    const temporary = datasetVersionDir + ".candidate-" + randomUUID();
    await fs.cp(path.join(frozenRoot, versionId), temporary, { recursive: true, errorOnExist: true, force: false });
    await fs.rename(temporary, datasetVersionDir);
  } else {
    const existing = await readJson(path.join(datasetVersionDir, "manifest.json"));
    if (existing?.content_sha256 !== versionManifest.content_sha256) throw new Error("Immutable dataset version collision at " + datasetVersionDir + ".");
  }
  job.candidate_version = versionId;
  const candidateIndexDir = path.join(candidateRoot, "artifacts", "qwen3", "runtime-atoms");
  job.stage = "vectorize_candidate";
  code = await runLoggedCommand([
    "-u", "python_engine/build-combinatorial-runtime-index.py", "--version-id", versionId,
    "--version-dir", path.join(frozenRoot, versionId),
    "--model", model, "--endpoint", settings.baseUrl, "--output-dir", candidateIndexDir,
    "--effective-snapshot", snapshotPath, "--source-revision", source.revision,
    "--source-snapshot-sha256", inputSha, "--excluded-sha256", source.registrySha256,
    "--vectorize-only", "--adopt-existing-complete-vectors",
  ], env, job);
  if (code !== 0) throw new Error("Runtime atom vectorization exited " + code + "; saved candidate batches remain available and latest.json is unchanged.");
  const qwenBundlePath = await buildQwenCandidateArtifacts({
    candidateRoot, snapshotPath, source, versionId, model, endpoint: settings.baseUrl, env, job, finalizeOnly: false,
  });
  const progress = await readJson(path.join(candidateIndexDir, "vectorization-progress.json"));
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), {
    ...record, status: "vectorized", prepare_status: "complete", vectorization_status: "complete", finalization_status: "pending",
    candidate_id: candidateId, candidate_path: candidateRoot, version_id: versionId,
    source_revision: source.revision, source_snapshot_sha256: source.contentSha256, source_record_count: source.parameters.length,
    qwen_bundle_status: "vectorized", qwen_bundle_path: qwenBundlePath,
    runtime_atom_index_path: qwenBundlePath + "/runtime-atoms", model, endpoint: settings.baseUrl,
    runtime_atom_count: progress?.completed_count ?? null, runtime_atom_dimensions: progress?.dimensions ?? null,
    artifact_builds: { composite: "complete", atoms: "complete", anchors: "complete", range: "complete", select: "complete", relations: "complete" },
  });
  job.safe_to_stop = false;
  append(job, "[managed-rebuild] Vectorize complete: " + versionId + "; artifacts saved; Finalize remains separate");
}

async function finalizeCorpusCandidate(candidateId: string, job: ManagedJob): Promise<void> {
  const found = await findCorpusCandidate(candidateId);
  if (!found) throw new Error("No vectorized candidate found for " + candidateId + ".");
  const { candidateRoot, snapshotPath, inputSha, source } = await loadPinnedCandidate(candidateId);
  await verifyPreparedCandidate(path.join(candidateRoot, "prepared"), inputSha);
  const record = await readJson(path.join(candidateRoot, "candidate.json"));
  if (!record) throw new Error("Prepared candidate metadata is unavailable.");
  const artifactBuilds = record.artifact_builds as Record<string, unknown> | undefined;
  const requiredRows = ["composite", "atoms", "anchors", "range", "select", "relations"];
  const missingRows = requiredRows.filter((kind) => artifactBuilds?.[kind] !== "complete"
    && !(kind === "atoms" && artifactBuilds?.[kind] === "vectorization_complete" && record.vectorization_status === "complete"));
  if (missingRows.length || typeof record.version_id !== "string") {
    throw new Error("Finalize is validation-only. Build the missing artifact table row(s) first: " + (missingRows.length ? missingRows.join(", ") : "atoms") + ". No vectorization was started.");
  }
  const currentSource = await captureEffectiveCatalogue();
  if (currentSource.revision !== source.revision || currentSource.contentSha256 !== source.contentSha256) {
    throw new Error("Finalize rejected the stale candidate snapshot; prepare and build current-source artifact rows first. No model was called.");
  }
  const settings = await loadEmbeddingRuntimeSettings();
  const model = String(record.model ?? await getConfiguredTextIndexModel("qwen3"));
  const env = embeddingProcessEnv(settings);
  job.source_revision = source.revision;
  job.source_snapshot_path = snapshotPath;
  job.source_snapshot_sha256 = source.contentSha256;
  job.excluded_sha256 = source.registrySha256;
  job.candidate_version = record.version_id;
  job.safe_to_stop = false;
  job.stage = "finalize_candidate";
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), { ...record, status: "finalizing", finalization_status: "running" });
  const indexDir = path.join(candidateRoot, "artifacts", "qwen3", "runtime-atoms");
  const code = await runLoggedCommand(candidateRuntimeIndexFinalizeArgs({
    versionId: record.version_id,
    versionDir: path.join(candidateRoot, "frozen", record.version_id),
    model,
    endpoint: settings.baseUrl,
    outputDir: indexDir,
    snapshotPath,
    sourceRevision: source.revision,
    snapshotFileSha256: inputSha,
    excludedSha256: source.registrySha256,
  }), env, job);
  if (code !== 0) throw new Error("Runtime index finalization failed: exit " + code + "; saved vectors were not recomputed.");
  const qwenBundlePath = await buildQwenCandidateArtifacts({
    candidateRoot, snapshotPath, source, versionId: record.version_id, model, endpoint: settings.baseUrl, env, job, finalizeOnly: true,
  });
  const indexManifest = await readJson(path.join(indexDir, "manifest.json"));
  await loadRuntimeAtomIndexFromDirectory(indexDir, record.version_id);
  const [candidateRows, candidateVectors, snapshotBytes] = await Promise.all([
    fs.readFile(path.join(indexDir, "atoms.json")), fs.readFile(path.join(indexDir, "atom_embeddings.f32")), fs.readFile(snapshotPath),
  ]);
  if (!indexManifest || indexManifest.version_id !== record.version_id || indexManifest.effective_catalogue_revision !== source.revision
    || indexManifest.effective_snapshot_sha256 !== createHash("sha256").update(snapshotBytes).digest("hex")
    || indexManifest.rows_sha256 !== createHash("sha256").update(candidateRows).digest("hex")
    || indexManifest.vectors_sha256 !== createHash("sha256").update(candidateVectors).digest("hex")
    || candidateVectors.length !== 8 + Number(indexManifest.atom_count) * Number(indexManifest.dimensions) * 4) {
    throw new Error("Finalized runtime index failed pinned-snapshot, checksum, dimension, or row/vector-alignment validation.");
  }
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), {
    ...record, status: "ready_to_connect", finalization_status: "complete", qwen_bundle_status: "complete",
    qwen_bundle_path: qwenBundlePath, runtime_atom_index_path: qwenBundlePath + "/runtime-atoms",
    runtime_atom_count: indexManifest.atom_count, runtime_atom_dimensions: indexManifest.dimensions,
    rows_sha256: indexManifest.rows_sha256, vectors_sha256: indexManifest.vectors_sha256,
  });
  job.safe_to_stop = false;
  append(job, "[managed-rebuild] Finalize complete: checksums, row/vector alignment, dimensions, manifests, and artifact validation passed; explicit connection is available");
}

async function buildOneQwenCandidateArtifact(candidateId: string, kind: QwenCandidateArtifactKind, job: ManagedJob): Promise<void> {
  const found = await findCorpusCandidate(candidateId);
  if (!found) throw new Error("Prepared candidate not found: " + candidateId);
  const record = found.record;
  if (record.status === "ready_to_connect" || record.status === "active" || record.finalization_status === "complete") {
    throw new Error("Finalized candidate artifacts are immutable. Prepare a new working set before rebuilding one row.");
  }
  if (record.prepare_status !== "complete") throw new Error("Prepare source files before building this artifact.");
  const pinned = await loadPinnedCandidate(candidateId);
  await verifyPreparedCandidate(path.join(pinned.candidateRoot, "prepared"), pinned.inputSha);
  const current = await captureEffectiveCatalogue();
  if (current.revision !== pinned.source.revision || current.contentSha256 !== pinned.source.contentSha256) {
    throw new Error("Prepared snapshot is stale for the current catalogue; prepare current source files before building.");
  }
  const settings = await loadEmbeddingRuntimeSettings();
  const model = String(record.model ?? await getConfiguredTextIndexModel("qwen3"));
  if (model !== await getConfiguredTextIndexModel("qwen3") || String(record.endpoint ?? settings.baseUrl) !== settings.baseUrl) {
    throw new Error("Prepared candidate model/endpoint differs from current settings; prepare a matching workset.");
  }
  const endpoint = new URL(settings.baseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname)) throw new Error("Candidate row inference is restricted to the configured local Ollama endpoint.");
  if (freemem() < 2 * 1024 * 1024 * 1024) throw new Error("Candidate row build stopped before inference: less than 2 GiB RAM is available.");
  const tagsResponse = await fetch(settings.baseUrl + "/api/tags", { cache: "no-store" });
  if (!tagsResponse.ok) throw new Error("Cannot check local Ollama models: HTTP " + tagsResponse.status + ".");
  const tags = await tagsResponse.json() as { models?: Array<{ name?: string; model?: string }> };
  if (!(tags.models ?? []).some((entry) => entry.name === model || entry.model === model)) throw new Error("Configured Qwen model is not installed locally; no download was attempted.");
  const env = embeddingProcessEnv(settings);
  const versionId = typeof record.version_id === "string" ? record.version_id : null;
  const bundleRoot = path.join(pinned.candidateRoot, "artifacts", "qwen3");
  job.source_revision = pinned.source.revision;
  job.source_snapshot_path = pinned.snapshotPath;
  job.source_snapshot_sha256 = pinned.source.contentSha256;
  job.excluded_sha256 = pinned.source.registrySha256;
  job.candidate_version = candidateId;
  job.safe_to_stop = true;
  let outputPath: string;
  if (kind === "atoms") {
    const frozenVersion = versionId;
    const frozenRoot = path.join(pinned.candidateRoot, "frozen");
    if (!frozenVersion) throw new Error("Runtime atoms need the pinned current-source package. Run Prepare source files first; no package build or model was started.");
    outputPath = path.join(bundleRoot, "runtime-atoms");
    job.stage = "atoms";
    const code = await runLoggedCommand([
      "-u", "python_engine/build-combinatorial-runtime-index.py", "--version-id", frozenVersion,
      "--version-dir", path.join(frozenRoot, frozenVersion),
      "--model", model, "--endpoint", settings.baseUrl, "--output-dir", outputPath,
      "--effective-snapshot", pinned.snapshotPath, "--source-revision", pinned.source.revision,
      "--excluded-sha256", pinned.source.registrySha256, "--vectorize-only", "--adopt-existing-complete-vectors",
    ], env, job);
    if (code !== 0) throw new Error("Runtime atom row build failed; completed candidate batches remain in this candidate.");
    for (const file of ["atoms.json", "atom_embeddings.f32", "vectorization-progress.json"]) {
      const fullPath = path.join(outputPath, file);
      if (!(await existsPath(fullPath)) || (await fs.stat(fullPath)).size === 0) throw new Error("Runtime atom row output is incomplete: " + file);
    }
    await writeJsonAtomic(path.join(pinned.candidateRoot, "candidate.json"), {
      ...record, version_id: frozenVersion, runtime_atom_index_path: "maintenance/" + candidateId + "/artifacts/qwen3/runtime-atoms",
      runtime_atom_count: (await readJson(path.join(outputPath, "vectorization-progress.json")))?.completed_count ?? null,
      artifact_builds: { ...((record.artifact_builds as Record<string, unknown> | undefined) ?? {}), atoms: "complete" },
    });
    return;
  }
  const compositeDir = path.join(bundleRoot, "composite-index");
  if (["anchors", "range", "select"].includes(kind)
    && (!(await existsPath(path.join(compositeDir, "rows.json"))) || !(await existsPath(path.join(compositeDir, "embeddings.f32"))))) {
    throw new Error(kind + " requires the composite row and vector files. Build the composite row first.");
  }
  job.stage = kind;
  await buildQwenCandidateArtifacts({
    candidateRoot: pinned.candidateRoot, snapshotPath: pinned.snapshotPath, source: pinned.source,
    versionId: versionId ?? candidateId, model, endpoint: settings.baseUrl, env, job, onlyArtifact: kind,
  });
  outputPath = path.join(bundleRoot, kind === "range" || kind === "select" ? "value-anchors" : kind === "relations" ? "relations" : kind === "anchors" ? "anchors" : "composite-index");
  const requiredFiles = kind === "composite" ? ["manifest.json", "rows.json", "embeddings.f32"]
    : kind === "anchors" ? ["anchors_build.json"]
      : kind === "range" ? ["manifest.json", "embeddings.f32"]
        : kind === "select" ? ["select-options.json", "select-options.f32"]
          : ["manifest.json", "embeddings.f32"];
  for (const file of requiredFiles) {
    const fullPath = path.join(outputPath, file);
    if (!(await existsPath(fullPath)) || (await fs.stat(fullPath)).size === 0) throw new Error("Selected artifact output is incomplete: " + path.relative(pinned.candidateRoot, fullPath));
  }
  const artifactBuilds = { ...((record.artifact_builds as Record<string, unknown> | undefined) ?? {}), [kind]: "complete" };
  await writeJsonAtomic(path.join(pinned.candidateRoot, "candidate.json"), {
    ...record, artifact_builds: artifactBuilds, last_artifact: kind, last_artifact_path: path.relative(pinned.candidateRoot, outputPath).split(path.sep).join("/"),
  });
  append(job, "[managed-rebuild] Built only candidate artifact " + kind + "; no other bank or active runtime pointer was changed");
}

function gemmaPreparedInputs(kind: GemmaCandidateArtifactKind, candidateId: string, versionId: string | null): string[] {
  const shared = `maintenance/${candidateId}/prepared/`;
  const frozen = versionId ? [`maintenance/${candidateId}/frozen/${versionId}/manifest.json`, `maintenance/${candidateId}/frozen/${versionId}/parameters.json`, `maintenance/${candidateId}/frozen/${versionId}/atoms.json`] : [];
  if (kind === "embeddinggemma2_text") return [`${shared}gemma2/text-index/rows.json`, `${shared}gemma2/text-index/prepare-manifest.json`];
  if (kind === "gemma2_atoms") return [`${shared}shared/runtime-atoms/atoms.json`, `${shared}shared/runtime-atoms/prepare-manifest.json`, ...frozen];
  if (kind === "gemma2_anchors") return [
    `${shared}qwen3/anchors/axes.json`, `${shared}qwen3/anchors/polarity_matrix.json`,
    `${shared}qwen3/anchors/calibration/strong_set.json`, `${shared}qwen3/anchors/calibration/neutral_set.json`,
    `${shared}gemma2/anchors/prepare-manifest.json`,
  ];
  if (kind === "gemma2_range") return [`${shared}shared/value-anchors/range-rows.json`, `${shared}shared/value-anchors/prepare-manifest.json`];
  if (kind === "gemma2_select") return [`${shared}shared/value-anchors/select-rows.json`, `${shared}shared/value-anchors/prepare-manifest.json`];
  return [`${shared}shared/relations/relations-rows.json`, `${shared}shared/relations/prepare-manifest.json`];
}

async function fileSha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function candidateFileInventory(root: string, relativePaths: string[]): Promise<Array<{ path: string; bytes: number; sha256: string }>> {
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const relative of [...new Set(relativePaths)].sort()) {
    const fullPath = path.resolve(root, relative);
    if (!fullPath.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Artifact path escapes its candidate directory: " + relative);
    const bytes = await fs.readFile(fullPath);
    files.push({ path: relative.split(path.sep).join("/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return files;
}

async function candidateDirectoryFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (current: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && !entry.name.endsWith(".building") && !entry.name.endsWith(".tmp") && entry.name !== "vectorization-progress.json") found.push(path.relative(directory, fullPath));
    }
  };
  await visit(directory);
  return found;
}

export async function createGemmaBundleInventory(bundleRoot: string): Promise<Array<{ path: string; bytes: number; sha256: string }>> {
  const outputs = await candidateDirectoryFiles(bundleRoot);
  return candidateFileInventory(bundleRoot, outputs.filter((relative) => relative !== "bundle-manifest.json"));
}

async function buildOneGemmaCandidateArtifact(candidateId: string, kind: GemmaCandidateArtifactKind, job: ManagedJob): Promise<void> {
  const found = await findCorpusCandidate(candidateId);
  if (!found) throw new Error("Prepared Gemma workset not found: " + candidateId);
  const pinned = await loadPinnedCandidate(candidateId);
  const { candidateRoot, snapshotPath, inputSha, source } = pinned;
  await verifyPreparedCandidate(path.join(candidateRoot, "prepared"), inputSha);
  if (found.record.prepare_status !== "complete") throw new Error("Prepare source files before building Gemma artifacts.");
  if (["ready_to_connect", "active"].includes(String(found.record.gemma_finalization_status))) throw new Error("Finalized Gemma artifacts are immutable; prepare a new matching workset before rebuilding a row.");
  const currentSource = await captureEffectiveCatalogue();
  if (currentSource.revision !== source.revision || currentSource.contentSha256 !== source.contentSha256) throw new Error("Prepared Gemma snapshot is stale for the current catalogue; no model was called.");

  const settings = await loadEmbeddingRuntimeSettings();
  const model = await getConfiguredTextIndexModel("embeddinggemma2");
  const expectedModel = await readJson(path.join(candidateRoot, "prepared", "gemma2", "text-index", "prepare-manifest.json"));
  const anchorPlan = await readJson(path.join(candidateRoot, "prepared", "gemma2", "anchors", "prepare-manifest.json"));
  if (expectedModel?.model !== model || anchorPlan?.model !== model) throw new Error("Configured Gemma model differs from the model recorded by Prepare; prepare a matching source/model workset.");
  if (String(found.record.gemma_model ?? model) !== model || String(found.record.gemma_endpoint ?? settings.baseUrl) !== settings.baseUrl) {
    throw new Error("Gemma model or endpoint changed after preparation; this candidate cannot mix outputs from different settings.");
  }
  const endpoint = new URL(settings.baseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname)) throw new Error("Candidate Gemma inference is restricted to the configured local Ollama endpoint.");
  if (freemem() < 2 * 1024 * 1024 * 1024) throw new Error("Gemma artifact build stopped before inference: less than 2 GiB RAM is available.");
  const tagsResponse = await fetch(`${settings.baseUrl}/api/tags`, { cache: "no-store" });
  if (!tagsResponse.ok) throw new Error("Cannot check local Ollama models: HTTP " + tagsResponse.status + ".");
  const tags = await tagsResponse.json() as { models?: Array<{ name?: string; model?: string }> };
  if (!(tags.models ?? []).some((entry) => entry.name === model || entry.model === model)) throw new Error("Configured Gemma model is not installed locally; no download was attempted.");

  const outputRoot = path.join(candidateRoot, "artifacts", "embeddinggemma2");
  const outputDir = await ensureGemmaCandidateArtifactDirectory(candidateRoot, kind);
  const textDir = path.join(outputRoot, "text-index");
  const dependencies = kind === "gemma2_anchors" || kind === "gemma2_range" || kind === "gemma2_select" ? ["embeddinggemma2_text"] : [];
  for (const dependency of dependencies) {
    const state = (found.record.gemma_artifact_builds as Record<string, unknown> | undefined)?.[dependency];
    if (state !== "complete") throw new Error(`${kind} requires the Gemma ${dependency} row to finish first.`);
    const manifest = await readJson(path.join(textDir, "manifest.json"));
    if (!manifest || manifest.model !== model || manifest.source_revision !== source.revision || manifest.source_snapshot_sha256 !== source.contentSha256
      || !await artifactOutputFilesReady("embeddinggemma2_text", manifest, path.join(textDir, "manifest.json"))) throw new Error("Gemma text index dependency is incomplete or incompatible.");
  }

  const preparedInputs = gemmaPreparedInputs(kind, candidateId, typeof found.record.version_id === "string" ? found.record.version_id : null);
  if (kind === "gemma2_anchors" || kind === "gemma2_range" || kind === "gemma2_select") preparedInputs.push(path.relative(DATA_ROOT, path.join(textDir, "rows.json")), path.relative(DATA_ROOT, path.join(textDir, "embeddings.f32")));
  const inputRecords = await Promise.all(preparedInputs.map(async (relative) => {
    const fullPath = path.resolve(DATA_ROOT, relative);
    if (!fullPath.startsWith(`${path.resolve(candidateRoot)}${path.sep}`)) throw new Error("Gemma input is outside its pinned workset: " + relative);
    return { path: path.relative(candidateRoot, fullPath).split(path.sep).join("/"), sha256: await fileSha256(fullPath) };
  }));
  const settingsIdentity: Record<string, string | number | boolean> = kind === "embeddinggemma2_text"
    ? { retrieval_text_only: true, batch_size: 16 }
    : kind === "gemma2_atoms" ? { batch_size: 64, frozen_donor_fallback: false }
      : kind === "gemma2_anchors" ? { axis_schema: 1, uses_gemma_text_vectors: true }
        : kind === "gemma2_range" ? { target: "range", direct_embeddings: true, batch_size: 64 }
          : kind === "gemma2_select" ? { target: "select", direct_embeddings: true, batch_size: 64 }
            : { relation_count: 12 };
  const identity: GemmaBuildIdentity = {
    schema_version: 1, artifact_kind: kind, encoder: "embeddinggemma2", model, endpoint: settings.baseUrl, dimensions: 768,
    source_revision: source.revision, source_snapshot_content_sha256: source.contentSha256, snapshot_file_sha256: inputSha,
    inputs: inputRecords, settings: settingsIdentity,
  };
  const identitySha = gemmaBuildIdentitySha256(identity);
  const existingReceipt = (found.record.gemma_artifact_receipts as Record<string, Record<string, unknown>> | undefined)?.[kind];
  const existingBuilds = (found.record.gemma_artifact_builds as Record<string, unknown> | undefined) ?? {};
  if (existingBuilds[kind] === "complete" && existingReceipt?.identity_sha256 === identitySha && Array.isArray(existingReceipt.files)) {
    for (const file of existingReceipt.files as Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }>) {
      if (typeof file.path !== "string" || typeof file.sha256 !== "string" || !Number.isInteger(file.bytes)) throw new Error("Saved Gemma artifact receipt is malformed.");
      const raw = await fs.readFile(path.join(candidateRoot, file.path));
      if (raw.length !== file.bytes || createHash("sha256").update(raw).digest("hex") !== file.sha256) throw new Error(`Saved Gemma artifact is corrupt: ${file.path}`);
    }
    append(job, `[managed-rebuild] Reused verified Gemma ${kind} output; identity ${identitySha.slice(0, 12)}`);
    return;
  }
  if (existingBuilds[kind] === "complete" && existingReceipt?.identity_sha256 !== identitySha) {
    throw new Error(`Completed Gemma ${kind} output belongs to another input/model identity; prepare a new workset instead of overwriting it.`);
  }

  const jobStates = { ...((found.record.gemma_jobs as Record<string, unknown> | undefined) ?? {}), [kind]: { status: "running", started_at: new Date().toISOString(), model, endpoint: settings.baseUrl, identity_sha256: identitySha, error: null } };
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), { ...found.record, gemma_model: model, gemma_endpoint: settings.baseUrl, gemma_artifact_builds: { ...existingBuilds, [kind]: "running" }, gemma_jobs: jobStates });
  const env = embeddingProcessEnv(settings);
  job.source_revision = source.revision;
  job.source_snapshot_path = snapshotPath;
  job.source_snapshot_sha256 = source.contentSha256;
  job.excluded_sha256 = source.registrySha256;
  job.excluded_count = source.excludedCount;
  job.candidate_version = candidateId;
  job.safe_to_stop = true;
  job.stage = kind;
  await ensureOllamaModelAvailable(model);
  await prepareGpuForEmbeddingModel(model, 5_000, "embeddinggemma2-index-build");
  let args: string[];
  const pinnedArgs = ["--parameter-snapshot", snapshotPath, "--source-revision", source.revision, "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256, "--excluded-count", String(source.excludedCount)];
  const prepared = path.join(candidateRoot, "prepared");
  if (kind === "embeddinggemma2_text") {
    args = ["-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl, "--model", model, "--batch-size", "16", "--output-dir", outputDir, "--retrieval-text-only", "--prepared-rows", path.join(prepared, "gemma2/text-index/rows.json"), "--operation-identity-sha256", identitySha, "--value-selection-bundle-id", candidateId, ...pinnedArgs];
  } else if (kind === "gemma2_atoms") {
    const versionId = String(found.record.version_id ?? "");
    if (!versionId) throw new Error("Gemma runtime atoms need the pinned current-source package created by Prepare.");
    args = ["-u", "python_engine/build-combinatorial-runtime-index.py", "--version-id", versionId, "--version-dir", path.join(candidateRoot, "frozen", versionId), "--model", model, "--endpoint", settings.baseUrl, "--batch-size", "64", "--output-dir", outputDir, "--effective-snapshot", snapshotPath, "--source-revision", source.revision, "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256, "--prepared-rows", path.join(prepared, "shared/runtime-atoms/atoms.json"), "--operation-identity-sha256", identitySha, "--vectorize-only"];
  } else if (kind === "gemma2_anchors") {
    const anchorRoot = path.join(prepared, "qwen3/anchors");
    const textManifest = await readJson(path.join(textDir, "manifest.json"));
    args = ["-u", "python_engine/anchoring_v3/build_anchors.py", "--endpoint", settings.baseUrl, "--model", model,
      "--dataset", snapshotPath, "--axes", path.join(anchorRoot, "axes.json"), "--polarity", path.join(anchorRoot, "polarity_matrix.json"),
      "--strong", path.join(anchorRoot, "calibration/strong_set.json"), "--neutral", path.join(anchorRoot, "calibration/neutral_set.json"),
      "--out", path.join(outputDir, "anchors_build.json"), "--checkpoint-dir", path.join(outputRoot, "checkpoints/anchors"), "--operation-identity-sha256", identitySha,
      "--param-rows", path.join(textDir, String((textManifest?.files as Record<string, string> | undefined)?.rows ?? "rows.json")),
      "--param-embeddings", path.join(textDir, String((textManifest?.files as Record<string, string> | undefined)?.embeddings ?? "embeddings.f32")), ...pinnedArgs];
  } else if (kind === "gemma2_range" || kind === "gemma2_select") {
    args = ["-u", "python_engine/anchoring_v3/build_value_anchors.py", "--dataset", snapshotPath, "--output", outputDir,
      "--composite-dir", textDir, "--endpoint", settings.baseUrl, "--model", model, "--batch-size", "64", "--target", kind === "gemma2_range" ? "range" : "select",
      "--direct", "--prepared-rows-dir", path.join(prepared, "shared/value-anchors"), "--operation-identity-sha256", identitySha, "--value-selection-bundle-id", candidateId, ...pinnedArgs];
  } else {
    args = ["-u", "python_engine/anchoring_v3/build_relation_anchors.py", "--dataset", snapshotPath, "--output", outputDir,
      "--endpoint", settings.baseUrl, "--model", model, "--prepared-rows-file", path.join(prepared, "shared/relations/relations-rows.json"), "--operation-identity-sha256", identitySha, ...pinnedArgs];
  }
  const code = await runLoggedCommand(args, env, job);
  if (code !== 0) throw new Error(`Gemma ${kind} build exited ${code}; any compatible candidate checkpoint remains available for retry.`);
  if (kind === "gemma2_atoms") {
    const progress = await readJson(path.join(outputDir, "vectorization-progress.json"));
    if (!progress || progress.status !== "vectorization_complete" || Number(progress.completed_count) <= 0) throw new Error("Gemma runtime atom vectors are not complete; the checkpoint was retained.");
    const updatedBuilds = { ...((found.record.gemma_artifact_builds as Record<string, unknown> | undefined) ?? {}), [kind]: "vectorization_complete" };
    const updatedJobs = { ...((found.record.gemma_jobs as Record<string, unknown> | undefined) ?? {}), [kind]: { status: "vectorization_complete", finished_at: new Date().toISOString(), model, endpoint: settings.baseUrl, identity_sha256: identitySha, completed_count: progress.completed_count, dimensions: progress.dimensions, error: null } };
    const identities = { ...((found.record.gemma_artifact_identities as Record<string, unknown> | undefined) ?? {}), [kind]: identity };
    await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), { ...found.record, gemma_model: model, gemma_endpoint: settings.baseUrl, gemma_artifact_builds: updatedBuilds, gemma_artifact_identities: identities, gemma_jobs: updatedJobs });
    return;
  }
  const required = kind === "embeddinggemma2_text" ? ["manifest.json", "rows.json", "embeddings.f32"]
    : kind === "gemma2_anchors" ? ["anchors_build.json"]
      : kind === "gemma2_range" ? ["manifest.json", "embeddings.f32"]
        : kind === "gemma2_select" ? ["select-options.json", "select-options.f32"]
          : ["manifest.json", "embeddings.f32"];
  for (const file of required) if (!(await existsPath(path.join(outputDir, file))) || (await fs.stat(path.join(outputDir, file))).size === 0) throw new Error(`Gemma ${kind} output is incomplete: ${file}`);
  const manifestPath = kind === "gemma2_anchors" ? path.join(outputDir, "anchors_build.json")
    : kind === "gemma2_select" ? path.join(outputDir, "select-options.json") : path.join(outputDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  if (!manifest || manifest.model !== model || (manifest.source_revision && manifest.source_revision !== source.revision)
    || (manifest.source_snapshot_sha256 && manifest.source_snapshot_sha256 !== source.contentSha256)
    || (kind !== "gemma2_anchors" && Number(manifest.dimensions) !== 768)
    || (kind === "gemma2_anchors" && Number(manifest.dim) !== 768)) throw new Error(`Gemma ${kind} manifest does not match the pinned model, source, or 768-dimensional encoder.`);
  const produced = await candidateDirectoryFiles(outputDir);
  const files = await candidateFileInventory(candidateRoot, produced.map((file) => path.relative(candidateRoot, path.join(outputDir, file))));
  const receipt = { schema_version: 1, identity, identity_sha256: identitySha, output_directory: path.relative(candidateRoot, outputDir).split(path.sep).join("/"), files, manifest_file: path.relative(candidateRoot, manifestPath).split(path.sep).join("/") };
  const artifactBuilds = { ...((found.record.gemma_artifact_builds as Record<string, unknown> | undefined) ?? {}), [kind]: "complete" };
  const artifactReceipts = { ...((found.record.gemma_artifact_receipts as Record<string, unknown> | undefined) ?? {}), [kind]: receipt };
  const finalJobs = { ...((found.record.gemma_jobs as Record<string, unknown> | undefined) ?? {}), [kind]: { status: "complete", finished_at: new Date().toISOString(), model, endpoint: settings.baseUrl, identity_sha256: identitySha, output_count: files.length, error: null } };
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), { ...found.record, gemma_model: model, gemma_endpoint: settings.baseUrl, gemma_artifact_builds: artifactBuilds, gemma_artifact_receipts: artifactReceipts, gemma_jobs: finalJobs });
  append(job, `[managed-rebuild] Built only Gemma artifact ${kind}; wrote ${files.length} verified candidate files; Qwen artifacts and pointers were not touched`);
}

async function ensureGemmaDatasetVersion(candidateRoot: string, versionId: string, dataRoot = DATA_ROOT): Promise<void> {
  const sourceRoot = path.join(candidateRoot, "frozen", versionId);
  const targetRoot = path.join(dataRoot, "datasets", versionId);
  const sourceManifest = await readJson(path.join(sourceRoot, "manifest.json"));
  if (!sourceManifest || sourceManifest.version_id !== versionId) throw new Error("Gemma current-source package manifest is missing or has the wrong version ID.");
  if (!(await existsPath(targetRoot))) {
    const temporary = `${targetRoot}.gemma-${randomUUID()}`;
    await fs.cp(sourceRoot, temporary, { recursive: true, errorOnExist: true, force: false });
    await fs.rename(temporary, targetRoot);
  }
  const targetManifest = await readJson(path.join(targetRoot, "manifest.json"));
  if (!targetManifest || targetManifest.content_sha256 !== sourceManifest.content_sha256 || targetManifest.source_revision !== sourceManifest.source_revision) {
    throw new Error("Existing immutable dataset version differs from the Gemma candidate snapshot; refusing to replace it.");
  }
}

async function validateGemmaBuildReceipts(
  candidateRoot: string, record: Record<string, unknown>, source: Awaited<ReturnType<typeof captureEffectiveCatalogue>>,
  inputSha: string, model: string, endpoint: string,
): Promise<void> {
  const receipts = (record.gemma_artifact_receipts as Record<string, Record<string, unknown>> | undefined) ?? {};
  const identities = (record.gemma_artifact_identities as Record<string, GemmaBuildIdentity> | undefined) ?? {};
  for (const kind of GEMMA_CANDIDATE_ARTIFACTS) {
    const receipt = receipts[kind];
    const identity = kind === "gemma2_atoms" ? identities[kind] : receipt?.identity as GemmaBuildIdentity | undefined;
    const identitySha = identity ? kind === "gemma2_atoms" ? gemmaBuildIdentitySha256(identity) : String(receipt?.identity_sha256 ?? "") : "";
    if (!identity || identitySha !== gemmaBuildIdentitySha256(identity) || identity.artifact_kind !== kind
      || identity.encoder !== "embeddinggemma2" || identity.model !== model || identity.endpoint !== endpoint
      || identity.dimensions !== 768 || identity.source_revision !== source.revision
      || identity.source_snapshot_content_sha256 !== source.contentSha256 || identity.snapshot_file_sha256 !== inputSha) {
      throw new Error(`Gemma ${kind} build receipt is missing or has an incompatible source/model identity.`);
    }
    for (const input of identity.inputs) {
      const inputPath = path.resolve(candidateRoot, input.path);
      if (!inputPath.startsWith(`${path.resolve(candidateRoot)}${path.sep}`)
        || await fileSha256(inputPath) !== input.sha256) throw new Error(`Gemma ${kind} input changed after its build: ${input.path}`);
    }
    if (kind !== "gemma2_atoms") {
      if (!Array.isArray(receipt?.files)) throw new Error(`Gemma ${kind} output receipt is missing.`);
      for (const file of receipt.files as Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }>) {
        if (typeof file.path !== "string" || typeof file.sha256 !== "string" || !Number.isInteger(file.bytes)) throw new Error(`Gemma ${kind} output receipt is malformed.`);
        const outputPath = path.resolve(candidateRoot, file.path);
        if (!outputPath.startsWith(`${path.resolve(candidateRoot)}${path.sep}`)) throw new Error(`Gemma ${kind} output receipt escapes the candidate.`);
        const bytes = await fs.readFile(outputPath);
        if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error(`Gemma ${kind} output changed after its row build: ${file.path}`);
      }
    }
  }
}

async function validateGemmaCandidateBundle(candidate: { root: string; record: Record<string, unknown> }, currentSource: Awaited<ReturnType<typeof captureEffectiveCatalogue>>, dataRoot = DATA_ROOT): Promise<string> {
  const bundlePath = candidate.record.gemma_bundle_path;
  if (candidate.record.gemma_bundle_status !== "complete" || typeof bundlePath !== "string") throw new Error("Gemma candidate has not passed independent technical finalization.");
  const bundleRoot = path.resolve(dataRoot, bundlePath);
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  if (!bundleRoot.startsWith(maintenanceRoot)) throw new Error("Gemma bundle path is outside the candidate maintenance area.");
  const manifest = await readJson(path.join(bundleRoot, "bundle-manifest.json"));
  if (!manifest || manifest.status !== "complete" || manifest.encoder !== "embeddinggemma2"
    || manifest.source_revision !== currentSource.revision || manifest.source_snapshot_content_sha256 !== currentSource.contentSha256
    || manifest.excluded_sha256 !== currentSource.registrySha256 || Number(manifest.source_parameter_count) !== currentSource.parameters.length
    || typeof manifest.model !== "string" || !Array.isArray(manifest.files)) {
    throw new Error("Gemma candidate bundle manifest is missing, incomplete, or stale for the current effective catalogue.");
  }
  const snapshotBytes = await fs.readFile(path.join(candidate.root, "effective-live-snapshot.json"));
  const snapshotFileSha = createHash("sha256").update(snapshotBytes).digest("hex");
  if (candidate.record.snapshot_file_sha256 && candidate.record.snapshot_file_sha256 !== snapshotFileSha) throw new Error("Gemma candidate snapshot file checksum differs from its preparation receipt.");
  await validateGemmaBuildReceipts(candidate.root, candidate.record, currentSource, snapshotFileSha, String(manifest.model), String(manifest.endpoint));
  const files = manifest.files as Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }>;
  for (const entry of files) {
    if (typeof entry.path !== "string" || typeof entry.sha256 !== "string" || !Number.isInteger(entry.bytes)) throw new Error("Gemma bundle file inventory is malformed.");
    const filePath = path.resolve(bundleRoot, entry.path);
    if (!filePath.startsWith(`${bundleRoot}${path.sep}`)) throw new Error("Gemma bundle file path escapes its immutable directory.");
    const bytes = await fs.readFile(filePath);
    if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`Gemma candidate artifact checksum failed: ${entry.path}`);
  }
  const required = [
    "text-index/manifest.json", "text-index/rows.json", "text-index/embeddings.f32",
    "runtime-atoms/manifest.json", "runtime-atoms/atoms.json", "runtime-atoms/atom_embeddings.f32",
    "anchors/anchors_build.json", "range-anchors/manifest.json", "range-anchors/embeddings.f32",
    "range-anchors/select-options.json", "range-anchors/select-options.f32",
    "relations/manifest.json", "relations/embeddings.f32",
  ];
  const listed = new Set(files.map((item) => String(item.path)));
  if (required.some((item) => !listed.has(item))) throw new Error("Gemma candidate is missing one or more required runtime artifacts.");
  return bundlePath;
}

async function finalizeGemmaCandidate(candidateId: string, job: ManagedJob): Promise<void> {
  const found = await findCorpusCandidate(candidateId);
  if (!found) throw new Error("Prepared Gemma workset not found: " + candidateId);
  const pinned = await loadPinnedCandidate(candidateId);
  const { candidateRoot, snapshotPath, source, inputSha } = pinned;
  await verifyPreparedCandidate(path.join(candidateRoot, "prepared"), inputSha);
  const record = await readJson(path.join(candidateRoot, "candidate.json"));
  if (!record) throw new Error("Gemma candidate metadata is unavailable.");
  const builds = (record.gemma_artifact_builds as Record<string, unknown> | undefined) ?? {};
  const missing = GEMMA_CANDIDATE_ARTIFACTS.filter((kind) => builds[kind] !== "complete" && !(kind === "gemma2_atoms" && builds[kind] === "vectorization_complete"));
  if (missing.length) throw new Error(`Gemma Finalize validates saved outputs only. Build these Gemma table rows first: ${missing.join(", ")}. No model was called.`);
  const current = await captureEffectiveCatalogue();
  if (current.revision !== source.revision || current.contentSha256 !== source.contentSha256) throw new Error("Gemma Finalize rejected a stale snapshot; no model was called.");
  const settings = await loadEmbeddingRuntimeSettings();
  const model = await getConfiguredTextIndexModel("embeddinggemma2");
  if (model !== record.gemma_model || settings.baseUrl !== record.gemma_endpoint) throw new Error("Gemma model or endpoint changed after row builds; finalization refused.");
  const versionId = String(record.version_id ?? "");
  if (!versionId) throw new Error("Gemma Finalize requires the pinned current-source package created during Prepare.");
  await validateGemmaBuildReceipts(candidateRoot, record, source, inputSha, model, settings.baseUrl);
  const bundleRoot = path.join(candidateRoot, "artifacts", "embeddinggemma2");
  const runtimeAtomsDir = path.join(bundleRoot, "runtime-atoms");
  const runtimeIdentity = (record.gemma_artifact_identities as Record<string, GemmaBuildIdentity> | undefined)?.gemma2_atoms;
  const runtimeJob = (record.gemma_jobs as Record<string, Record<string, unknown>> | undefined)?.gemma2_atoms;
  if (!runtimeIdentity || runtimeJob?.identity_sha256 !== gemmaBuildIdentitySha256(runtimeIdentity)) throw new Error("Gemma runtime atom checkpoint identity is missing or incompatible.");
  const progress = await readJson(path.join(runtimeAtomsDir, "vectorization-progress.json"));
  const preparedAtomRows = await readJsonValue(path.join(candidateRoot, "prepared/shared/runtime-atoms/atoms.json"));
  const expectedAtomCount = Array.isArray(preparedAtomRows) ? preparedAtomRows.length : -1;
  if (!progress || progress.status !== "vectorization_complete" || progress.model !== model
    || progress.endpoint !== settings.baseUrl || progress.operation_identity_sha256 !== gemmaBuildIdentitySha256(runtimeIdentity)
    || typeof progress.cache_sha256 !== "string" || !progress.cache_sha256 || Number(progress.dimensions) !== 768
    || !Number.isInteger(progress.completed_count) || Number(progress.completed_count) !== expectedAtomCount
    || progress.effective_catalogue_revision !== source.revision) throw new Error("Gemma runtime atom vector checkpoint is incomplete or has incompatible source/model/dimensions.");
  job.source_revision = source.revision;
  job.source_snapshot_path = snapshotPath;
  job.source_snapshot_sha256 = source.contentSha256;
  job.excluded_sha256 = source.registrySha256;
  job.excluded_count = source.excludedCount;
  job.candidate_version = candidateId;
  job.safe_to_stop = false;
  job.stage = "finalize_gemma_candidate";
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), { ...record, gemma_finalization_status: "running" });
  const settingsEnv = embeddingProcessEnv(settings);
  const code = await runLoggedCommand([
    "-u", "python_engine/build-combinatorial-runtime-index.py", "--version-id", versionId,
    "--version-dir", path.join(candidateRoot, "frozen", versionId), "--model", model, "--endpoint", settings.baseUrl,
    "--output-dir", runtimeAtomsDir, "--effective-snapshot", snapshotPath, "--source-revision", source.revision,
    "--source-snapshot-sha256", source.contentSha256, "--excluded-sha256", source.registrySha256,
    "--prepared-rows", path.join(candidateRoot, "prepared/shared/runtime-atoms/atoms.json"), "--operation-identity-sha256", gemmaBuildIdentitySha256(runtimeIdentity), "--finalize-only",
  ], settingsEnv, job);
  if (code !== 0) throw new Error(`Gemma runtime atom finalization failed with exit ${code}; saved vectors/checkpoint remain and no embeddings were recomputed.`);
  await ensureGemmaDatasetVersion(candidateRoot, versionId);
  const atomManifest = await readJson(path.join(runtimeAtomsDir, "manifest.json"));
  await loadRuntimeAtomIndexFromDirectory(runtimeAtomsDir, versionId);
  const textManifest = await readJson(path.join(bundleRoot, "text-index/manifest.json"));
  const anchorManifest = await readJson(path.join(bundleRoot, "anchors/anchors_build.json"));
  const rangeManifest = await readJson(path.join(bundleRoot, "range-anchors/manifest.json"));
  const selectManifest = await readJson(path.join(bundleRoot, "range-anchors/select-options.json"));
  const relationManifest = await readJson(path.join(bundleRoot, "relations/manifest.json"));
  if (!textManifest || !anchorManifest || !rangeManifest || !selectManifest || !relationManifest || !atomManifest) {
    throw new Error("Gemma Finalize found a missing row manifest; no model was called and saved vectors remain untouched.");
  }
  for (const [label, manifest] of [["text", textManifest], ["runtime atoms", atomManifest], ["anchors", anchorManifest], ["Range", rangeManifest], ["Select", selectManifest], ["relations", relationManifest]] as const) {
    if (!manifest || manifest.model !== model) throw new Error(`Gemma ${label} manifest model mismatch.`);
    if (Number(manifest.dimensions ?? manifest.dim) !== 768) throw new Error(`Gemma ${label} dimensions are not 768.`);
    const artifactRevision = label === "runtime atoms" ? manifest.effective_catalogue_revision : manifest.source_revision;
    const artifactSnapshotSha = label === "runtime atoms" ? manifest.effective_snapshot_sha256 : manifest.source_snapshot_sha256;
    if (artifactRevision && artifactRevision !== source.revision) throw new Error(`Gemma ${label} source revision mismatch.`);
    if (artifactSnapshotSha && artifactSnapshotSha !== source.contentSha256) throw new Error(`Gemma ${label} content fingerprint mismatch.`);
  }
  for (const [label, manifest] of [["retrieval", textManifest], ["Range", rangeManifest], ["typed candidates", selectManifest]] as const) {
    if (manifest.value_selection_bundle_id !== candidateId) throw new Error(`Gemma ${label} artifact was built for a different value-selection bundle.`);
  }
  for (const [label, manifest] of [["Range", rangeManifest], ["typed candidates", selectManifest]] as const) {
    if (Number(manifest.selection_contract_version) !== 2 || Number(manifest.candidate_text_version) !== 2
      || typeof manifest.embedding_preprocessing_version !== "string" || !manifest.embedding_preprocessing_version) {
      throw new Error(`Gemma ${label} artifact uses a stale value-selection contract or candidate-text version.`);
    }
  }
  const textRows = JSON.parse(await fs.readFile(path.join(bundleRoot, "text-index/rows.json"), "utf8")) as unknown[];
  const textVectors = await fs.readFile(path.join(bundleRoot, "text-index/embeddings.f32"));
  if (textVectors.length !== 8 + textRows.length * 768 * 4 || textVectors.readUInt32LE(0) !== textRows.length || textVectors.readUInt32LE(4) !== 768) throw new Error("Gemma text rows/vectors alignment or dimensions failed.");
  const anchorRows = Object.keys((anchorManifest.a_home && typeof anchorManifest.a_home === "object" ? anchorManifest.a_home : {}) as object).length;
  if (anchorRows !== source.parameters.length) throw new Error(`Gemma anchors map ${anchorRows} rows; expected ${source.parameters.length}.`);
  for (const [label, manifestPath, vectorFile] of [
    ["Range", "range-anchors/manifest.json", String(rangeManifest.vectors_file ?? "embeddings.f32")],
    ["Select", "range-anchors/select-options.json", String(selectManifest.vectors_file ?? "select-options.f32")],
    ["relations", "relations/manifest.json", String(relationManifest.vectors_file ?? "embeddings.f32")],
  ]) {
    const manifest = await readJson(path.join(bundleRoot, manifestPath));
    const vectorPath = path.join(path.dirname(path.join(bundleRoot, manifestPath)), vectorFile);
    const vector = await fs.readFile(vectorPath);
    if (!manifest || vector.length < 8 || vector.readUInt32LE(4) !== 768 || vector.length !== 8 + vector.readUInt32LE(0) * 768 * 4
      || vector.readUInt32LE(0) !== Number(manifest.count)) throw new Error(`Gemma ${label} row/vector alignment failed.`);
  }
  const files = await createGemmaBundleInventory(bundleRoot);
  const bundleManifest = {
    schema_version: 1, status: "complete", encoder: "embeddinggemma2", model, endpoint: settings.baseUrl, dimensions: 768,
    value_selection_contract_version: 2, candidate_text_version: 2,
    source_revision: source.revision, source_snapshot_content_sha256: source.contentSha256, snapshot_file_sha256: inputSha,
    excluded_sha256: source.registrySha256, source_parameter_count: source.parameters.length, dataset_version: versionId,
    candidate_id: candidateId, files,
  };
  await writeJsonAtomic(path.join(bundleRoot, "bundle-manifest.json"), bundleManifest);
  const relativeBundlePath = path.relative(DATA_ROOT, bundleRoot).split(path.sep).join("/");
  const receipts = { ...((record.gemma_artifact_receipts as Record<string, unknown> | undefined) ?? {}) };
  const atomOutputFiles = await candidateFileInventory(candidateRoot, (await candidateDirectoryFiles(runtimeAtomsDir)).map((relative) => path.join(path.relative(candidateRoot, runtimeAtomsDir), relative)));
  const runtimeReceipt = { schema_version: 1, identity: runtimeIdentity, identity_sha256: runtimeJob.identity_sha256, output_directory: path.relative(candidateRoot, runtimeAtomsDir).split(path.sep).join("/"), files: atomOutputFiles, manifest_file: path.relative(candidateRoot, path.join(runtimeAtomsDir, "manifest.json")).split(path.sep).join("/") };
  receipts.gemma2_atoms = runtimeReceipt;
  const artifactBuilds = { ...((record.gemma_artifact_builds as Record<string, unknown> | undefined) ?? {}), gemma2_atoms: "complete" };
  const gemmaJobs = { ...((record.gemma_jobs as Record<string, unknown> | undefined) ?? {}), finalize: { status: "complete", finished_at: new Date().toISOString(), model, endpoint: settings.baseUrl, files: files.length } };
  await writeJsonAtomic(path.join(candidateRoot, "candidate.json"), { ...record, gemma_artifact_builds: artifactBuilds, gemma_artifact_receipts: receipts, gemma_bundle_status: "complete", gemma_bundle_path: relativeBundlePath, gemma_runtime_atom_index_path: `${relativeBundlePath}/runtime-atoms`, gemma_finalization_status: "complete", gemma_jobs: gemmaJobs });
  job.safe_to_stop = false;
  append(job, `[managed-rebuild] Gemma Finalize complete: ${files.length} candidate files validated; no model call; Qwen latest.json was not changed`);
}

export async function connectGemmaCandidate(candidateId: string, dataRoot = DATA_ROOT, currentSourceOverride?: Awaited<ReturnType<typeof captureEffectiveCatalogue>>) {
  const candidate = await findCorpusCandidate(candidateId, dataRoot);
  if (!candidate) throw new Error(`No saved Gemma workset found for ${candidateId}.`);
  if (candidate.record.gemma_finalization_status !== "complete" || candidate.record.gemma_bundle_status !== "complete") throw new Error("Gemma connection requires successful Gemma-only technical finalization.");
  const source = currentSourceOverride ?? await captureEffectiveCatalogue();
  if (candidate.record.source_revision !== source.revision || candidate.record.source_snapshot_sha256 !== source.contentSha256) throw new Error("Gemma candidate source is no longer current; connection refused.");
  const bundlePath = await validateGemmaCandidateBundle(candidate, source, dataRoot);
  const settings = await loadEmbeddingRuntimeSettings();
  const configuredModel = await getConfiguredTextIndexModel("embeddinggemma2");
  const bundleManifest = await readJson(path.join(dataRoot, bundlePath, "bundle-manifest.json"));
  if (!bundleManifest || bundleManifest.model !== configuredModel || bundleManifest.endpoint !== settings.baseUrl) {
    throw new Error("Gemma candidate model or endpoint differs from current query settings; connection refused.");
  }
  const versionId = String(candidate.record.version_id ?? "");
  const datasetManifest = await readJson(path.join(dataRoot, "datasets", versionId, "manifest.json"));
  const runtimePath = String(candidate.record.gemma_runtime_atom_index_path ?? "");
  const bundleRoot = path.resolve(dataRoot, bundlePath);
  const runtimeDir = path.resolve(dataRoot, runtimePath);
  if (!datasetManifest || datasetManifest.source_revision !== source.revision || !runtimeDir.startsWith(`${bundleRoot}${path.sep}`)) throw new Error("Gemma runtime dataset/index paths are missing or outside the finalized bundle.");
  const runtimeManifest = await readJson(path.join(runtimeDir, "manifest.json"));
  if (!runtimeManifest || runtimeManifest.version_id !== versionId || runtimeManifest.model !== candidate.record.gemma_model
    || runtimeManifest.effective_catalogue_revision !== source.revision) throw new Error("Gemma runtime atom manifest failed final source/model validation.");
  const pointer = {
    schema_version: 1, encoder: "embeddinggemma2", candidate_id: candidateId, bundle_id: candidateId,
    version_id: versionId, gemma_bundle_path: bundlePath, runtime_atom_index_path: runtimePath,
    source_revision: source.revision, source_snapshot_content_sha256: source.contentSha256,
    model: candidate.record.gemma_model, dimensions: 768, connected_at: new Date().toISOString(),
  };
  await writeGemmaActivePointer(dataRoot, pointer);
  await writeJsonAtomic(path.join(candidate.root, "candidate.json"), { ...candidate.record, gemma_connection_status: "connected", gemma_connected_at: pointer.connected_at });
  return { connected: true, candidate_id: candidateId, version_id: versionId, gemma_bundle_path: bundlePath };
}

export async function writeGemmaActivePointer(dataRoot: string, pointer: Record<string, unknown>): Promise<void> {
  if (pointer.encoder !== "embeddinggemma2" || typeof pointer.gemma_bundle_path !== "string"
    || typeof pointer.runtime_atom_index_path !== "string" || typeof pointer.version_id !== "string") {
    throw new Error("Refusing to write an incomplete Gemma runtime pointer.");
  }
  const bundleRoot = path.resolve(dataRoot, pointer.gemma_bundle_path);
  const runtimeDirectory = path.resolve(dataRoot, pointer.runtime_atom_index_path);
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  if (!bundleRoot.startsWith(maintenanceRoot) || !runtimeDirectory.startsWith(`${bundleRoot}${path.sep}`)) {
    throw new Error("Refusing to connect Gemma paths outside one inactive candidate bundle.");
  }
  await writeJsonAtomic(path.join(dataRoot, "datasets", "embeddinggemma2-latest.json"), pointer);
}

export async function resolveFrozenCandidateVersion(frozenRoot: string, sourceRevision: string, parameterCount: number): Promise<string> {
  const entries = await fs.readdir(frozenRoot, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await readJson(path.join(frozenRoot, entry.name, "manifest.json"));
    if (manifest?.source_revision === sourceRevision && Number(manifest.parameter_count) === parameterCount) candidates.push(entry.name);
  }
  if (candidates.length !== 1) {
    throw new Error(`Expected one pinned current-source package matching source ${sourceRevision} and ${parameterCount} parameters; found ${candidates.length}.`);
  }
  return candidates[0]!;
}

async function findCorpusCandidate(candidateRef: string, dataRoot: string = DATA_ROOT): Promise<{ root: string; record: Record<string, unknown> } | null> {
  const maintenance = path.join(dataRoot, "maintenance");
  const matches: Array<{ root: string; entryName: string; record: Record<string, unknown> }> = [];
  for (const entry of await fs.readdir(maintenance, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const root = path.join(maintenance, entry.name);
    const record = await readJson(path.join(root, "candidate.json"));
    if (record) matches.push({ root, entryName: entry.name, record });
    else if (entry.name === candidateRef) matches.push({ root, entryName: entry.name, record: { candidate_id: entry.name } });
  }
  const exact = matches.find(({ entryName, record }) => record.candidate_id === candidateRef || entryName === candidateRef);
  if (exact) return { root: exact.root, record: exact.record };
  const versionMatches = matches.filter(({ record }) => record.version_id === candidateRef);
  if (versionMatches.length > 1) throw new Error(`Candidate version ${candidateRef} is ambiguous; pass a unique candidate_id.`);
  return versionMatches[0] ? { root: versionMatches[0].root, record: versionMatches[0].record } : null;
}

export async function listCorpusCandidates(): Promise<Array<Record<string, unknown>>> {
  const maintenance = path.join(DATA_ROOT, "maintenance");
  const candidates: Array<Record<string, unknown>> = [];
  for (const entry of await fs.readdir(maintenance, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const root = path.join(maintenance, entry.name);
    const candidate = await readJson(path.join(root, "candidate.json"));
    if (candidate) {
      candidates.push(candidate);
      continue;
    }
    const source = await readJson(path.join(root, "source-status.json"));
    if (source && await existsPath(path.join(root, "effective-live-snapshot.json")) && await existsPath(path.join(root, "prepared", "source_parameters.json"))) {
      const frozenRoot = path.join(root, "frozen");
      const versionId = await resolveFrozenCandidateVersion(frozenRoot, String(source.source_revision ?? ""), Number(source.effective_record_count ?? 0)).catch(() => null);
      candidates.push({
        candidate_id: entry.name, candidate_path: root, status: "prepared_unregistered",
        prepare_status: "needs_readback_verification", source_revision: source.source_revision,
        source_record_count: source.effective_record_count, version_id: versionId,
        model: (await readJson(path.join(root, "prepared", "semantic_embeddings_meta.json")))?.model ?? null,
      });
    }
  }
  return candidates.sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")));
}

async function findReusableCompositeDir(candidateRoot: string, source: Awaited<ReturnType<typeof captureEffectiveCatalogue>>, model: string, dataRoot: string): Promise<string | null> {
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  const targetRoot = path.resolve(candidateRoot);
  for (const candidate of await listCorpusCandidates()) {
    if (candidate.source_revision !== source.revision || candidate.source_snapshot_sha256 !== source.contentSha256
      || candidate.model !== model || candidate.candidate_path === candidateRoot
      || !(candidate.status === "ready_to_connect" || candidate.status === "active" || candidate.vectorization_status === "complete")) continue;
    const root = path.resolve(typeof candidate.candidate_path === "string"
      ? candidate.candidate_path : path.join(dataRoot, "maintenance", String(candidate.candidate_id ?? "")));
    if (!root.startsWith(maintenanceRoot) || root === targetRoot) continue;
    const indexDir = path.join(root, "artifacts", "qwen3", "composite-index");
    const manifest = await readJson(path.join(indexDir, "manifest.json"));
    if (!manifest || manifest.model !== model || manifest.source_revision !== source.revision
      || manifest.source_snapshot_sha256 !== source.contentSha256) continue;
    if (await existsPath(path.join(indexDir, "rows.json")) && await existsPath(path.join(indexDir, "embeddings.f32"))) return indexDir;
  }
  return null;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

async function validateQwenCandidateBundle(candidate: { root: string; record: Record<string, unknown> }, currentSource: Awaited<ReturnType<typeof captureEffectiveCatalogue>>, dataRoot = DATA_ROOT): Promise<string> {
  if (candidate.record.qwen_bundle_status !== "complete" || typeof candidate.record.qwen_bundle_path !== "string") {
    throw new Error("Candidate has no complete Qwen artifact bundle; partial corpus-only activation is refused.");
  }
  const bundleRoot = path.resolve(dataRoot, candidate.record.qwen_bundle_path);
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  if (!bundleRoot.startsWith(maintenanceRoot)) throw new Error("Candidate Qwen bundle path is outside the maintenance candidate area.");
  const bundle = await readJson(path.join(bundleRoot, "bundle-manifest.json"));
  if (!bundle || bundle.status !== "complete" || bundle.encoder !== "qwen3"
    || bundle.source_revision !== currentSource.revision || bundle.source_snapshot_sha256 !== currentSource.contentSha256
    || bundle.excluded_sha256 !== currentSource.registrySha256 || Number(bundle.source_parameter_count) !== currentSource.parameters.length
    || bundle.dataset_version !== candidate.record.version_id || Number(bundle.value_selection_contract_version) !== 2
    || Number(bundle.candidate_text_version) !== 2 || !Array.isArray(bundle.files) || bundle.files.length === 0) {
    throw new Error("Qwen candidate bundle manifest is missing, incomplete, or stale for the current effective catalogue.");
  }
  const bundleId = path.basename(path.dirname(path.dirname(bundleRoot)));
  const retrievalManifest = await readJson(path.join(bundleRoot, "composite-index", "manifest.json"));
  if (!retrievalManifest || retrievalManifest.model !== bundle.model
    || Number(retrievalManifest.dimensions) !== Number(bundle.dimensions)
    || retrievalManifest.source_revision !== currentSource.revision
    || retrievalManifest.source_snapshot_sha256 !== currentSource.contentSha256
    || retrievalManifest.value_selection_bundle_id !== bundleId
    || typeof retrievalManifest.embedding_preprocessing_version !== "string"
    || !retrievalManifest.embedding_preprocessing_version
    || !selectionBundleDatasetIdentityMatches({
      bundleDatasetVersion: bundle.dataset_version,
      activeDatasetVersion: candidate.record.version_id,
      retrievalDatasetVersion: retrievalManifest.dataset_version,
      retrievalSourceRevision: retrievalManifest.source_revision,
    })) {
    throw new Error("Qwen candidate retrieval manifest does not match the candidate dataset, source snapshot, preprocessing, or bundle identity.");
  }
  for (const entry of bundle.files as Array<{ path?: unknown; sha256?: unknown; bytes?: unknown }>) {
    if (typeof entry.path !== "string" || typeof entry.sha256 !== "string" || !Number.isInteger(entry.bytes)) {
      throw new Error("Qwen candidate bundle has a malformed file inventory.");
    }
    const filePath = path.resolve(bundleRoot, entry.path);
    if (!filePath.startsWith(`${bundleRoot}${path.sep}`)) throw new Error("Qwen candidate bundle file path escapes its immutable directory.");
    const bytes = await fs.readFile(filePath);
    if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      throw new Error(`Qwen candidate artifact checksum failed: ${entry.path}`);
    }
  }
  const required = [
    "composite-index/manifest.json", "composite-index/rows.json", "composite-index/embeddings.f32",
    "anchors/anchors_build.json", "value-anchors/manifest.json", "value-anchors/select-options.json",
    "relations/manifest.json", "relations/embeddings.f32", "runtime-atoms/manifest.json",
    "runtime-atoms/atoms.json", "runtime-atoms/atom_embeddings.f32",
  ];
  const paths = new Set((bundle.files as Array<{ path: string }>).map((entry) => entry.path));
  if (required.some((relative) => !paths.has(relative))) throw new Error("Qwen candidate bundle is missing one or more required runtime artifacts.");
  return candidate.record.qwen_bundle_path;
}

export async function activateCorpusCandidate(candidateId: string, dataRoot = DATA_ROOT, currentSourceOverride?: Awaited<ReturnType<typeof captureEffectiveCatalogue>>) {
  const candidate = await findCorpusCandidate(candidateId, dataRoot);
  if (!candidate) throw new Error(`No saved corpus candidate found for ${candidateId}.`);
  const versionId = String(candidate.record.version_id ?? "");
  if (!versionId) throw new Error(`Candidate ${candidateId} has no dataset version ID.`);
  if (!(["ready_to_connect", "rolled_back", "active"].includes(String(candidate.record.status)) && candidate.record.qwen_bundle_status === "complete")) {
    throw new Error("Candidate connection requires successful technical finalization.");
  }
  const currentSource = currentSourceOverride ?? await captureEffectiveCatalogue();
  if (currentSource.revision !== candidate.record.source_revision) throw new Error("Candidate source is no longer current; activation refused.");
  const qwenBundlePath = await validateQwenCandidateBundle(candidate, currentSource, dataRoot);
  const latestPath = path.join(dataRoot, "datasets", "latest.json");
  const latestRaw = await fs.readFile(latestPath, "utf8");
  const latest = JSON.parse(latestRaw) as { version_id?: string };
  const datasetManifest = await readJson(path.join(dataRoot, "datasets", versionId, "manifest.json"));
  if (typeof candidate.record.runtime_atom_index_path !== "string") throw new Error("Candidate runtime atom index pointer is missing.");
  const indexDir = path.resolve(dataRoot, candidate.record.runtime_atom_index_path);
  const qwenBundleRoot = path.resolve(dataRoot, qwenBundlePath);
  if (!indexDir.startsWith(`${qwenBundleRoot}${path.sep}`)) throw new Error("Candidate runtime atom index is outside its Qwen bundle.");
  const indexManifest = await readJson(path.join(indexDir, "manifest.json"));
  if (!datasetManifest || datasetManifest.source_revision !== currentSource.revision || !indexManifest
    || indexManifest.version_id !== versionId || indexManifest.effective_catalogue_revision !== currentSource.revision
    || !indexManifest.rows_sha256 || !indexManifest.vectors_sha256) {
    throw new Error("Candidate dataset/runtime manifests are missing or do not match the current source revision.");
  }
  const [rows, vectors] = await Promise.all([fs.readFile(path.join(indexDir, "atoms.json")), fs.readFile(path.join(indexDir, "atom_embeddings.f32"))]);
  if (createHash("sha256").update(rows).digest("hex") !== indexManifest.rows_sha256
    || createHash("sha256").update(vectors).digest("hex") !== indexManifest.vectors_sha256) throw new Error("Candidate runtime row/vector checksum mismatch; activation refused.");
  const activationDir = path.join(dataRoot, "maintenance", "activations");
  const activationId = `${versionId}-${randomUUID()}`;
  const activationPath = path.join(activationDir, `${activationId}.json`);
  const nextLatest = {
    version_id: versionId, manifest: path.join(dataRoot, "datasets", versionId, "manifest.json"),
    artifact_bundle_required: true, qwen_bundle_path: qwenBundlePath,
    runtime_atom_index_path: `${qwenBundlePath}/runtime-atoms`, updated_at: new Date().toISOString(),
  };
  await fs.mkdir(activationDir, { recursive: true });
  await fs.writeFile(activationPath, `${JSON.stringify({ activation_id: activationId, old_latest: JSON.parse(latestRaw), new_latest: nextLatest, activated_at: new Date().toISOString(), rolled_back_at: null }, null, 2)}\n`, "utf8");
  await writeJsonAtomic(latestPath, nextLatest);
  const updated = { ...candidate.record, status: "active", activation_id: activationId };
  await fs.writeFile(path.join(candidate.root, "candidate.json"), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return { activated: true, version_id: versionId, previous_version: latest.version_id, activation_id: activationId };
}

export async function rollbackCorpusCandidate(candidateId: string, dataRoot = DATA_ROOT, currentSourceOverride?: Awaited<ReturnType<typeof captureEffectiveCatalogue>>) {
  const candidate = await findCorpusCandidate(candidateId, dataRoot);
  if (!candidate) throw new Error(`No saved corpus candidate found for ${candidateId}.`);
  const versionId = String(candidate.record.version_id ?? "");
  if (!versionId) throw new Error(`Candidate ${candidateId} has no dataset version ID.`);
  if (candidate.record.status !== "active" || typeof candidate.record.activation_id !== "string") throw new Error("No active candidate with a rollback checkpoint was found.");
  const activationPath = path.join(dataRoot, "maintenance", "activations", `${candidate.record.activation_id}.json`);
  const activation = await readJson(activationPath);
  if (!activation || !activation.old_latest || !activation.new_latest) throw new Error("Activation checkpoint is missing or invalid.");
  const latestPath = path.join(dataRoot, "datasets", "latest.json");
  const latest = JSON.parse(await fs.readFile(latestPath, "utf8")) as { version_id?: string };
  if (latest.version_id !== versionId) throw new Error("Active version changed after this activation; rollback refused to overwrite it.");
  const oldLatest = activation.old_latest as Record<string, unknown>;
  const oldVersion = String(oldLatest.version_id ?? "");
  const currentSource = currentSourceOverride ?? await captureEffectiveCatalogue();
  const oldManifest = oldVersion ? await readJson(path.join(dataRoot, "datasets", oldVersion, "manifest.json")) : null;
  let rollbackEligible = Boolean(oldManifest && oldManifest.source_revision === currentSource.revision
    && Number(oldManifest.parameter_count) === currentSource.parameters.length
    && oldLatest.artifact_bundle_required === true && typeof oldLatest.qwen_bundle_path === "string"
    && typeof oldLatest.runtime_atom_index_path === "string");
  if (rollbackEligible) {
    try {
      await validateQwenCandidateBundle({ root: "", record: {
        qwen_bundle_status: "complete", qwen_bundle_path: oldLatest.qwen_bundle_path, version_id: oldVersion,
      } }, currentSource, dataRoot);
      const oldBundleRoot = path.resolve(dataRoot, String(oldLatest.qwen_bundle_path));
      const oldIndexDir = path.resolve(dataRoot, String(oldLatest.runtime_atom_index_path));
      if (!oldIndexDir.startsWith(`${oldBundleRoot}${path.sep}`)) throw new Error("Rollback runtime index is outside its Qwen bundle.");
      const oldIndexManifest = await readJson(path.join(oldIndexDir, "manifest.json"));
      const [oldRows, oldVectors] = await Promise.all([
        fs.readFile(path.join(oldIndexDir, "atoms.json")), fs.readFile(path.join(oldIndexDir, "atom_embeddings.f32")),
      ]);
      if (!oldIndexManifest || oldIndexManifest.version_id !== oldVersion
        || oldIndexManifest.effective_catalogue_revision !== currentSource.revision
        || createHash("sha256").update(oldRows).digest("hex") !== oldIndexManifest.rows_sha256
        || createHash("sha256").update(oldVectors).digest("hex") !== oldIndexManifest.vectors_sha256) {
        throw new Error("Rollback runtime atom index failed its source or checksum validation.");
      }
    } catch { rollbackEligible = false; }
  }
  const rollbackPointer = rollbackEligible ? oldLatest : {
    ...oldLatest, artifact_bundle_required: true, qwen_bundle_path: null, runtime_atom_index_path: null,
    runtime_policy_state: "rollback_target_not_current_for_effective_catalogue",
  };
  await writeJsonAtomic(latestPath, rollbackPointer);
  activation.rolled_back_at = new Date().toISOString();
  activation.rollback_runtime_eligible = rollbackEligible;
  await writeJsonAtomic(activationPath, activation);
  const updated = { ...candidate.record, status: "rolled_back", rollback_runtime_eligible: rollbackEligible };
  await fs.writeFile(path.join(candidate.root, "candidate.json"), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return {
    rolled_back: true, from_version: versionId, to_version: oldVersion || null,
    runtime_eligible: rollbackEligible,
    ...(rollbackEligible ? {} : { reason: "Pointer restored for technical recovery; the previous version is stale/historical and all Qwen runtime reads fail closed until a current validated bundle is activated." }),
  };
}

async function existsPath(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

export async function startManagedRebuild(kind: RebuildKind, candidateVersion?: string, candidateArtifact?: QwenCandidateArtifactKind | GemmaCandidateArtifactKind) {
  const current = shared.__ragV3ManagedJob!;
  if (current.running) return { started: false, reason: "another rebuild is already running", job: getManagedJob() };
  const requestedKind: string = kind;
  if (requestedKind === "all_qwen" || requestedKind === "vectorize_candidate") {
    return { started: false, reason: "Complete-set vectorization is disabled. Build each Qwen artifact from its own table row; dependent rows name their prerequisite.", job: getManagedJob() };
  }
  if (kind === "embeddinggemma2_text" || kind.startsWith("gemma2_")) {
    return { started: false, reason: "Direct Gemma writers are disabled; use a prepared candidate row so outputs remain inactive until explicit Gemma connection.", job: getManagedJob() };
  }
  if (["all_qwen", "catalogue", "composite", "atoms", "anchors", "range", "select", "relations"].includes(kind)) {
    return { started: false, reason: "direct Qwen rebuilds are disabled because they write active artifacts stage by stage; use the complete inactive current-catalog candidate workflow", job: getManagedJob() };
  }
  if ((kind === "vectorize_candidate" || kind === "finalize_candidate") && !candidateVersion) return { started: false, reason: "candidate identifier is required for this stage", job: getManagedJob() };
  if (kind === "qwen_component" && (!candidateVersion || !candidateArtifact)) return { started: false, reason: "prepared candidate and Qwen artifact row are required", job: getManagedJob() };
  if (kind === "gemma_component" && (!candidateVersion || !candidateArtifact || !GEMMA_CANDIDATE_ARTIFACTS.includes(candidateArtifact as GemmaCandidateArtifactKind))) return { started: false, reason: "prepared candidate and Gemma artifact row are required", job: getManagedJob() };
  if (kind === "finalize_gemma_candidate" && !candidateVersion) return { started: false, reason: "candidate identifier is required for Gemma finalization", job: getManagedJob() };
  const isGemmaOperation = kind === "gemma_component" || kind === "finalize_gemma_candidate";
  const parameterBound = kind === "all_qwen" || kind === "catalogue" || kind === "composite"
    || kind === "atoms" || kind === "anchors" || kind === "range" || kind === "select" || kind === "relations";
  let pinnedSource: Awaited<ReturnType<typeof captureEffectiveCatalogue>> | null = parameterBound ? await captureEffectiveCatalogue() : null;
  if (!isGemmaOperation && (kind === "all_qwen" || kind === "atoms" || kind === "gemma2_atoms")) {
    const [latest, source] = await Promise.all([
      readJson(path.join(DATA_ROOT, "datasets", "latest.json")),
      pinnedSource ? Promise.resolve(pinnedSource) : captureEffectiveCatalogue(),
    ]);
    pinnedSource = source;
    const active = latest?.version_id
      ? await readJson(path.join(DATA_ROOT, "datasets", String(latest.version_id), "manifest.json"))
      : null;
    const reason = activeCorpusBlockReason(active, { revision: source.revision, parameter_count: source.parameters.length });
    if (reason) return { started: false, reason, job: getManagedJob() };
  }
  const isGemma = isGemmaOperation;
  const usesModel = kind !== "corpus_candidate" && kind !== "finalize_candidate" && kind !== "finalize_gemma_candidate";
  const slotOwner = isGemma ? "embeddinggemma2-index-build" : kind.endsWith("_candidate") ? "catalogue-candidate-" + kind : `${kind}-index-build`;
  if (usesModel && !acquireEmbeddingModelSlot(slotOwner)) return { started: false, reason: `model slot is busy: ${getEmbeddingModelSlot()?.owner ?? "unknown operation"}`, job: getManagedJob() };
  const job = idle();
  job.running = true;
  job.kind = kind;
  job.safe_to_stop = kind === "atoms" || kind === "corpus_candidate" || kind === "vectorize_candidate" || kind === "qwen_component" || kind === "gemma_component";
  job.started_at = Date.now();
  if (pinnedSource) {
    const snapshotRoot = path.join(DATA_ROOT, "maintenance", "service-bay-snapshots");
    await fs.mkdir(snapshotRoot, { recursive: true });
    const snapshotPath = path.join(snapshotRoot, `${job.started_at}-${randomUUID()}.json`);
    await fs.writeFile(snapshotPath, `${JSON.stringify(pinnedSource.parameters, null, 2)}\n`, "utf8");
    const serializedSnapshot = await fs.readFile(snapshotPath);
    await fs.writeFile(`${snapshotPath}.manifest.json`, `${JSON.stringify({
      schema_version: 1, source_kind: "effective-live-catalogue", source_revision: pinnedSource.revision,
      source_snapshot_sha256: pinnedSource.contentSha256, snapshot_file_sha256: createHash("sha256").update(serializedSnapshot).digest("hex"),
      library_sha256: pinnedSource.librarySha256, tombstones_sha256: pinnedSource.tombstonesSha256,
      excluded_sha256: pinnedSource.registrySha256, library_record_count: pinnedSource.libraryCount,
      effective_record_count: pinnedSource.parameters.length, tombstoned_live_count: pinnedSource.tombstonedLive.length,
      excluded_live_count: pinnedSource.excludedLive.length, captured_at: new Date().toISOString(),
    }, null, 2)}\n`, "utf8");
    job.source_snapshot_path = snapshotPath;
    job.source_revision = pinnedSource.revision;
    job.source_snapshot_sha256 = pinnedSource.contentSha256;
    job.excluded_sha256 = pinnedSource.registrySha256;
    job.excluded_count = pinnedSource.excludedCount;
  }
  shared.__ragV3ManagedJob = job;
  const stages: Array<Exclude<ArtifactKind, "siglip">> = kind === "all_qwen"
    ? ["composite", "atoms", "anchors", "range", "select", "relations"]
    : kind === "catalogue"
      ? ["composite", "anchors"]
      : kind === "corpus_candidate" || kind === "vectorize_candidate" || kind === "finalize_candidate" ? [] : [kind as Exclude<ArtifactKind, "siglip">];
  void (async () => {
    let exitCode = 0;
    try {
      if (kind === "corpus_candidate") await prepareCorpusCandidate(job, candidateVersion);
      else if (kind === "vectorize_candidate") await vectorizeCorpusCandidate(candidateVersion!, job);
      else if (kind === "finalize_candidate") await finalizeCorpusCandidate(candidateVersion!, job);
      else if (kind === "qwen_component" || kind === "gemma_component") await dispatchCandidateRowArtifact(kind, candidateVersion!, candidateArtifact!, job, {
        qwen: buildOneQwenCandidateArtifact,
        gemma: buildOneGemmaCandidateArtifact,
      });
      else if (kind === "finalize_gemma_candidate") await finalizeGemmaCandidate(candidateVersion!, job);
      else for (const stage of stages) {
          if (job.stop_requested) { exitCode = 130; break; }
          exitCode = await runStage(stage, job);
          if (exitCode !== 0) break;
          if (job.source_revision) {
            const latestSource = await captureEffectiveCatalogue();
            if (latestSource.revision !== job.source_revision) {
              job.last_error = `Catalogue changed during ${stage} (${job.source_revision} → ${latestSource.revision}); outputs remain tagged to the captured snapshot and are not current.`;
              append(job, `[managed-rebuild] ${job.last_error}`);
              exitCode = 2;
              break;
            }
          }
        }
    } catch (error) {
      exitCode = job.stop_requested ? 130 : -1;
      job.last_error = error instanceof Error ? error.message : String(error);
      append(job, `[managed-rebuild] ${job.last_error}`);
      if ((kind === "gemma_component" || kind === "finalize_gemma_candidate") && candidateVersion) {
        const found = await findCorpusCandidate(candidateVersion).catch(() => null);
        if (found) {
          const jobs = { ...((found.record.gemma_jobs as Record<string, unknown> | undefined) ?? {}) };
          const jobKey = kind === "gemma_component" ? String(candidateArtifact) : "finalize";
          jobs[jobKey] = { ...(jobs[jobKey] as Record<string, unknown> | undefined), status: "error", finished_at: new Date().toISOString(), error: job.last_error };
          const builds = { ...((found.record.gemma_artifact_builds as Record<string, unknown> | undefined) ?? {}) };
          if (kind === "gemma_component") builds[jobKey] = "error";
          await writeJsonAtomic(path.join(found.root, "candidate.json"), {
            ...found.record, gemma_jobs: jobs, gemma_artifact_builds: builds,
            ...(kind === "finalize_gemma_candidate" ? { gemma_finalization_status: "error" } : {}),
          }).catch((persistError) => append(job, `[managed-rebuild] Could not persist Gemma error receipt: ${persistError instanceof Error ? persistError.message : String(persistError)}`));
        }
      }
      if (kind === "finalize_candidate" && candidateVersion) {
        const found = await findCorpusCandidate(candidateVersion).catch(() => null);
        if (found) await writeJsonAtomic(path.join(found.root, "candidate.json"), {
          ...found.record,
          status: found.record.status === "active" ? "active" : "vectorized",
          finalization_status: "error",
        }).catch((persistError) => append(job, `[managed-rebuild] Could not persist Qwen finalization error state: ${persistError instanceof Error ? persistError.message : String(persistError)}`));
      }
    } finally {
      if (exitCode === 0 && kind !== "corpus_candidate" && kind !== "vectorize_candidate" && kind !== "finalize_candidate" && kind !== "qwen_component" && kind !== "gemma_component" && kind !== "finalize_gemma_candidate") {
        const invalid = await verifyCompletedStages(stages).catch((error) => [error instanceof Error ? error.message : String(error)]);
        if (invalid.length) {
          exitCode = 2;
          job.last_error = `Build exited successfully but artifact audit did not pass: ${invalid.join("; ")}`;
          append(job, `[managed-rebuild] verification failed: ${job.last_error}`);
        } else {
          append(job, `[managed-rebuild] artifact audit passed for ${stages.join(", ")}`);
        }
      }
      job.running = false;
      job.exit_code = exitCode;
      job.finished_at = Date.now();
      job.safe_to_stop = false;
      shared.__ragV3ManagedChild = null;
      if (usesModel) releaseEmbeddingModelSlot(slotOwner);
    }
    if (exitCode !== 0 && !job.last_error && !job.stop_requested) job.last_error = `rebuild exited with ${exitCode}`;
  })();
  return { started: true, job: getManagedJob() };
}

export function stopManagedRebuild() {
  const job = shared.__ragV3ManagedJob!;
  if (!job.running) return { stopped: false, reason: "no rebuild is running", job: getManagedJob() };
  if (!job.safe_to_stop) return { stopped: false, reason: "this operation writes active artifacts and cannot be stopped safely; wait for completion", job: getManagedJob() };
  job.stop_requested = true;
  shared.__ragV3ManagedChild?.kill("SIGTERM");
  return { stopped: true, job: getManagedJob() };
}

export async function dispatchCandidateRowArtifact(
  kind: "qwen_component" | "gemma_component", candidateId: string,
  artifact: QwenCandidateArtifactKind | GemmaCandidateArtifactKind, job: ManagedJob,
  runners: {
    qwen: (candidateId: string, artifact: QwenCandidateArtifactKind, job: ManagedJob) => Promise<void>;
    gemma: (candidateId: string, artifact: GemmaCandidateArtifactKind, job: ManagedJob) => Promise<void>;
  },
): Promise<void> {
  if (kind === "gemma_component") {
    if (!GEMMA_CANDIDATE_ARTIFACTS.includes(artifact as GemmaCandidateArtifactKind)) throw new Error("Gemma row dispatch received a non-Gemma artifact.");
    await runners.gemma(candidateId, artifact as GemmaCandidateArtifactKind, job);
    return;
  }
  const qwenKinds: readonly QwenCandidateArtifactKind[] = ["composite", "atoms", "anchors", "range", "select", "relations"];
  if (!qwenKinds.includes(artifact as QwenCandidateArtifactKind)) throw new Error("Qwen row dispatch received a non-Qwen artifact.");
  await runners.qwen(candidateId, artifact as QwenCandidateArtifactKind, job);
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>; } catch { return null; }
}

async function readJsonValue(filePath: string): Promise<unknown> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown; } catch { return null; }
}

function artifactPaths(versionId: string, runtimeAtomIndexPath?: unknown): Record<ArtifactKind, string> {
  const atomIndexDir = resolveRuntimeAtomIndexDirectory(DATA_ROOT, versionId, runtimeAtomIndexPath);
  return {
    composite: path.join(getTextIndexDirectory("qwen3"), "manifest.json"),
    embeddinggemma2_text: path.join(getTextIndexDirectory("embeddinggemma2"), "manifest.json"),
    atoms: path.join(atomIndexDir, "manifest.json"),
    anchors: path.join(getEncoderArtifactDirectory("qwen3", "anchors"), "anchors_build.json"),
    range: path.join(getEncoderArtifactDirectory("qwen3", "range-anchors"), "manifest.json"),
    select: path.join(getEncoderArtifactDirectory("qwen3", "range-anchors"), "select-options.json"),
    relations: path.join(getEncoderArtifactDirectory("qwen3", "relations"), "manifest.json"),
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
  const isGemma = kind === "embeddinggemma2_text" || kind.startsWith("gemma2_");
  const latest = await readJson(path.join(DATA_ROOT, "datasets", isGemma ? "embeddinggemma2-latest.json" : "latest.json"));
  const paths = artifactPaths(String(latest?.version_id ?? ""), latest?.runtime_atom_index_path);
  const manifest = await readJson(paths[kind]);
  if (!manifest || (expectedModel && String(manifest.model ?? manifest.model_id ?? "") !== expectedModel)) return false;
  if (kind === "atoms" || kind === "gemma2_atoms") {
    if (String(manifest.version_id ?? "") !== String(latest?.version_id ?? "")) return false;
    const [source, datasetManifest] = await Promise.all([
      captureEffectiveCatalogue(),
      readJson(path.join(DATA_ROOT, "datasets", String(latest?.version_id ?? ""), "manifest.json")),
    ]);
    try {
      assertRuntimeCorpusCurrent({
        currentRevision: source.revision,
        datasetSourceRevision: datasetManifest?.source_revision,
        runtimeSourceRevision: manifest.effective_catalogue_revision,
        archivedFallbackEnabled: manifest.frozen_donor_fallback_enabled,
      });
      return true;
    } catch {
      return false;
    }
  }
  const snapshot = await getV3SnapshotIdentity();
  if (kind === "composite" || kind === "embeddinggemma2_text") {
    const source = await captureEffectiveCatalogue();
    return textArtifactIsCurrent(kind, manifest, snapshot, source.revision);
  }
  return snapshotArtifactIsCurrent(manifest, snapshot, false);
}

export interface BankStatus { mode_id: string; input: string; encoder: string; value_policy: string; status: "ready" | "partial" | "stale_data" | "stale_vectors" | "missing"; dependencies: string[]; reason?: string; value_domain_gaps?: Array<{ technical_name: string; ui_element: string }> }

function declaredValueCandidates(row: Record<string, unknown>): unknown[] | null {
  if (row.ui_element === "Select") return Array.isArray(row.options) && row.options.length ? row.options : null;
  if (row.ui_element === "Toggle") return row.min_value === 0 && row.max_value === 1 && row.step === 1 ? [0, 1] : null;
  for (const key of ["value_candidates", "published_values", "options"]) {
    if (Array.isArray(row[key]) && (row[key] as unknown[]).length) return row[key] as unknown[];
  }
  const schema = row.value_schema;
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const typedSchema = schema as Record<string, unknown>;
    if (Array.isArray(typedSchema.enum) && typedSchema.enum.length) return typedSchema.enum;
    if (Object.hasOwn(typedSchema, "const")) return [typedSchema.const];
  }
  return null;
}

export async function getArtifactStatuses(): Promise<{ artifacts: ArtifactStatus[]; banks: BankStatus[]; active_model: string; active_endpoint: string; registry_sha256: string; active_parameters: number; active_version: string; source_snapshot_sha256: string; effective_catalogue_revision: string; tombstoned_live_count: number; excluded_live_count: number; active_corpus_ready: boolean; active_corpus_block_reason: string | null; corpus_candidates: Array<Record<string, unknown>> }> {
  const [settings, registry, latest, gemmaLatest, snapshot, tombstones] = await Promise.all([
    loadEmbeddingRuntimeSettings(),
    readExcludedRegistry(),
    readJson(path.join(DATA_ROOT, "datasets", "latest.json")),
    readJson(path.join(DATA_ROOT, "datasets", "embeddinggemma2-latest.json")),
    getV3SnapshotIdentity(),
    readJsonValue(path.join(DATA_ROOT, "library", "catalogue-deleted.json")),
  ]);
  const registrySha = excludedRegistrySha(registry);
  const effectiveCatalogue = await captureEffectiveCatalogue();
  const effectiveCatalogueRevision = effectiveCatalogue.revision;
  const [qwenModel, gemmaModel] = await Promise.all([getConfiguredTextIndexModel("qwen3"), getConfiguredTextIndexModel("embeddinggemma2")]);
  const versionId = String(latest?.version_id ?? "");
  const activeCount = snapshot.parameter_count;
  const activeDatasetManifest = versionId ? await readJson(path.join(DATA_ROOT, "datasets", versionId, "manifest.json")) : null;
  const activeCorpusReason = activeCorpusBlockReason(activeDatasetManifest, {
    revision: effectiveCatalogueRevision,
    parameter_count: effectiveCatalogue.parameters.length,
  });
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
  const selectExpected = currentDataset.reduce((total, row) => total + (row.ui_element !== "Range" ? declaredValueCandidates(row)?.length ?? 0 : 0), 0);
  const valueDomainGaps = currentDataset
    .filter((row) => row.ui_element !== "Range" && !declaredValueCandidates(row))
    .map((row) => ({ technical_name: String(row.technical_name ?? ""), ui_element: String(row.ui_element ?? "unknown") }))
    .filter((row) => row.technical_name)
    .sort((left, right) => left.technical_name.localeCompare(right.technical_name));
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
  const paths = artifactPaths(versionId, latest?.runtime_atom_index_path);
  const candidateRecords = await listCorpusCandidates();
  const currentCandidateRecord = candidateRecords.find((candidate) => candidate.source_revision === effectiveCatalogueRevision
    && candidate.source_snapshot_sha256 === effectiveCatalogue.contentSha256
    && candidate.model === qwenModel
    && candidate.endpoint === settings.baseUrl
    && candidate.prepare_status === "complete"
    && typeof candidate.candidate_id === "string");
  const candidates = await Promise.all(candidateRecords.map(async (candidate) => {
    if (candidate.candidate_id !== currentCandidateRecord?.candidate_id || typeof candidate.candidate_id !== "string") return candidate;
    const manifest = await readJson(path.join(DATA_ROOT, "maintenance", candidate.candidate_id, "prepared", "prepare-manifest.json"));
    const preparedInputs: string[] = [];
    let preparedInputsValid = false;
    const compositePlanPath = path.join(DATA_ROOT, "maintenance", candidate.candidate_id, "artifacts", "qwen3", "composite-index", "prepare-manifest.json");
    const compositePlan = await readJson(compositePlanPath);
    const compositeRoot = path.dirname(compositePlanPath);
    const compositeBuiltManifest = await readJson(path.join(compositeRoot, "manifest.json"));
    const compositeBuilt = (candidate.artifact_builds as Record<string, unknown> | undefined)?.composite === "complete"
      && compositeBuiltManifest?.source_revision === candidate.source_revision
      && compositeBuiltManifest?.source_snapshot_sha256 === candidate.source_snapshot_sha256
      && Number(compositeBuiltManifest?.parameter_count) === Number(candidate.source_record_count)
      && compositeBuiltManifest?.model === candidate.model
      && await artifactOutputFilesReady("composite", compositeBuiltManifest ?? {}, path.join(compositeRoot, "manifest.json"));
    const frozenVersion = await resolveFrozenCandidateVersion(path.join(DATA_ROOT, "maintenance", candidate.candidate_id, "frozen"), String(candidate.source_revision ?? ""), Number(candidate.source_record_count ?? 0)).catch(() => null);
    const frozenRoot = frozenVersion ? path.join(DATA_ROOT, "maintenance", candidate.candidate_id, "frozen", frozenVersion) : null;
    const resolvedFrozenManifest = frozenRoot ? await readJson(path.join(frozenRoot, "manifest.json")) : null;
    const frozenFilesValid = Boolean(frozenRoot && resolvedFrozenManifest?.source_revision === candidate.source_revision
      && Number(resolvedFrozenManifest?.parameter_count) === Number(candidate.source_record_count)
      && await Promise.all(["parameters.json", "atoms.json"].map(async (name) => {
        try {
          const bytes = await fs.readFile(path.join(frozenRoot, name));
          return createHash("sha256").update(bytes).digest("hex") === (resolvedFrozenManifest?.files_sha256 as Record<string, string> | undefined)?.[name];
        } catch { return false; }
      })).then((valid) => valid.every(Boolean)));
    try {
      const pinned = await loadPinnedCandidate(candidate.candidate_id);
      await verifyPreparedCandidate(path.join(pinned.candidateRoot, "prepared"), pinned.inputSha);
      preparedInputsValid = true;
      for (const entry of (manifest?.outputs as Array<{ path?: unknown }> ?? [])) {
        if (typeof entry.path === "string") preparedInputs.push(`prepared/${entry.path}`);
      }
      const inputDispositions = candidate.prepared_input_dispositions && typeof candidate.prepared_input_dispositions === "object"
        ? candidate.prepared_input_dispositions as Record<string, string> : {};
      for (const file of Array.isArray(candidate.prepared_inputs) ? candidate.prepared_inputs.map(String) : []) {
        const normalized = candidateInputPath(file);
        const disposition = inputDispositions[normalized] ?? inputDispositions[file];
        if (disposition) preparedInputs.push(normalized);
      }
      preparedInputs.push("effective-live-snapshot.json");
      const [clapInput, siglipInput, compositeRows, frozenParametersPath, frozenAtomsPath] = await Promise.all([
        readJson(path.join(pinned.candidateRoot, "prepared", "clap-input.json")),
        readJson(path.join(pinned.candidateRoot, "prepared", "siglip-input.json")),
        fs.readFile(path.join(pinned.candidateRoot, "artifacts", "qwen3", "composite-index", "rows.json")).catch(() => null),
        frozenRoot ? fs.stat(path.join(frozenRoot, "parameters.json")).catch(() => null) : Promise.resolve(null),
        frozenRoot ? fs.stat(path.join(frozenRoot, "atoms.json")).catch(() => null) : Promise.resolve(null),
      ]);
      if (clapInput?.source_revision === candidate.source_revision
        && clapInput?.source_snapshot_sha256 === candidate.source_snapshot_sha256) preparedInputs.push("prepared/clap-input.json");
      if (siglipInput?.source_revision === candidate.source_revision
        && siglipInput?.source_snapshot_sha256 === candidate.source_snapshot_sha256) preparedInputs.push("prepared/siglip-input.json");
      if ((compositePlan?.status === "prepared"
        && compositePlan.source_revision === candidate.source_revision
        && compositePlan.source_snapshot_sha256 === candidate.source_snapshot_sha256
        && compositeRows && compositePlan.rows_sha256 === createHash("sha256").update(compositeRows).digest("hex")) || compositeBuilt) {
        preparedInputs.push("artifacts/qwen3/composite-index/rows.json");
      }
      const preparedPaths = new Set(Array.isArray(manifest?.outputs)
        ? (manifest.outputs as Array<{ path?: unknown }>).map((item) => String(item.path ?? "")) : []);
      const anchorInputs = ["qwen3/anchors/axes.json", "qwen3/anchors/polarity_matrix.json", "qwen3/anchors/calibration/strong_set.json", "qwen3/anchors/calibration/neutral_set.json"];
      if (frozenFilesValid && resolvedFrozenManifest && frozenVersion && frozenParametersPath?.isFile() && frozenAtomsPath?.isFile()) {
        preparedInputs.push(`frozen/${frozenVersion}/manifest.json`, `frozen/${frozenVersion}/parameters.json`, `frozen/${frozenVersion}/atoms.json`);
      }
      const gemmaPrepareFiles = [
        "gemma2/text-index/rows.json", "gemma2/text-index/prepare-manifest.json",
        "shared/runtime-atoms/atoms.json", "shared/runtime-atoms/prepare-manifest.json",
        "gemma2/anchors/prepare-manifest.json", "shared/value-anchors/range-rows.json",
        "shared/value-anchors/select-rows.json", "shared/value-anchors/prepare-manifest.json",
        "shared/relations/relations-rows.json", "shared/relations/prepare-manifest.json",
      ];
      const gemmaPrepareManifests = await Promise.all([
        readJson(path.join(pinned.candidateRoot, "prepared", "gemma2", "text-index", "prepare-manifest.json")),
        readJson(path.join(pinned.candidateRoot, "prepared", "shared", "runtime-atoms", "prepare-manifest.json")),
        readJson(path.join(pinned.candidateRoot, "prepared", "gemma2", "anchors", "prepare-manifest.json")),
        readJson(path.join(pinned.candidateRoot, "prepared", "shared", "value-anchors", "prepare-manifest.json")),
        readJson(path.join(pinned.candidateRoot, "prepared", "shared", "relations", "prepare-manifest.json")),
      ]);
      const gemmaPrepareValid = gemmaPrepareManifests.every((entry) => entry?.status === "prepared"
        && entry?.source_revision === candidate.source_revision
        && entry?.source_snapshot_sha256 === candidate.source_snapshot_sha256);
      if (gemmaPrepareValid && await Promise.all(gemmaPrepareFiles.map(async (file) => {
        try { return (await fs.stat(path.join(pinned.candidateRoot, "prepared", file))).isFile(); } catch { return false; }
      })).then((valid) => valid.every(Boolean))) {
        preparedInputs.push(...gemmaPrepareFiles.map((file) => `prepared/${file}`));
      }
      const allInputsValid = clapInput?.source_revision === candidate.source_revision
        && siglipInput?.source_revision === candidate.source_revision
        && clapInput?.source_snapshot_sha256 === candidate.source_snapshot_sha256
        && siglipInput?.source_snapshot_sha256 === candidate.source_snapshot_sha256
        && anchorInputs.every((file) => preparedPaths.has(file))
        && ((compositePlan?.status === "prepared" && compositePlan.source_revision === candidate.source_revision
          && compositePlan.source_snapshot_sha256 === candidate.source_snapshot_sha256
          && compositeRows && compositePlan.rows_sha256 === createHash("sha256").update(compositeRows).digest("hex")) || compositeBuilt)
        && frozenFilesValid && resolvedFrozenManifest?.source_revision === candidate.source_revision
        && Number(resolvedFrozenManifest?.parameter_count) === Number(candidate.source_record_count)
        && Boolean(frozenParametersPath?.isFile()) && Boolean(frozenAtomsPath?.isFile()) && gemmaPrepareValid;
      candidate.prepared_inputs_complete = allInputsValid;
      candidate.version_id = frozenVersion ?? candidate.version_id;
    } catch { preparedInputsValid = false; }
    const uniquePreparedInputs = [...new Set(preparedInputs)];
    return { ...candidate, version_id: frozenVersion ?? candidate.version_id, prepared_inputs: uniquePreparedInputs, prepared_inputs_valid: preparedInputsValid };
  }));
  const currentCandidate = candidates.find((candidate) => candidate.candidate_id === currentCandidateRecord?.candidate_id);
  const candidateArtifactDirectory = (kind: ArtifactKind): string | null => {
    if (!currentCandidate || typeof currentCandidate.candidate_id !== "string") return null;
    if (kind === "clap" || kind === "siglip") return null;
    const family = kind === "embeddinggemma2_text" || kind.startsWith("gemma2_") ? "embeddinggemma2" : "qwen3";
    const bundleRoot = path.join(DATA_ROOT, "maintenance", currentCandidate.candidate_id, "artifacts", family);
    const directory = family === "embeddinggemma2"
      ? GEMMA_ARTIFACT_DIRECTORIES[kind as GemmaCandidateArtifactKind]
      : kind === "composite" ? "composite-index" : kind === "atoms" ? "runtime-atoms" : kind === "anchors" ? "anchors" : kind === "relations" ? "relations" : "value-anchors";
    return path.join(bundleRoot, directory);
  };
  const labels: Record<ArtifactKind, string> = {
    composite: "Qwen3 text index", embeddinggemma2_text: "EmbeddingGemma 2 text index", atoms: "Runtime atoms", anchors: "Live axes / anchors",
    range: "Range value anchors", select: "Select options", relations: "Relation anchors", clap: "CLAP audio index",
    gemma2_atoms: "Gemma 2 runtime atoms", gemma2_anchors: "Gemma 2 live axes / anchors", gemma2_range: "Gemma 2 Range value anchors",
    gemma2_select: "Gemma 2 Select options", gemma2_relations: "Gemma 2 relation anchors",
    siglip: "SigLIP2 / Morpho index",
  };
  const descriptions: Record<ArtifactKind, string> = {
    composite: "Pinned-snapshot text retrieval rows and Qwen vectors. Reuses hash-matching candidate and semantic-cache vectors; embeds only unmatched rows. Anchors, Range/Select, Relations, and runtime atoms are separate artifacts.",
    embeddinggemma2_text: "Gemma-space text retrieval vectors; audio/spec queries use this bank.",
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
    const runtimePath = path.relative(process.cwd(), path.dirname(paths[kind]));
    const candidateDirectory = candidateArtifactDirectory(kind);
    const gemmaRow = kind === "embeddinggemma2_text" || kind.startsWith("gemma2_");
    const candidateBuilds = (gemmaRow ? currentCandidate?.gemma_artifact_builds : currentCandidate?.artifact_builds) as Record<string, unknown> | undefined;
    const candidateStatus = candidateDirectory
      ? String(candidateBuilds?.[kind] ?? ((gemmaRow ? currentCandidate?.gemma_bundle_status : currentCandidate?.qwen_bundle_status) === "complete" ? "complete" : "not built"))
      : null;
    const candidatePath = candidateDirectory ? path.relative(process.cwd(), candidateDirectory) : null;
    const job = getManagedJob();
    const savedGemmaJob = gemmaRow ? (currentCandidate?.gemma_jobs as Record<string, Record<string, unknown>> | undefined)?.[kind] : null;
    const jobStatus: ArtifactStatus["job_status"] = job.running && job.stage === kind ? "running"
      : job.finished_at > 0 && job.stage === kind ? job.exit_code === 0 ? "complete" : "error"
        : savedGemmaJob?.status === "running" ? "running" : savedGemmaJob?.status === "error" ? "error" : savedGemmaJob?.status === "complete" || savedGemmaJob?.status === "vectorization_complete" ? "complete" : "idle";
    const preparedInputs = currentCandidate && Array.isArray(currentCandidate.prepared_inputs)
      ? currentCandidate.prepared_inputs as string[] : [];
    const preparedRequirements: Partial<Record<ArtifactKind, string[]>> = {
      composite: ["effective-live-snapshot.json", "composite-index/rows.json"],
      atoms: ["effective-live-snapshot.json", "atom_corpus.json", ...(typeof currentCandidate?.version_id === "string" ? [`frozen/${currentCandidate.version_id}/manifest.json`, `frozen/${currentCandidate.version_id}/parameters.json`, `frozen/${currentCandidate.version_id}/atoms.json`] : [])],
      anchors: ["effective-live-snapshot.json", "composite-index/rows.json", "qwen3/anchors/axes.json", "qwen3/anchors/polarity_matrix.json", "qwen3/anchors/calibration/strong_set.json", "qwen3/anchors/calibration/neutral_set.json"],
      range: ["effective-live-snapshot.json", "composite-index/rows.json"],
      select: ["effective-live-snapshot.json", "composite-index/rows.json"],
      relations: ["effective-live-snapshot.json"], clap: ["effective-live-snapshot.json", "clap-input.json"], siglip: ["effective-live-snapshot.json", "siglip-input.json"],
      embeddinggemma2_text: ["effective-live-snapshot.json", "gemma2/text-index/rows.json", "gemma2/text-index/prepare-manifest.json"],
      gemma2_atoms: ["effective-live-snapshot.json", "shared/runtime-atoms/atoms.json", "shared/runtime-atoms/prepare-manifest.json", ...(typeof currentCandidate?.version_id === "string" ? [`frozen/${currentCandidate.version_id}/manifest.json`, `frozen/${currentCandidate.version_id}/parameters.json`, `frozen/${currentCandidate.version_id}/atoms.json`] : [])],
      gemma2_anchors: ["effective-live-snapshot.json", "qwen3/anchors/axes.json", "qwen3/anchors/polarity_matrix.json", "qwen3/anchors/calibration/strong_set.json", "qwen3/anchors/calibration/neutral_set.json", "gemma2/anchors/prepare-manifest.json"],
      gemma2_range: ["effective-live-snapshot.json", "shared/value-anchors/range-rows.json", "shared/value-anchors/prepare-manifest.json"],
      gemma2_select: ["effective-live-snapshot.json", "shared/value-anchors/select-rows.json", "shared/value-anchors/prepare-manifest.json"],
      gemma2_relations: ["effective-live-snapshot.json", "shared/relations/relations-rows.json", "shared/relations/prepare-manifest.json"],
    };
    const preparedInputsForRow = preparedRequirements[kind]?.map((file) => file.startsWith("composite-index/")
      ? `artifacts/qwen3/${file}` : candidateInputPath(file)) ?? [];
    const missingPreparedInputs = preparedInputsForRow.filter((file) => !preparedInputs.includes(file));
    const gemmaActionBlock: string[] = [];
    const missingDependencies = [
        ...(!currentCandidate?.prepared_inputs_valid ? ["prepared inputs failed read-back verification; run Prepare"] : []),
        ...missingPreparedInputs,
        ...(kind === "atoms" && typeof currentCandidate?.version_id !== "string" ? ["Run Prepare to create the pinned current-source package for Runtime atoms"] : []),
        ...(["anchors", "range", "select"].includes(kind) && (currentCandidate?.artifact_builds as Record<string, unknown> | undefined)?.composite !== "complete" ? ["Build Qwen3 text index row first"] : []),
        ...(kind === "gemma2_atoms" && typeof currentCandidate?.version_id !== "string" ? ["Run Prepare to create the pinned current-source package for Gemma Runtime atoms"] : []),
        ...(["gemma2_anchors", "gemma2_range", "gemma2_select"].includes(kind) && (currentCandidate?.gemma_artifact_builds as Record<string, unknown> | undefined)?.embeddinggemma2_text !== "complete" ? ["Build EmbeddingGemma 2 text index row first"] : []),
        ...gemmaActionBlock,
      ];
    const inputDispositions = currentCandidate?.prepared_input_dispositions && typeof currentCandidate.prepared_input_dispositions === "object"
      ? currentCandidate.prepared_input_dispositions as Record<string, string> : {};
    const rowInputDispositions = Object.fromEntries(preparedInputsForRow.map((file) => [
      file,
      preparedInputs.includes(file) ? inputDispositions[file] ?? "verified" : "missing",
    ]));
    if (!manifest) return { kind, label: labels[kind], description: descriptions[kind], status: "missing", built_at: null, model: null, dimensions: null, parameter_count: 0, added_since_build: activeCount, excluded_since_build: registry.entries.length, reason: "manifest not found at runtime path", fingerprint: null, data_fingerprint: null, vector_fingerprint: null, row_count: 0, expected_count: expectedForKind(kind), embeddings_reused: null, embeddings_computed: null, runtime_path: runtimePath, runtime_in_use: false, source_freshness: "unknown", vectors_ready: false, job_status: jobStatus, candidate_status: candidateStatus, candidate_path: candidatePath, prepared_inputs: currentCandidate ? preparedInputsForRow : [], prepared_input_dispositions: rowInputDispositions, preparation_fingerprint: currentCandidate?.source_snapshot_sha256 as string | null ?? null, snapshot_file_fingerprint: currentCandidate?.snapshot_file_sha256 as string | null ?? null, missing_dependencies: missingDependencies };
    const model = String(manifest.model ?? manifest.model_id ?? "") || null;
    const dimensions = Number(manifest.dimensions ?? manifest.dim ?? 0) || null;
    const count = Number(manifest.parameter_count ?? manifest.count ?? manifest.atom_count ?? 0);
    const vectorOrigins = manifest.vector_origins && typeof manifest.vector_origins === "object"
      ? Object.entries(manifest.vector_origins as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      : [];
    const reusedByOrigin = vectorOrigins.filter(([origin]) => origin !== "ollama").reduce((sum, [, value]) => sum + value, 0);
    const computedByOrigin = vectorOrigins.find(([origin]) => origin === "ollama")?.[1];
    const builtRegistrySha = String(manifest.excluded_sha256 ?? "");
    const isGemma = kind === "embeddinggemma2_text" || kind.startsWith("gemma2_");
    const expectedModel = kind === "clap" || kind === "siglip" ? model : isGemma ? gemmaModel : qwenModel;
    const modelMismatch = kind !== "clap" && kind !== "siglip" && model !== expectedModel;
    const expectedDimensions = kind === "siglip" ? 768 : isGemma ? 768 : 1024;
    const dimensionMismatch = kind !== "clap" && dimensions !== null && dimensions !== expectedDimensions;
    const siglipRevisionMismatch = kind === "siglip" && manifest.model_revision !== "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2";
    const registryMismatch = builtRegistrySha !== registrySha;
    const expectedGemmaVersion = String(gemmaLatest?.version_id ?? "");
    const bundleCandidateId = (pointer: Record<string, unknown> | null, field: string) => {
      const relative = pointer?.[field];
      if (typeof relative !== "string" || !relative) return "";
      return path.basename(path.dirname(path.dirname(path.resolve(DATA_ROOT, relative))));
    };
    const activeBundleId = bundleCandidateId(isGemma ? gemmaLatest : latest, isGemma ? "gemma_bundle_path" : "qwen_bundle_path");
    const versionMismatch = !artifactDatasetVersionMatches(kind, manifest, versionId, expectedGemmaVersion, effectiveCatalogueRevision);
    const atomSourceMismatch = kind === "atoms" && String(manifest.effective_catalogue_revision ?? "") !== effectiveCatalogueRevision;
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
    const domainIncomplete = (kind === "select" || kind === "gemma2_select") && valueDomainGaps.length > 0;
    const partial = rowCount < expectedCount || domainIncomplete;
    const rowCountMismatch = rowCount !== expectedCount;
    const dataFingerprintMismatch = !kind.includes("atoms") && Boolean(manifest.source_snapshot_sha256) && String(manifest.source_snapshot_sha256) !== snapshot.content_sha256;
    const valueSelectionKind = ["composite", "range", "select", "embeddinggemma2_text", "gemma2_range", "gemma2_select"].includes(kind);
    const contractMismatch = valueSelectionKind && (
      !activeBundleId || manifest.value_selection_bundle_id !== activeBundleId
      || ((kind === "range" || kind === "select" || kind === "gemma2_range" || kind === "gemma2_select")
        && (Number(manifest.selection_contract_version) !== 2 || Number(manifest.candidate_text_version) !== 2 || !manifest.embedding_preprocessing_version))
      || ((kind === "composite" || kind === "embeddinggemma2_text") && !manifest.embedding_preprocessing_version)
    );
    let fileIntegrityMismatch = false;
    let integrityUnverified = false;
    if (kind === "atoms" || kind === "gemma2_atoms") {
      const rowsPath = path.join(path.dirname(paths[kind]), "atoms.json");
      const vectorsPath = path.join(path.dirname(paths[kind]), "atom_embeddings.f32");
      if (typeof manifest.rows_sha256 === "string" && typeof manifest.vectors_sha256 === "string") {
        try {
          const [rowsBytes, vectorBytes] = await Promise.all([fs.readFile(rowsPath), fs.readFile(vectorsPath)]);
          fileIntegrityMismatch = createHash("sha256").update(rowsBytes).digest("hex") !== manifest.rows_sha256
            || createHash("sha256").update(vectorBytes).digest("hex") !== manifest.vectors_sha256;
        } catch { fileIntegrityMismatch = true; }
      } else {
        integrityUnverified = true;
      }
    }
    const reason = [modelMismatch ? `model ${model} ≠ ${expectedModel}` : "", dimensionMismatch ? `dimensions ${dimensions} ≠ ${expectedDimensions}` : "", registryMismatch ? "registry changed" : "", versionMismatch || dataFingerprintMismatch || atomSourceMismatch ? "source data changed" : "", countMismatch ? `library count ${activeCount} ≠ indexed ${sourceCount}` : "", contractMismatch ? "value-selection bundle/contract mismatch; rebuild and connect the current candidate in Service Bay" : "", domainIncomplete ? `no declared value domain for ${valueDomainGaps.length} parameter(s): ${valueDomainGaps.map((item) => item.technical_name).join(", ")}` : "", rowCountMismatch ? `rows ${rowCount} ≠ expected ${expectedCount}` : "", fileIntegrityMismatch ? "runtime rows/vectors hash mismatch" : "", integrityUnverified ? "runtime rows/vectors integrity not verified (legacy manifest)" : ""].filter(Boolean).join("; ") || null;
    const vectorsReady = await artifactOutputFilesReady(kind, manifest, paths[kind]);
    const artifactState: ArtifactStatus["status"] = partial ? "partial" : modelMismatch || dimensionMismatch || siglipRevisionMismatch || contractMismatch || fileIntegrityMismatch || !vectorsReady ? "stale_vectors" : registryMismatch || versionMismatch || atomSourceMismatch || countMismatch || dataFingerprintMismatch || rowCountMismatch || integrityUnverified ? "stale_data" : "ready";
    return {
      kind, label: labels[kind], description: descriptions[kind], status: artifactState,
      built_at: String(manifest.created_at ?? manifest.generated_at ?? "") || null,
      model, dimensions, parameter_count: count,
      added_since_build: Math.max(0, activeCount - sourceCount),
      excluded_since_build: registryMismatch ? registry.entries.length : 0,
      reason,
      fingerprint: String(manifest.cache_sha256 ?? manifest.source_snapshot_sha256 ?? "") || null,
      data_fingerprint: String(kind === "atoms" ? manifest.effective_catalogue_revision ?? manifest.source_snapshot_sha256 ?? "" : manifest.source_snapshot_sha256 ?? manifest.dataset_version ?? manifest.version_id ?? "") || null,
      vector_fingerprint: String(manifest.vector_fingerprint ?? manifest.cache_sha256 ?? manifest.source_fingerprint ?? manifest.model_revision ?? "") || null,
      row_count: rowCount,
      expected_count: expectedCount,
      embeddings_reused: Number.isFinite(Number(manifest.reused_count ?? manifest.reused)) ? Number(manifest.reused_count ?? manifest.reused) : vectorOrigins.length ? reusedByOrigin : null,
      embeddings_computed: Number.isFinite(Number(manifest.embedded_count ?? manifest.encoded)) ? Number(manifest.embedded_count ?? manifest.encoded) : computedByOrigin ?? null,
      runtime_path: runtimePath,
      runtime_in_use: artifactState === "ready",
      source_freshness: artifactState === "ready" ? "current" : "stale",
      vectors_ready: vectorsReady,
      job_status: jobStatus,
      candidate_status: candidateStatus,
      candidate_path: candidatePath,
      prepared_inputs: currentCandidate ? preparedInputsForRow : [],
      prepared_input_dispositions: rowInputDispositions,
      preparation_fingerprint: currentCandidate?.source_snapshot_sha256 as string | null ?? null,
      snapshot_file_fingerprint: currentCandidate?.snapshot_file_sha256 as string | null ?? null,
      missing_dependencies: missingDependencies,
    };
  }));
  const banks: BankStatus[] = [
    { mode_id: "text.qwen.resolved", input: "text", encoder: "Qwen3", value_policy: "embedding retrieval + typed value candidates", dependencies: ["composite", "range", "select"] },
    { mode_id: "text.gemma.awtd", input: "text", encoder: "EmbeddingGemma 2", value_policy: "embedding retrieval + typed value candidates", dependencies: ["embeddinggemma2_text", "gemma2_range", "gemma2_select"] },
    { mode_id: "text.gemma.resolved", input: "text", encoder: "EmbeddingGemma 2", value_policy: "Gemma embedding selection", dependencies: ["embeddinggemma2_text", "gemma2_range", "gemma2_select"] },
    { mode_id: "audio.clap.resolved", input: "audio", encoder: "CLAP", value_policy: "values", dependencies: ["clap"] },
    { mode_id: "audio.gemma.awtd", input: "audio", encoder: "EmbeddingGemma 2", value_policy: "audio embedding + typed value candidates", dependencies: ["embeddinggemma2_text", "gemma2_range", "gemma2_select"] },
    { mode_id: "audio.gemma.resolved", input: "audio", encoder: "EmbeddingGemma 2", value_policy: "Gemma audio embedding selection", dependencies: ["embeddinggemma2_text", "gemma2_range", "gemma2_select"] },
    { mode_id: "spec.siglip.resolved", input: "spectrogram", encoder: "SigLIP2", value_policy: "values", dependencies: ["siglip"] },
    { mode_id: "spec.gemma.*", input: "spectrogram", encoder: "EmbeddingGemma 2", value_policy: "stub / partial", dependencies: ["embeddinggemma2_text"] },
  ].map((bank) => {
    const existing = bank.dependencies.map((kind) => artifacts.find((item) => item.kind === kind)).filter(Boolean);
    const unready = existing.filter((item) => item && item.status !== "ready" && item.status !== "built");
    const selectionRelevant = bank.mode_id === "text.qwen.resolved" || bank.mode_id.startsWith("text.gemma.") || bank.mode_id.startsWith("audio.gemma.");
    const status: BankStatus["status"] = bank.mode_id === "spec.gemma.*" ? "partial" : !unready.length && !(selectionRelevant && valueDomainGaps.length) ? "ready" : unready.some((item) => item?.status === "stale_vectors") ? "stale_vectors" : unready.some((item) => item?.status === "stale_data") ? "stale_data" : unready.some((item) => item?.status === "partial") || selectionRelevant && valueDomainGaps.length > 0 ? "partial" : "missing";
    const dependencyState = unready.map((item) => `${item?.kind}: ${item?.status}`);
    return {
      ...bank,
      status,
      dependencies: dependencyState.length ? [...bank.dependencies, ...dependencyState] : bank.dependencies,
      ...(selectionRelevant && valueDomainGaps.length ? { reason: `${valueDomainGaps.length} parameter(s) have no declared value domain; no value is emitted for those rows.`, value_domain_gaps: valueDomainGaps } : {}),
    };
  });
  return { artifacts, banks, active_model: qwenModel, active_endpoint: settings.baseUrl, registry_sha256: registrySha, active_parameters: activeCount, active_version: versionId, source_snapshot_sha256: snapshot.content_sha256, effective_catalogue_revision: effectiveCatalogueRevision, tombstoned_live_count: effectiveCatalogue.tombstonedLive.length, excluded_live_count: effectiveCatalogue.excludedLive.length, active_corpus_ready: activeCorpusReason === null, active_corpus_block_reason: activeCorpusReason, corpus_candidates: candidates };
}
