/**
 * Python sidecar runner — spawns the python_engine/sidecar.py subprocess,
 * streams JSON events from stdout, and exposes a Promise-based API.
 *
 * Used by:
 *   - /api/generate/start
 *   - /api/pipelines/[id]/run
 *   - /api/enrich
 *   - /api/import/preview, /api/import/apply
 *   - /api/crystals (list/get) for fallback reads
 */

import { spawn, ChildProcess } from "child_process";
import { dirname, join, resolve } from "path";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { createTaskJournal, finalizeTaskJournal } from "@/lib/task-journal";

function resolveProjectRoot() {
  const candidates = [
    process.cwd(),
    __dirname,
    resolve(__dirname, ".."),
    resolve(__dirname, "../.."),
    resolve(__dirname, "../../.."),
    resolve(__dirname, "../../../.."),
    resolve(__dirname, "../../../../.."),
    dirname(__filename),
  ];

  for (const candidate of candidates) {
    const sidecar = join(candidate, "python_engine", "sidecar.py");
    if (existsSync(sidecar)) return candidate;
  }

  return process.cwd();
}

const PROJECT_ROOT = resolveProjectRoot();
const SIDECAR_PATH = join(PROJECT_ROOT, "python_engine", "sidecar.py");
const TEMP_DIR = join(PROJECT_ROOT, "data", ".temp");
const PROFILES_DIR = join(PROJECT_ROOT, "data", "profiles");
const PIPELINES_DIR = join(PROJECT_ROOT, "data", "pipelines");
const PYTHON_CMD =
  process.platform === "win32"
    ? (process.env.PYTHON ?? "python")
    : (process.env.PYTHON ?? "python3");

