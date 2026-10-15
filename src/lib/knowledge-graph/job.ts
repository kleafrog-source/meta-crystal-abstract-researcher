import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";

const ROOT = process.cwd();
const GRAPH_PATH = path.join(
  ROOT,
  "data",
  "combinatorial-genesis",
  "knowledge-graph",
  "graph.json",
);
const COMPOSITE_MANIFEST = path.join(
  ROOT,
  "data",
  "combinatorial-genesis",
  "v3",
  "composite-index",
  "manifest.json",
);
const SCRIPT = path.join(ROOT, "python_engine", "knowledge_graph.py");

export interface KnowledgeGraphJob {
  running: boolean;
  pid: number | null;
  started_at: number;
  finished_at: number;
  exit_code: number | null;
  stop_requested: boolean;
  last_error: string | null;
  progress: { stage: string | null; current: number; total: number };
  log_tail: string[];
}
const idle = (): KnowledgeGraphJob => ({
  running: false,
  pid: null,
  started_at: 0,
  finished_at: 0,
  exit_code: null,
  stop_requested: false,
  last_error: null,
  progress: { stage: null, current: 0, total: 0 },
  log_tail: [],
});
const shared = globalThis as typeof globalThis & {
  __knowledgeGraphJob?: KnowledgeGraphJob;
  __knowledgeGraphChild?: ChildProcess | null;
};
if (!shared.__knowledgeGraphJob) shared.__knowledgeGraphJob = idle();

function append(chunk: string) {
  const job = shared.__knowledgeGraphJob!;
  for (const raw of chunk.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line) as {
        event?: string;
        stage?: string;
        current?: number;
        total?: number;
      };
      if (event.event === "progress")
        job.progress = {
          stage: event.stage ?? null,
          current: Number(event.current ?? 0),
          total: Number(event.total ?? 0),
        };
    } catch {
      /* retain diagnostic line */
    }
    job.log_tail.push(line.slice(0, 4000));
  }
  job.log_tail = job.log_tail.slice(-60);
}
async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}
export function getKnowledgeGraphJob() {
  const job = shared.__knowledgeGraphJob!;
  return { ...job, progress: { ...job.progress }, log_tail: [...job.log_tail] };
}

export async function startKnowledgeGraphJob() {
  if (shared.__knowledgeGraphJob!.running)
    return {
      started: false,
      reason: "already_running",
      job: getKnowledgeGraphJob(),
    };
  const job = idle();
  job.running = true;
  job.started_at = Date.now();
  shared.__knowledgeGraphJob = job;
  const child = spawn(
    process.env.PYTHON_EXECUTABLE || "python",
    ["-u", SCRIPT],
    {
      cwd: ROOT,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  shared.__knowledgeGraphChild = child;
  job.pid = child.pid ?? null;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (value) => append(String(value)));
  child.stderr?.on("data", (value) => {
    append(String(value));
    job.last_error = String(value).trim() || job.last_error;
  });
  child.on("error", (error) => {
    job.last_error = error.message;
    job.running = false;
    job.exit_code = -1;
    job.finished_at = Date.now();
    shared.__knowledgeGraphChild = null;
  });
  child.on("close", (code) => {
    job.running = false;
    job.exit_code = code;
    job.finished_at = Date.now();
    if (code !== 0 && !job.stop_requested && !job.last_error)
      job.last_error = `process exited with ${code}`;
    shared.__knowledgeGraphChild = null;
  });
  return { started: true, job: getKnowledgeGraphJob() };
}
export async function stopKnowledgeGraphJob() {
  const child = shared.__knowledgeGraphChild;
  const job = shared.__knowledgeGraphJob!;
  if (!job.running || !child?.pid)
    return {
      stopped: false,
      reason: "not_running",
      job: getKnowledgeGraphJob(),
    };
  job.stop_requested = true;
  if (process.platform === "win32")
    await new Promise<void>((resolve) =>
      execFile(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
        () => resolve(),
      ),
    );
  else child.kill("SIGTERM");
  return { stopped: true, job: getKnowledgeGraphJob() };
}
export async function getKnowledgeGraphStatus() {
  const [graph, composite, snapshot] = await Promise.all([
    readJson(GRAPH_PATH),
    readJson(COMPOSITE_MANIFEST),
    getV3SnapshotIdentity(),
  ]);
  const manifest = graph?.manifest as Record<string, unknown> | undefined;
  const stale: string[] = [];
  if (Number(composite?.parameter_count ?? -1) !== snapshot.parameter_count)
    stale.push("composite parameter count changed");
  if (graph) {
    if (
      String(manifest?.source_snapshot_sha256 ?? "") !== snapshot.content_sha256
    )
      stale.push("V3 dataset changed");
    if (
      String(manifest?.composite_index_sha256 ?? "") !==
      String(composite?.cache_sha256 ?? "")
    )
      stale.push("composite index changed");
    if (String(manifest?.excluded_sha256 ?? "") !== snapshot.excluded_sha256)
      stale.push("excluded registry changed");
  }
  return {
    status: stale.length ? "stale" : graph ? "ready" : "not_built",
    stale_reasons: [...new Set(stale)],
    snapshot,
    manifest: manifest ?? null,
    summary: graph?.summary ?? null,
    job: getKnowledgeGraphJob(),
  };
}
