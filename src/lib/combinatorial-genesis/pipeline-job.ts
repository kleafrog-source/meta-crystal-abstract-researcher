import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

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
}

const LOCK_PATH = path.join(process.cwd(), "data", "combinatorial-genesis", ".pipeline.lock");
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

const shared = sharedGlobal.__combinatorialPipelineJob ?? { state: idleState() };
sharedGlobal.__combinatorialPipelineJob = shared;

export function getPipelineJob(): PipelineJobState {
  return {
    ...shared.state,
    logTail: [...shared.state.logTail],
    progress: { ...shared.state.progress },
  };
}

export async function startPipelineJob() {
  return { started: false, reason: "legacy_pipeline_disabled_use_service_bay_candidate_workflow" as const };
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
  const pid = shared.state.pid ?? await lockPid();
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
  return { restarted: false, reason: "legacy_pipeline_disabled_use_service_bay_candidate_workflow" as const };
}