for (const d of [TEMP_DIR, PROFILES_DIR, PIPELINES_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

export interface SidecarEvent {
  event: "log" | "progress" | "data" | "error" | "done";
  level?: "info" | "warn" | "error" | "success";
  msg?: string;
  value?: number;
  step?: string;
  payload?: unknown;
  result?: unknown;
  ts?: string;
}

export interface SidecarRunHandle {
  /** Unique task id */
  taskId: string;
  /** Task category for UI/status listing */
  taskType?: string;
  /** User-facing title */
  title?: string;
  /** Start timestamp */
  startedAt?: string;
  /** The underlying child process */
  child: ChildProcess | null;
  /** Buffered events for late subscribers */
  events: SidecarEvent[];
  /** Done promise — resolves with the final result payload */
  done: Promise<unknown>;
  /** Cancel the run (SIGTERM) */
  cancel: () => void;
  /** Subscribe to live events */
  subscribe: (cb: (e: SidecarEvent) => void) => () => void;
  /** Final result (after done) */
  result?: unknown;
  /** Status */
  status: "running" | "done" | "failed" | "cancelled";
}

// In-memory registry of running tasks. (For multi-instance deployment
// this should be replaced by Redis-backed state.)
// We attach to globalThis so that Next.js dev hot-reloads don't lose
// the in-flight tasks between requests.
const globalForTasks = globalThis as unknown as {
  __sidecarTasks?: Map<string, SidecarRunHandle>;
};
const TASKS: Map<string, SidecarRunHandle> =
  globalForTasks.__sidecarTasks ?? new Map();
if (!globalForTasks.__sidecarTasks) {
  globalForTasks.__sidecarTasks = TASKS;
}

export interface SidecarCallOptions {
  /** Command name, e.g. "generate" */
  command: string;
  /** Positional arguments (file paths etc.) */
  args?: string[];
  /** Optional object to be written to a temp JSON file; its path is appended to args */
  inputFile?: unknown;
  /** Optional listener for live events */
  onEvent?: (e: SidecarEvent) => void;
  /** Timeout in ms (default: 10 minutes) */
  timeoutMs?: number;
  taskType?: string;
  title?: string;
  extraEnv?: Record<string, string>;
}

export interface LocalTaskOptions {
  onRun: (ctx: {
    emit: (event: SidecarEvent) => void;
    isCancelled: () => boolean;
  }) => Promise<unknown>;
  timeoutMs?: number;
  taskType?: string;
  title?: string;
}

/**
 * Spawn sidecar with the given command and stream events.
 * Returns a handle with a done promise.
 */
export function runSidecar(opts: SidecarCallOptions): SidecarRunHandle {
  const taskId = randomUUID();
  const events: SidecarEvent[] = [];
  const subscribers = new Set<(e: SidecarEvent) => void>();

  let inputPath: string | undefined;
  const finalArgs = [...(opts.args ?? [])];

  if (opts.inputFile !== undefined) {
    inputPath = join(TEMP_DIR, `${taskId}.json`);
    writeFileSync(inputPath, JSON.stringify(opts.inputFile, null, 2), "utf-8");
    finalArgs.push(inputPath);
  }

  const child = spawn(PYTHON_CMD, [SIDECAR_PATH, opts.command, ...finalArgs], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...(opts.extraEnv ?? {}),
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
    },
  });

  let stdoutBuf = "";
  let stderrBuf = "";

  const handle: SidecarRunHandle = {
    taskId,
    taskType: opts.taskType ?? "sidecar",
    title: opts.title ?? opts.command,
    startedAt: new Date().toISOString(),
    child,
    events,
    status: "running",
    done: undefined as unknown as Promise<unknown>,
    cancel: () => {
      try {
        child.kill("SIGTERM");
      } catch {}
    },
    subscribe: (cb: (e: SidecarEvent) => void) => {
      subscribers.add(cb);
      // Replay buffered events
      for (const e of events) cb(e);
      return () => subscribers.delete(cb);
    },
    result: undefined as unknown,
  };

  const journal = createTaskJournal({
    taskId,
    taskType: handle.taskType ?? "sidecar",
    title: handle.title ?? opts.command,
    command: opts.command,
    args: finalArgs,
    input: opts.inputFile,
    extraEnv: opts.extraEnv ?? {},
    startedAt: handle.startedAt ?? new Date().toISOString(),
  });

  TASKS.set(taskId, handle);

  handle.done = new Promise((resolve, reject) => {
    let resolved = false;

    const emit = (e: SidecarEvent) => {
      events.push(e);
      if (events.length > 5000) events.splice(0, 1000); // cap memory
      if (opts.onEvent) opts.onEvent(e);
      for (const sub of subscribers) sub(e);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf-8");
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed) as SidecarEvent;
          emit(obj);
          if (obj.event === "done") {
            if (!resolved) {
              resolved = true;
              handle.status = "done";
              handle.result = obj.result;
              finalizeTaskJournal(journal, {
                status: "done",
                finishedAt: new Date().toISOString(),
                result: obj.result,
                events,
              });
              resolve(obj.result);
            }
          } else if (obj.event === "error") {
            if (!resolved) {
              resolved = true;
              handle.status = "failed";
              finalizeTaskJournal(journal, {
                status: "failed",
                finishedAt: new Date().toISOString(),
                error: obj.msg ?? "sidecar error",
                events,
              });
              reject(new Error(obj.msg ?? "sidecar error"));
            }
          }
        } catch {
          // Not a JSON line — ignore (probably python prints)
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString("utf-8");
      // emit stderr as warn logs, line by line
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (t) emit({ event: "log", level: "warn", msg: `[py stderr] ${t}`, ts: new Date().toISOString() });
      }
    });

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        handle.status = "failed";
        finalizeTaskJournal(journal, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: `failed to spawn sidecar: ${err.message}`,
          events,
        });
        reject(new Error(`failed to spawn sidecar: ${err.message}`));
      }
    });

    child.on("exit", (code, signal) => {
      if (!resolved) {
        if (signal === "SIGTERM" || signal === "SIGKILL") {
          handle.status = "cancelled";
          resolved = true;
          finalizeTaskJournal(journal, {
            status: "cancelled",
            finishedAt: new Date().toISOString(),
            error: "cancelled",
            events,
          });
          reject(new Error("cancelled"));
        } else if (code === 0) {
          handle.status = "done";
          resolved = true;
          finalizeTaskJournal(journal, {
            status: "done",
            finishedAt: new Date().toISOString(),
            result: { exitCode: 0 },
            events,
          });
          resolve({ exitCode: 0 });
        } else {
          handle.status = "failed";
          resolved = true;
          finalizeTaskJournal(journal, {
            status: "failed",
            finishedAt: new Date().toISOString(),
            error: `sidecar exited with code ${code}`,
            events,
          });
          reject(new Error(`sidecar exited with code ${code}`));
        }
      }
      // Clean up the temp input file
      if (inputPath) {
        try {
          unlinkSync(inputPath);
        } catch {}
      }
      // Keep the handle around for late status queries but mark as done
      setTimeout(() => {
        // Remove from registry after 1 hour to allow inspection
        // TASKS.delete(taskId);
      }, 3600_000);
    });

    // Optional timeout
    const to = opts.timeoutMs ?? 10 * 60 * 1000;
    setTimeout(() => {
      if (!resolved) {
        try {
          child.kill("SIGTERM");
        } catch {}
      }
    }, to);
  });

  return handle;
}

