import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import type { SidecarEvent } from "@/lib/engine/runner";

export type TaskJournalStatus = "running" | "done" | "failed" | "cancelled";

export interface TaskJournalArtifact {
  path: string;
  kind: "created" | "modified";
  size: number;
  modifiedAt: string;
}

interface ArtifactSnapshotEntry {
  mtimeMs: number;
  size: number;
  hash: string;
}

type ArtifactSnapshot = Record<string, ArtifactSnapshotEntry>;

export interface TaskJournalEntry {
  taskId: string;
  taskType: string;
  title: string;
  command: string;
  args: string[];
  input: unknown;
  extraEnv: Record<string, string>;
  startedAt: string;
  finishedAt?: string;
  status: TaskJournalStatus;
  durationMs?: number;
  summary?: string;
  result?: unknown;
  error?: string;
  events: SidecarEvent[];
  artifacts: TaskJournalArtifact[];
}

export interface TaskJournalInit {
  taskId: string;
  taskType: string;
  title: string;
  command: string;
  args: string[];
  input: unknown;
  extraEnv: Record<string, string>;
  startedAt: string;
}

interface TaskJournalContext {
  filePath: string;
  startedSnapshot: ArtifactSnapshot;
  entry: TaskJournalEntry;
}

const PROJECT_ROOT = process.cwd();
const JOURNAL_DIR = join(PROJECT_ROOT, "data", "meta_crystals", "task_runs");
const EVENT_LIMIT = 400;

function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) mkdirSync(JOURNAL_DIR, { recursive: true });
}

function journalFilePath(taskId: string) {
  return join(JOURNAL_DIR, `${taskId}.json`);
}

function computeFileHash(path: string) {
  try {
    const buf = readFileSync(path);
    return createHash("sha1").update(buf).digest("hex");
  } catch {
    return "";
  }
}

function shouldTrackFile(path: string) {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.endsWith("/data/meta_crystals/mmss_eval_report.json")) return true;
  if (normalized.endsWith("/data/meta_crystals/isomorphisms.json")) return true;
  if (normalized.includes("/data/meta_crystals/crystals/manifested/")) return normalized.endsWith(".json");
  if (normalized.includes("/python_engine/mmss/")) {
    return [".pt", ".json", ".jsonl", ".txt", ".log"].some((suffix) => normalized.endsWith(suffix));
  }
  return false;
}

function collectFiles(path: string, out: string[]) {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      collectFiles(join(path, entry), out);
    }
    return;
  }
  if (stat.isFile() && shouldTrackFile(path)) out.push(resolve(path));
}

function trackedRoots(taskType: string) {
  if (taskType.startsWith("mmss")) {
    return [
      join(PROJECT_ROOT, "data", "meta_crystals", "mmss_eval_report.json"),
      join(PROJECT_ROOT, "data", "meta_crystals", "isomorphisms.json"),
      join(PROJECT_ROOT, "data", "meta_crystals", "crystals", "manifested"),
      join(PROJECT_ROOT, "python_engine", "mmss"),
    ];
  }
  if (taskType === "crystal_index") {
    return [join(PROJECT_ROOT, "data", "meta_crystals")];
  }
  return [];
}

function collectSnapshot(taskType: string): ArtifactSnapshot {
  const files: string[] = [];
  for (const root of trackedRoots(taskType)) collectFiles(root, files);
  const snapshot: ArtifactSnapshot = {};
  for (const filePath of files) {
    try {
      const stat = statSync(filePath);
      snapshot[filePath] = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        hash: computeFileHash(filePath),
      };
    } catch {}
  }
  return snapshot;
}

function diffArtifacts(before: ArtifactSnapshot, after: ArtifactSnapshot): TaskJournalArtifact[] {
  const changed: TaskJournalArtifact[] = [];
  for (const [path, current] of Object.entries(after)) {
    const previous = before[path];
    if (!previous) {
      changed.push({
        path,
        kind: "created",
        size: current.size,
        modifiedAt: new Date(current.mtimeMs).toISOString(),
      });
      continue;
    }
    if (previous.mtimeMs !== current.mtimeMs || previous.size !== current.size || previous.hash !== current.hash) {
      changed.push({
        path,
        kind: "modified",
        size: current.size,
        modifiedAt: new Date(current.mtimeMs).toISOString(),
      });
    }
  }
  return changed.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function summarizeEntry(entry: Pick<TaskJournalEntry, "status" | "command" | "artifacts" | "error">) {
  if (entry.status === "failed") return entry.error ?? `${entry.command} failed`;
  if (entry.status === "cancelled") return `${entry.command} cancelled`;
  const created = entry.artifacts.filter((artifact) => artifact.kind === "created").length;
  const modified = entry.artifacts.filter((artifact) => artifact.kind === "modified").length;
  if (entry.command === "mmss_status") return "MMSS status collected";
  if (entry.command === "mmss_eval") return `MMSS eval finished; ${created} created, ${modified} modified`;
  if (entry.command.startsWith("mmss_ingest")) return `MMSS ingest finished; ${created} created, ${modified} modified`;
  if (entry.command === "mmss_retrain") return `MMSS retrain finished; ${created} created, ${modified} modified`;
  return `${entry.command} finished; ${created} created, ${modified} modified`;
}

export function createTaskJournal(init: TaskJournalInit): TaskJournalContext | null {
  const roots = trackedRoots(init.taskType);
  if (roots.length === 0) return null;
  ensureJournalDir();
  const entry: TaskJournalEntry = {
    taskId: init.taskId,
    taskType: init.taskType,
    title: init.title,
    command: init.command,
    args: init.args,
    input: init.input,
    extraEnv: init.extraEnv,
    startedAt: init.startedAt,
    status: "running",
    events: [],
    artifacts: [],
  };
  const filePath = journalFilePath(init.taskId);
  writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
  return {
    filePath,
    startedSnapshot: collectSnapshot(init.taskType),
    entry,
  };
}

export function finalizeTaskJournal(
  context: TaskJournalContext | null,
  payload: {
    status: TaskJournalStatus;
    finishedAt: string;
    result?: unknown;
    error?: string;
    events: SidecarEvent[];
  },
) {
  if (!context) return;
  const afterSnapshot = collectSnapshot(context.entry.taskType);
  const artifacts = diffArtifacts(context.startedSnapshot, afterSnapshot);
  const durationMs =
    new Date(payload.finishedAt).getTime() - new Date(context.entry.startedAt).getTime();
  const entry: TaskJournalEntry = {
    ...context.entry,
    status: payload.status,
    finishedAt: payload.finishedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    result: payload.result,
    error: payload.error,
    events: payload.events.slice(-EVENT_LIMIT),
    artifacts,
  };
  entry.summary = summarizeEntry(entry);
  writeFileSync(context.filePath, JSON.stringify(entry, null, 2), "utf-8");
}

export function listTaskJournalEntries(taskTypePrefix?: string, limit = 20): TaskJournalEntry[] {
  ensureJournalDir();
  const entries: TaskJournalEntry[] = [];
  for (const name of readdirSync(JOURNAL_DIR)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(JOURNAL_DIR, name), "utf-8")) as TaskJournalEntry;
      if (taskTypePrefix && !raw.taskType.startsWith(taskTypePrefix)) continue;
      entries.push(raw);
    } catch {}
  }
  return entries
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, Math.max(1, Math.min(limit, 100)));
}
