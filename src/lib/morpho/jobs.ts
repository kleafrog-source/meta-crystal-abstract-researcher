import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { getV3SnapshotIdentity } from "@/lib/rag-v3/snapshot";
import { GENESIS_DATA_ROOT, GENESIS_LIBRARY_PATH } from "@/lib/combinatorial-genesis/library";
import { GENESIS_EXCLUDED_PATH } from "@/lib/combinatorial-genesis/registry";

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "python_engine", "morpho_siglip.py");
const INDEX_DIR = path.join(
  ROOT,
  "data",
  "combinatorial-genesis",
  "morpho-siglip",
);
const MANIFEST = path.join(INDEX_DIR, "manifest.json");
const MODEL_PATH =
  process.env.MMSS_SIGLIP_MODEL || "D:/hfmodels/siglip2-base-patch16-224";
const PYTHON = process.env.PYTHON_EXECUTABLE || "python";
const LATEST_DATASET = path.join(GENESIS_DATA_ROOT, "datasets", "latest.json");
let snapshotCache: { signature: string; identity: Awaited<ReturnType<typeof getV3SnapshotIdentity>> } | null = null;
type Kind = "index" | "search";
interface Job {
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
const idle = (): Job => ({
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
  __morphoJobs?: Record<Kind, Job>;
  __morphoChildren?: Partial<Record<Kind, ChildProcess>>;
};
if (!shared.__morphoJobs)
  shared.__morphoJobs = { index: idle(), search: idle() };
if (!shared.__morphoChildren) shared.__morphoChildren = {};

function env() {
  return {
    ...process.env,
    CUDA_VISIBLE_DEVICES: "",
    PYTHONUTF8: "1",
    HF_HOME: process.env.HF_HOME || "D:/hfmodels",
    HUGGINGFACE_HUB_CACHE:
      process.env.HUGGINGFACE_HUB_CACHE || "D:/hfmodels/hub",
  };
}
function append(kind: Kind, chunk: string) {
  const job = shared.__morphoJobs![kind];
  for (const raw of chunk.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (event.event === "progress")
        job.progress = {
          stage: event.stage ?? null,
          current: Number(event.current ?? 0),
          total: Number(event.total ?? 0),
        };
    } catch {
      /* diagnostic output */
    }
    job.log_tail.push(line.slice(0, 4000));
  }
  job.log_tail = job.log_tail.slice(-60);
}
export function getMorphoJob(kind: Kind) {
  const job = shared.__morphoJobs![kind];
  return { ...job, progress: { ...job.progress }, log_tail: [...job.log_tail] };
}
function start(kind: Kind, args: string[]) {
  if (shared.__morphoJobs![kind].running)
    return {
      started: false,
      reason: "already_running",
      job: getMorphoJob(kind),
    };
  const job = idle();
  job.running = true;
  job.started_at = Date.now();
  shared.__morphoJobs![kind] = job;
  const child = spawn(
    PYTHON,
    ["-u", SCRIPT, ...args, "--model-path", MODEL_PATH],
    {
      cwd: ROOT,
      windowsHide: true,
      env: env(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  shared.__morphoChildren![kind] = child;
  job.pid = child.pid ?? null;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (value) => append(kind, String(value)));
  child.stderr?.on("data", (value) => append(kind, String(value)));
  child.on("error", (error) => {
    job.last_error = error.message;
    job.running = false;
    job.exit_code = -1;
    job.finished_at = Date.now();
  });
  child.on("close", (code) => {
    job.running = false;
    job.exit_code = code;
    job.finished_at = Date.now();
    if (code !== 0 && !job.stop_requested)
      job.last_error = job.log_tail.at(-1) ?? `process exited with ${code}`;
    delete shared.__morphoChildren![kind];
  });
  return { started: true, job: getMorphoJob(kind) };
}
export function startMorphoIndex() {
  return start("index", ["build-index"]);
}
export async function stopMorpho(kind: Kind) {
  const child = shared.__morphoChildren![kind],
    job = shared.__morphoJobs![kind];
  if (!job.running || !child?.pid)
    return { stopped: false, reason: "not_running", job: getMorphoJob(kind) };
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
  return { stopped: true, job: getMorphoJob(kind) };
}
export async function getMorphoStatus() {
  let manifest: Record<string, unknown> | null = null;
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  } catch {
    /* not built */
  }
  // Status polling checks only file metadata after the first snapshot hash. If
  // any source file changes, recompute the canonical identity once.
  const latest = JSON.parse(await fs.readFile(LATEST_DATASET, "utf8")) as { version_id: string };
  const sourceFiles = [
    LATEST_DATASET,
    GENESIS_LIBRARY_PATH,
    path.join(GENESIS_DATA_ROOT, "datasets", latest.version_id, "parameters.json"),
    GENESIS_EXCLUDED_PATH,
  ];
  const stats = await Promise.all(sourceFiles.map((file) => fs.stat(file)));
  const signature = stats.map((stat) => `${stat.size}:${stat.mtimeMs}`).join("|");
  if (!snapshotCache || snapshotCache.signature !== signature) {
    snapshotCache = { signature, identity: await getV3SnapshotIdentity() };
  }
  const snapshot = snapshotCache.identity;
  const stale: string[] = [];
  if (manifest && manifest.source_snapshot_sha256 !== snapshot.content_sha256)
    stale.push("V3 dataset changed");
  if (manifest && manifest.excluded_sha256 !== snapshot.excluded_sha256)
    stale.push("excluded registry changed");
  return {
    ready: Boolean(manifest) && !stale.length,
    status: stale.length ? "stale" : manifest ? "ready" : "not_built",
    stale_reasons: stale,
    manifest,
    model_path: MODEL_PATH,
    index_job: getMorphoJob("index"),
    search_job: getMorphoJob("search"),
  };
}
export async function runMorphoSearch(
  imagePath: string,
  topK: number,
  valueMode: "expressive" | "conservative" | "default",
): Promise<Record<string, unknown>> {
  if (shared.__morphoJobs!.search.running)
    throw new Error("Another Morpho search is already active");
  const job = idle();
  job.running = true;
  job.started_at = Date.now();
  shared.__morphoJobs!.search = job;
  return new Promise((resolve, reject) => {
    let stdout = "",
      stderr = "";
    const child = spawn(
      PYTHON,
      [
        "-u",
        SCRIPT,
        "search",
        "--model-path",
        MODEL_PATH,
        "--image",
        imagePath,
        "--top-k",
        String(topK),
        "--value-mode",
        valueMode,
      ],
      {
        cwd: ROOT,
        windowsHide: true,
        env: env(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    shared.__morphoChildren!.search = child;
    job.pid = child.pid ?? null;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (value) => {
      stdout += String(value);
      append("search", String(value));
    });
    child.stderr?.on("data", (value) => {
      stderr += String(value);
      append("search", String(value));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      job.running = false;
      job.exit_code = code;
      job.finished_at = Date.now();
      delete shared.__morphoChildren!.search;
      if (code !== 0) {
        const message = job.stop_requested
          ? "Morpho search stopped"
          : stderr.trim() ||
            job.log_tail.at(-1) ||
            `process exited with ${code}`;
        job.last_error = message;
        reject(new Error(message));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).at(-1) ?? "{}";
        resolve(JSON.parse(line));
      } catch {
        reject(new Error("Morpho search returned invalid JSON"));
      }
    });
  });
}

export async function runMorphoAudioSearch(
  audioPath: string,
  offset: number,
  duration: number,
  topK: number,
  detail: "low" | "medium" | "high",
  layout: "mel" | "composite" | "rgb_delta",
): Promise<Record<string, unknown>> {
  if (shared.__morphoJobs!.search.running)
    throw new Error("Another Morpho search is already active");
  const job = idle();
  job.running = true;
  job.started_at = Date.now();
  shared.__morphoJobs!.search = job;
  return new Promise((resolve, reject) => {
    let stdout = "",
      stderr = "";
    const child = spawn(
      PYTHON,
      [
        "-u",
        SCRIPT,
        "search-audio",
        "--model-path",
        MODEL_PATH,
        "--audio",
        audioPath,
        "--offset",
        String(offset),
        "--duration",
        String(duration),
        "--top-k",
        String(topK),
        "--value-mode",
        "expressive",
        "--spectrogram-detail",
        detail,
        "--spectrogram-layout",
        layout,
      ],
      {
        cwd: ROOT,
        windowsHide: true,
        env: env(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    shared.__morphoChildren!.search = child;
    job.pid = child.pid ?? null;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (value) => {
      stdout += String(value);
      append("search", String(value));
    });
    child.stderr?.on("data", (value) => {
      stderr += String(value);
      append("search", String(value));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      job.running = false;
      job.exit_code = code;
      job.finished_at = Date.now();
      delete shared.__morphoChildren!.search;
      if (code !== 0) {
        const message = job.stop_requested
          ? "Morpho audio search stopped"
          : stderr.trim() ||
            job.log_tail.at(-1) ||
            `process exited with ${code}`;
        job.last_error = message;
        reject(new Error(message));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}"));
      } catch {
        reject(new Error("Morpho audio search returned invalid JSON"));
      }
    });
  });
}
