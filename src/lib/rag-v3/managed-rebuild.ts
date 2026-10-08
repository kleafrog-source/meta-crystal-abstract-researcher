import { ChildProcess, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { loadEmbeddingRuntimeSettings, embeddingProcessEnv } from "@/lib/embedding-settings";
import { excludedRegistrySha, readExcludedRegistry } from "@/lib/combinatorial-genesis/registry";

export type RebuildKind = "composite" | "atoms" | "anchors" | "range" | "select" | "relations" | "clap" | "all_qwen";
export type ArtifactKind = Exclude<RebuildKind, "all_qwen">;

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
  status: "built" | "not_built" | "stale";
  built_at: string | null;
  model: string | null;
  dimensions: number | null;
  parameter_count: number;
  added_since_build: number;
  excluded_since_build: number;
  reason: string | null;
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

async function command(kind: ArtifactKind): Promise<{ args: string[]; env: NodeJS.ProcessEnv }> {
  const settings = await loadEmbeddingRuntimeSettings();
  const env = embeddingProcessEnv(settings);
  const anchoring = path.join(V3_ROOT, "anchoring");
  const valueArgs = [
    "-u", "python_engine/anchoring_v3/build_value_anchors.py",
    "--dataset", path.join(V3_ROOT, "dataset.json"),
    "--output", path.join(V3_ROOT, "value-anchors"),
    "--endpoint", settings.baseUrl, "--model", settings.model,
  ];
  const specs: Record<ArtifactKind, string[]> = {
    composite: ["-u", "python_engine/build-genesis-v3-composite-index.py", "--endpoint", settings.baseUrl, "--model", settings.model],
    atoms: ["-u", "python_engine/build-combinatorial-runtime-index.py", "--endpoint", settings.baseUrl, "--model", settings.model],
    anchors: [
      "-u", "python_engine/anchoring_v3/build_anchors.py",
      "--endpoint", settings.baseUrl, "--model", settings.model,
      "--dataset", path.join(V3_ROOT, "dataset.json"),
      "--axes", path.join(anchoring, "axes.json"),
      "--polarity", path.join(anchoring, "polarity_matrix.json"),
      "--strong", path.join(anchoring, "calibration", "strong_set.json"),
      "--neutral", path.join(anchoring, "calibration", "neutral_set.json"),
      "--out", path.join(anchoring, "anchors_build.json"),
      "--param-rows", path.join(V3_ROOT, "composite-index", "rows.json"),
      "--param-embeddings", path.join(V3_ROOT, "composite-index", "embeddings.f32"),
    ],
    range: [...valueArgs, "--target", "range"],
    select: [...valueArgs, "--target", "select"],
    relations: [
      "-u", "python_engine/anchoring_v3/build_relation_anchors.py",
      "--dataset", path.join(V3_ROOT, "dataset.json"),
      "--output", path.join(V3_ROOT, "relations"),
      "--endpoint", settings.baseUrl, "--model", settings.model,
    ],
    clap: ["-u", "python_engine/sidecar.py", "audio_index"],
  };
  return { args: specs[kind], env };
}

async function runStage(kind: ArtifactKind, job: ManagedJob): Promise<number> {
  job.stage = kind;
  const spec = await command(kind);
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
  const job = idle();
  job.running = true;
  job.kind = kind;
  job.started_at = Date.now();
  shared.__ragV3ManagedJob = job;
  const stages: ArtifactKind[] = kind === "all_qwen"
    ? ["composite", "atoms", "anchors", "range", "select", "relations"]
    : [kind];
  void (async () => {
    let exitCode = 0;
    for (const stage of stages) {
      if (job.stop_requested) { exitCode = 130; break; }
      exitCode = await runStage(stage, job);
      if (exitCode !== 0) break;
    }
    job.running = false;
    job.exit_code = exitCode;
    job.finished_at = Date.now();
    shared.__ragV3ManagedChild = null;
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

export async function getArtifactStatuses(): Promise<{ artifacts: ArtifactStatus[]; active_model: string; registry_sha256: string; active_parameters: number }> {
  const [settings, registry, latest] = await Promise.all([
    loadEmbeddingRuntimeSettings(),
    readExcludedRegistry(),
    readJson(path.join(DATA_ROOT, "datasets", "latest.json")),
  ]);
  const registrySha = excludedRegistrySha(registry);
  const versionId = String(latest?.version_id ?? "");
  const dataset = await readJson(path.join(V3_ROOT, "dataset.json")) as unknown as Array<{ technical_name: string }> | null;
  const activeCount = Math.max(0, (dataset?.length ?? 0) - registry.entries.length);
  const paths: Record<ArtifactKind, string> = {
    composite: path.join(V3_ROOT, "composite-index", "manifest.json"),
    atoms: path.join(DATA_ROOT, "indexes", versionId, "manifest.json"),
    anchors: path.join(V3_ROOT, "anchoring", "anchors_build.json"),
    range: path.join(V3_ROOT, "value-anchors", "manifest.json"),
    select: path.join(V3_ROOT, "value-anchors", "select-options.json"),
    relations: path.join(V3_ROOT, "relations", "manifest.json"),
    clap: path.join(DATA_ROOT, "audio-clap-index", "index.json"),
  };
  const labels: Record<ArtifactKind, string> = {
    composite: "Qwen composite", atoms: "Runtime atoms", anchors: "Live axes / anchors",
    range: "Range value anchors", select: "Select options", relations: "Relation anchors", clap: "CLAP audio index",
  };
  const composite = await readJson(paths.composite);
  const compositeDimensions = Number(composite?.dimensions ?? 0);
  const artifacts = await Promise.all((Object.keys(paths) as ArtifactKind[]).map(async (kind): Promise<ArtifactStatus> => {
    const manifest = await readJson(paths[kind]);
    if (!manifest) return { kind, label: labels[kind], status: "not_built", built_at: null, model: null, dimensions: null, parameter_count: 0, added_since_build: activeCount, excluded_since_build: registry.entries.length, reason: "manifest not found" };
    const model = String(manifest.model ?? "") || null;
    const dimensions = Number(manifest.dimensions ?? manifest.dim ?? 0) || null;
    const count = Number(manifest.parameter_count ?? manifest.source_parameter_count ?? manifest.count ?? manifest.atom_count ?? 0);
    const builtRegistrySha = String(manifest.excluded_sha256 ?? "");
    const modelMismatch = kind !== "clap" && model !== settings.model;
    const dimensionMismatch = kind !== "clap" && kind !== "composite" && Boolean(compositeDimensions && dimensions && dimensions !== compositeDimensions);
    const registryMismatch = builtRegistrySha !== registrySha;
    const versionMismatch = (kind === "composite" && String(manifest.dataset_version ?? "") !== versionId)
      || (kind === "atoms" && String(manifest.version_id ?? "") !== versionId);
    const stale = modelMismatch || dimensionMismatch || registryMismatch || versionMismatch;
    const reason = [modelMismatch ? `model ${model} ≠ ${settings.model}` : "", dimensionMismatch ? `dimensions ${dimensions} ≠ ${compositeDimensions}` : "", registryMismatch ? "registry changed" : "", versionMismatch ? "dataset changed" : ""].filter(Boolean).join("; ") || null;
    const sourceCount = Number(manifest.source_parameter_count ?? manifest.parameter_count ?? activeCount);
    return {
      kind, label: labels[kind], status: stale ? "stale" : "built",
      built_at: String(manifest.created_at ?? manifest.generated_at ?? "") || null,
      model, dimensions, parameter_count: count,
      added_since_build: Math.max(0, activeCount - sourceCount),
      excluded_since_build: registryMismatch ? registry.entries.length : 0,
      reason,
    };
  }));
  return { artifacts, active_model: settings.model, registry_sha256: registrySha, active_parameters: activeCount };
}
