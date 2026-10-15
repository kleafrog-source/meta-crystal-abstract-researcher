import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";

const ROOT = process.cwd();
const DATA_ROOT = path.join(ROOT, "data", "combinatorial-genesis");
const REPORT_PATH = path.join(DATA_ROOT, "white-space", "report.json");
const GRAPH_PATH = path.join(DATA_ROOT, "knowledge-graph", "graph.json");
const SCRIPT = path.join(ROOT, "python_engine", "white_space_discovery.py");

export interface WhiteSpaceJob {
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

const idle = (): WhiteSpaceJob => ({
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
  __whiteSpaceJob?: WhiteSpaceJob;
  __whiteSpaceChild?: ChildProcess | null;
};
if (!shared.__whiteSpaceJob) shared.__whiteSpaceJob = idle();

function append(chunk: string) {
  const job = shared.__whiteSpaceJob!;
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
      /* Non-event output remains visible. */
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
async function fileSha(file: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex");
  } catch {
    return null;
  }
}

export function getWhiteSpaceJob(): WhiteSpaceJob {
  const job = shared.__whiteSpaceJob!;
  return { ...job, progress: { ...job.progress }, log_tail: [...job.log_tail] };
}

export async function startWhiteSpaceJob() {
  if (shared.__whiteSpaceJob!.running)
    return {
      started: false,
      reason: "already_running",
      job: getWhiteSpaceJob(),
    };
  const job = idle();
  job.running = true;
  job.started_at = Date.now();
  shared.__whiteSpaceJob = job;
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
  shared.__whiteSpaceChild = child;
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
    shared.__whiteSpaceChild = null;
  });
  child.on("close", (code) => {
    job.running = false;
    job.exit_code = code;
    job.finished_at = Date.now();
    if (code !== 0 && !job.stop_requested && !job.last_error)
      job.last_error = `process exited with ${code}`;
    shared.__whiteSpaceChild = null;
  });
  return { started: true, job: getWhiteSpaceJob() };
}

export async function stopWhiteSpaceJob() {
  const child = shared.__whiteSpaceChild;
  const job = shared.__whiteSpaceJob!;
  if (!job.running || !child?.pid)
    return { stopped: false, reason: "not_running", job: getWhiteSpaceJob() };
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
  return { stopped: true, job: getWhiteSpaceJob() };
}

export async function getWhiteSpaceStatus() {
  const [report, composite, graph, graphSha, snapshot] = await Promise.all([
    readJson(REPORT_PATH),
    readJson(path.join(DATA_ROOT, "v3", "composite-index", "manifest.json")),
    readJson(GRAPH_PATH),
    fileSha(GRAPH_PATH),
    getV3SnapshotIdentity(),
  ]);
  const staleReasons: string[] = [];
  if (Number(composite?.parameter_count ?? -1) !== snapshot.parameter_count)
    staleReasons.push(
      `composite has ${composite?.parameter_count ?? 0} rows; V3 has ${snapshot.parameter_count}`,
    );
  if (String(composite?.dataset_version ?? "") !== snapshot.dataset_version)
    staleReasons.push("composite dataset version changed");
  if (String(composite?.excluded_sha256 ?? "") !== snapshot.excluded_sha256)
    staleReasons.push("composite excluded registry changed");
  if (report) {
    if (String(report.source_snapshot_sha256 ?? "") !== snapshot.content_sha256)
      staleReasons.push("V3 dataset changed");
    if (
      String(report.composite_index_sha256 ?? "") !==
      String(composite?.cache_sha256 ?? "")
    )
      staleReasons.push("composite index changed");
    if (String(report.excluded_sha256 ?? "") !== snapshot.excluded_sha256)
      staleReasons.push("excluded registry changed");
    if (report.knowledge_graph_sha256 && !graph)
      staleReasons.push("knowledge graph is missing");
    if (
      report.knowledge_graph_sha256 &&
      String(report.knowledge_graph_sha256) !== graphSha
    )
      staleReasons.push("knowledge graph changed");
  }
  return {
    status: staleReasons.length ? "stale" : !report ? "not_built" : "ready",
    stale_reasons: [...new Set(staleReasons)],
    snapshot,
    report,
    job: getWhiteSpaceJob(),
  };
}
