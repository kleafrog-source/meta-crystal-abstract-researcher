import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { embeddingProcessEnv, loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";

export interface PipelineJobState {
  running: boolean;
  pid: number | null;
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
  stopRequested: boolean;
  lastError: string | null;
  logTail: string[];
  progress: { step: string | null; current: number; total: number };
}

interface SharedPipelineJob {
  state: PipelineJobState;
  child: ChildProcessWithoutNullStreams | null;
}

const PROJECT_ROOT = process.cwd();
const SCRIPT_PATH = path.join(PROJECT_ROOT, "python_engine", "run-combinatorial-pipeline.py");
const LOCK_PATH = path.join(PROJECT_ROOT, "data", "combinatorial-genesis", ".pipeline.lock");
const sharedGlobal = globalThis as typeof globalThis & { __combinatorialPipelineJob?: SharedPipelineJob };

function idleState(): PipelineJobState {
  return {
    running: false,
    pid: null,
    startedAt: 0,
    finishedAt: 0,
    exitCode: null,
    stopRequested: false,
    lastError: null,
    logTail: [],
    progress: { step: null, current: 0, total: 0 },
  };
}

const shared = sharedGlobal.__combinatorialPipelineJob ?? { state: idleState(), child: null };
sharedGlobal.__combinatorialPipelineJob = shared;

function appendLog(chunk: string) {
  for (const rawLine of chunk.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line) as { event?: string; step?: string; current?: number; total?: number };
      if (event.event === "step_started" && event.step) {
        shared.state.progress = {
          step: event.step,
          current: Number(event.current ?? 0),
          total: Number(event.total ?? 0),
        };
      }
    } catch {
      // Regular script output remains available in the log tail.
    }
    shared.state.logTail.push(line.length > 4_000 ? `${line.slice(0, 4_000)}…` : line);
  }
  shared.state.logTail = shared.state.logTail.slice(-40);
}

export function getPipelineJob(): PipelineJobState {
  return {
    ...shared.state,
    logTail: [...shared.state.logTail],
    progress: { ...shared.state.progress },
  };
}

export async function startPipelineJob() {
  if (shared.state.running) return { started: false, reason: "already_running" };
  const state = idleState();
  state.running = true;
  state.startedAt = Date.now();
  shared.state = state;

  const python = process.env.PYTHON_EXECUTABLE || "python";
  const embeddingSettings = await loadEmbeddingRuntimeSettings();
  const child = spawn(python, ["-u", SCRIPT_PATH], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    env: embeddingProcessEnv(embeddingSettings),
  });
  shared.child = child;
  state.pid = child.pid ?? null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", appendLog);
  child.stderr.on("data", (chunk: string) => {
    appendLog(chunk);
    state.lastError = chunk.trim() || state.lastError;
  });
  child.on("error", (error) => {
    state.running = false;
    state.finishedAt = Date.now();
    state.exitCode = -1;
    state.lastError = error.message;
    shared.child = null;
  });
  child.on("close", (code) => {
    state.running = false;
    state.finishedAt = Date.now();
    state.exitCode = code;
    if (code !== 0 && !state.stopRequested && !state.lastError) state.lastError = `process exited with ${code}`;
    shared.child = null;
  });
  return { started: true, pid: state.pid };
}

async function lockPid(): Promise<number | null> {
  try {
    const value = Number((await fs.readFile(LOCK_PATH, "utf8")).trim());
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function stopTree(pid: number): Promise<void> {
  if (process.platform !== "win32") {
    try { process.kill(pid, "SIGTERM"); } catch {}
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
  });
}

export async function stopPipelineJob() {
  const pid = shared.child?.pid ?? shared.state.pid ?? await lockPid();
  if (!pid) {
    await fs.rm(LOCK_PATH, { force: true });
    return { stopped: false, reason: "not_running" };
  }
  shared.state.stopRequested = true;
  await stopTree(pid);
  await fs.rm(LOCK_PATH, { force: true });
  shared.state.running = false;
  shared.state.finishedAt = Date.now();
  return { stopped: true, pid };
}

export async function restartPipelineJob() {
  await stopPipelineJob();
  return await startPipelineJob();
}
