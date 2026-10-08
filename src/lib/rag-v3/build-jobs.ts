import { spawn } from "node:child_process";
import path from "node:path";

import { embeddingProcessEnv, loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";

export interface V3BuildJobState {
  running: boolean;
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
  lastError: string | null;
  logTail: string[];
  progress: { stage: string | null; current: number; total: number; label: string | null };
}

function idle(): V3BuildJobState {
  return { running: false, startedAt: 0, finishedAt: 0, exitCode: null, lastError: null, logTail: [], progress: { stage: null, current: 0, total: 0, label: null } };
}

interface V3GlobalJobState {
  index: V3BuildJobState;
  anchors: V3BuildJobState;
}

const shared = globalThis as typeof globalThis & { __ragV3BuildJobs?: V3GlobalJobState };
const jobs = shared.__ragV3BuildJobs ?? { index: idle(), anchors: idle() };
shared.__ragV3BuildJobs = jobs;
const progressPattern = /^\[progress\]\s+stage=(\S+)\s+current=(\d+)\s+total=(\d+)\s+label=(.*)$/;

function append(state: V3BuildJobState, chunk: string) {
  for (const line of chunk.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const match = line.match(progressPattern);
    if (match) state.progress = { stage: match[1], current: Number(match[2]), total: Number(match[3]), label: match[4] };
    state.logTail.push(line.length > 4_000 ? `${line.slice(0, 4_000)}…` : line);
  }
  state.logTail = state.logTail.slice(-30);
}

function start(kind: "index" | "anchors", command: string, args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()) {
  const current = jobs[kind];
  if (current.running) return { started: false, reason: "already_running" };
  const state = idle();
  state.running = true;
  state.startedAt = Date.now();
  jobs[kind] = state;
  const child = spawn(command, args, {
    cwd,
    windowsHide: true,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => append(state, chunk));
  child.stderr.on("data", (chunk) => { append(state, chunk); state.lastError = chunk.trim() || state.lastError; });
  child.on("error", (error) => { state.running = false; state.finishedAt = Date.now(); state.exitCode = -1; state.lastError = error.message; });
  child.on("close", (code) => { state.running = false; state.finishedAt = Date.now(); state.exitCode = code; if (code !== 0 && !state.lastError) state.lastError = `process exited with ${code}`; });
  return { started: true };
}

export async function startV3IndexBuild() {
  const settings = await loadEmbeddingRuntimeSettings();
  return start("index", process.env.PYTHON_EXECUTABLE || "python", ["-u", "python_engine/run-combinatorial-pipeline.py"], embeddingProcessEnv(settings));
}

export async function startV3AnchorsBuild() {
  const settings = await loadEmbeddingRuntimeSettings();
  const artifacts = path.join(process.cwd(), "data", "combinatorial-genesis", "v3");
  const anchoring = path.join(artifacts, "anchoring");
  return start("anchors", process.env.PYTHON_EXECUTABLE || "python", [
    "-u", "python_engine/anchoring_v3/build_anchors.py",
    "--endpoint", settings.baseUrl,
    "--model", settings.model,
    "--dataset", path.join(artifacts, "dataset.json"),
    "--axes", path.join(anchoring, "axes.json"),
    "--polarity", path.join(anchoring, "polarity_matrix.json"),
    "--strong", path.join(anchoring, "calibration", "strong_set.json"),
    "--neutral", path.join(anchoring, "calibration", "neutral_set.json"),
    "--out", path.join(anchoring, "anchors_build.json"),
    "--param-rows", path.join(artifacts, "composite-index", "rows.json"),
    "--param-embeddings", path.join(artifacts, "composite-index", "embeddings.f32"),
  ], embeddingProcessEnv(settings));
}

export function getV3IndexJob() { return { ...jobs.index, logTail: [...jobs.index.logTail], progress: { ...jobs.index.progress } }; }
export function getV3AnchorsJob() { return { ...jobs.anchors, logTail: [...jobs.anchors.logTail], progress: { ...jobs.anchors.progress } }; }
