import { spawn } from "node:child_process";

import {
  RAG_V2_ANCHORING_DIR,
  RAG_V2_ANCHORS_PATH,
  RAG_V2_AXES_PATH,
  RAG_V2_CALIBRATION_NEUTRAL_PATH,
  RAG_V2_CALIBRATION_STRONG_PATH,
  RAG_V2_DATASET_PATH,
  RAG_V2_POLARITY_PATH,
  RAG_V2_RETRIEVAL_INDEX_PATH,
} from "./paths";
import { invalidateAnchorsMeta, invalidateRetrievalIndexMeta } from "./dataset";

export interface BuildJobState {
  running: boolean;
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
  lastError: string | null;
  logTail: string[];
  progress: {
    stage: string | null;
    current: number;
    total: number;
    label: string | null;
  };
}

function createIdleState(): BuildJobState {
  return {
    running: false,
    startedAt: 0,
    finishedAt: 0,
    exitCode: null,
    lastError: null,
    logTail: [],
    progress: {
      stage: null,
      current: 0,
      total: 0,
      label: null,
    },
  };
}

let retrievalIndexJob = createIdleState();
let anchorsJob = createIdleState();
const PROGRESS_RE =
  /^\[progress\]\s+stage=(\S+)\s+current=(\d+)\s+total=(\d+)\s+label=(.*)$/;

function appendLog(state: BuildJobState, chunk: string): void {
  for (const line of chunk.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const progressMatch = trimmed.match(PROGRESS_RE);
    if (progressMatch) {
      state.progress = {
        stage: progressMatch[1] ?? null,
        current: Number(progressMatch[2] ?? 0),
        total: Number(progressMatch[3] ?? 0),
        label: progressMatch[4] ?? null,
      };
    }
    state.logTail.push(trimmed);
  }
  if (state.logTail.length > 30) {
    state.logTail = state.logTail.slice(-30);
  }
}

function startJob(params: {
  command: string;
  args: string[];
  cwd: string;
  onFinish?: () => void;
  stateRef: "retrieval" | "anchors";
}): { started: boolean; reason?: string } {
  const state = params.stateRef === "retrieval" ? retrievalIndexJob : anchorsJob;
  if (state.running) {
    return { started: false, reason: "already_running" };
  }

  const next = createIdleState();
  next.running = true;
  next.startedAt = Date.now();
  if (params.stateRef === "retrieval") {
    retrievalIndexJob = next;
  } else {
    anchorsJob = next;
  }

  const child = spawn(params.command, params.args, {
    cwd: params.cwd,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk) => appendLog(next, chunk));
  child.stderr.on("data", (chunk) => {
    appendLog(next, chunk);
    next.lastError = chunk.trim() || next.lastError;
  });
  child.on("error", (error) => {
    next.running = false;
    next.finishedAt = Date.now();
    next.exitCode = -1;
    next.lastError = error.message;
  });
  child.on("close", (code) => {
    next.running = false;
    next.finishedAt = Date.now();
    next.exitCode = code;
    if (code !== 0 && !next.lastError) {
      next.lastError = `process exited with code ${code}`;
    }
    if (code === 0) {
      params.onFinish?.();
    }
  });

  return { started: true };
}

export function startRetrievalIndexBuild(): { started: boolean; reason?: string } {
  return startJob({
    stateRef: "retrieval",
    command: "python",
    cwd: process.cwd(),
    args: [
      "-u",
      "python_engine/anchoring_v2/build_retrieval_index.py",
      "--dataset",
      RAG_V2_DATASET_PATH,
      "--out",
      RAG_V2_RETRIEVAL_INDEX_PATH,
    ],
    onFinish: () => invalidateRetrievalIndexMeta(),
  });
}

export function startAnchorsBuild(): { started: boolean; reason?: string } {
  return startJob({
    stateRef: "anchors",
    command: "python",
    cwd: RAG_V2_ANCHORING_DIR,
    args: [
      "-u",
      "build_anchors.py",
      "--endpoint",
      process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:11434",
      "--model",
      process.env.OLLAMA_EMBED_MODEL?.trim() || "qllama/bge-m3:q8_0",
      "--dataset",
      RAG_V2_DATASET_PATH,
      "--axes",
      RAG_V2_AXES_PATH,
      "--polarity",
      RAG_V2_POLARITY_PATH,
      "--strong",
      RAG_V2_CALIBRATION_STRONG_PATH,
      "--neutral",
      RAG_V2_CALIBRATION_NEUTRAL_PATH,
      "--out",
      RAG_V2_ANCHORS_PATH,
    ],
    onFinish: () => invalidateAnchorsMeta(),
  });
}

export function getRetrievalIndexJobState(): BuildJobState {
  return {
    ...retrievalIndexJob,
    logTail: [...retrievalIndexJob.logTail],
    progress: { ...retrievalIndexJob.progress },
  };
}

export function getAnchorsJobState(): BuildJobState {
  return {
    ...anchorsJob,
    logTail: [...anchorsJob.logTail],
    progress: { ...anchorsJob.progress },
  };
}