export function runLocalTask(opts: LocalTaskOptions): SidecarRunHandle {
  const taskId = randomUUID();
  const events: SidecarEvent[] = [];
  const subscribers = new Set<(e: SidecarEvent) => void>();
  let cancelled = false;
  let resolved = false;

  const emit = (event: SidecarEvent) => {
    events.push(event);
    if (events.length > 5000) events.splice(0, 1000);
    for (const sub of subscribers) sub(event);
  };

  const handle: SidecarRunHandle = {
    taskId,
    taskType: opts.taskType ?? "local",
    title: opts.title ?? "local task",
    startedAt: new Date().toISOString(),
    child: null,
    events,
    status: "running",
    done: undefined as unknown as Promise<unknown>,
    cancel: () => {
      cancelled = true;
      if (!resolved) {
        handle.status = "cancelled";
        emit({
          event: "error",
          level: "warn",
          msg: "cancelled",
          ts: new Date().toISOString(),
        });
      }
    },
    subscribe: (cb: (e: SidecarEvent) => void) => {
      subscribers.add(cb);
      for (const event of events) cb(event);
      return () => subscribers.delete(cb);
    },
    result: undefined,
  };

  const journal = createTaskJournal({
    taskId,
    taskType: handle.taskType ?? "local",
    title: handle.title ?? "local task",
    command: handle.title ?? "local task",
    args: [],
    input: null,
    extraEnv: {},
    startedAt: handle.startedAt ?? new Date().toISOString(),
  });

  TASKS.set(taskId, handle);

  handle.done = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        cancelled = true;
        handle.status = "failed";
        resolved = true;
        const err = new Error("local task timeout");
        emit({ event: "error", level: "error", msg: err.message, ts: new Date().toISOString() });
        finalizeTaskJournal(journal, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: err.message,
          events,
        });
        reject(err);
      }
    }, opts.timeoutMs ?? 10 * 60 * 1000);

    void opts
      .onRun({
        emit,
        isCancelled: () => cancelled,
      })
      .then((result) => {
        if (resolved || cancelled) {
          if (!resolved) {
            resolved = true;
            handle.status = cancelled ? "cancelled" : "done";
          }
          return;
        }
        resolved = true;
        handle.status = "done";
        handle.result = result;
        emit({ event: "done", result, ts: new Date().toISOString() });
        finalizeTaskJournal(journal, {
          status: "done",
          finishedAt: new Date().toISOString(),
          result,
          events,
        });
        resolve(result);
      })
      .catch((error) => {
        if (resolved) return;
        resolved = true;
        handle.status = cancelled ? "cancelled" : "failed";
        const message = error instanceof Error ? error.message : String(error);
        emit({ event: "error", level: "error", msg: message, ts: new Date().toISOString() });
        finalizeTaskJournal(journal, {
          status: cancelled ? "cancelled" : "failed",
          finishedAt: new Date().toISOString(),
          error: message,
          events,
        });
        reject(error);
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  });

  return handle;
}

/**
 * Run a sidecar command synchronously (resolves when "done" event arrives).
 * Convenience wrapper around runSidecar for one-shot calls.
 */
export async function callSidecar<T = unknown>(
  command: string,
  opts: Omit<SidecarCallOptions, "command"> = {},
): Promise<{ result: unknown; events: SidecarEvent[] }> {
  const handle = runSidecar({ command, ...opts });
  try {
    const result = await handle.done;
    return { result: result as T, events: handle.events };
  } catch (e) {
    // Surface a useful error including the last few events
    const lastErr = handle.events.filter((e) => e.event === "error").pop();
    throw new Error(
      `Sidecar command "${command}" failed: ${(e as Error).message}${
        lastErr ? ` — ${lastErr.msg}` : ""
      }`,
    );
  }
}

/**
 * Look up a task handle by id.
 */
export function getTask(taskId: string): SidecarRunHandle | undefined {
  return TASKS.get(taskId);
}

/**
 * List all known tasks.
 */
export function listTasks(): SidecarRunHandle[] {
  return Array.from(TASKS.values());
}

/**
 * Get the current count of running tasks (used to enforce the concurrency limit).
 */
export function runningTaskCount(): number {
  let n = 0;
  for (const t of TASKS.values()) if (t.status === "running") n++;
  return n;
}

/**
 * Concurrency limit — maximum simultaneous sidecar processes.
 */
export const MAX_CONCURRENT_RUNS = 3;
