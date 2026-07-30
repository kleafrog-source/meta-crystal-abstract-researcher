import { spawn } from "child_process";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { readPersistedTorusAnalysisResult } from "@/lib/gw-collapser";
import type { GwGhostContinueRequest, GwGhostContinueResult } from "@/types/gw-collapser-ghost";

type JsonRecord = Record<string, unknown>;
const PROJECT_ROOT = process.cwd();
const TEMP_DIR = join(PROJECT_ROOT, "data", ".temp");
const PYTHON_CMD = process.platform === "win32" ? (process.env.PYTHON ?? "python") : (process.env.PYTHON ?? "python3");
const GHOST_SCRIPT_PATH = join(PROJECT_ROOT, "python_engine", "gwcollapser", "torus_flow_ghost.py");

export async function continueGhostTrajectory(input: GwGhostContinueRequest): Promise<GwGhostContinueResult> {
  const crystal = await db.crystal.findUnique({ where: { id: input.crystalId } });
  if (!crystal) {
    throw new Error("Crystal not found");
  }
  const persisted = readPersistedTorusAnalysisResult(crystal.filepath);
  if (!persisted?.analysis) {
    throw new Error("No persisted torus analysis found for this crystal");
  }

  if (!existsSync(GHOST_SCRIPT_PATH)) {
    throw new Error(`Ghost script not found: ${GHOST_SCRIPT_PATH}`);
  }
  const payload = await runGhostPython({
    crystal_id: crystal.id,
    crystal_code: crystal.code,
    start_frame: Math.max(0, Number(input.startFrame ?? 0)),
    steps: Math.max(1, Number(input.steps ?? 100)),
    analysis: persisted.analysis,
  });
  const finalPoint = asPoint(payload.final_point);
  const ghostHistory = asPointList(payload.ghost_history);
  const metadata = parseMetadataJson(crystal.metadataJson);
  metadata.ghostCoordinate = finalPoint ? { x: finalPoint.x, y: finalPoint.y } : null;
  metadata.ghostTrajectory = ghostHistory.length ? ghostHistory.map((point) => ({ x: point.x, y: point.y })) : [];

  await db.crystal.update({
    where: { id: crystal.id },
    data: {
      metadataJson: JSON.stringify(metadata),
    },
  });

  return {
    crystalId: crystal.id,
    crystalCode: crystal.code,
    startFrame: Math.max(0, Number(payload.start_frame ?? input.startFrame ?? 0)),
    steps: Math.max(1, Number(payload.steps ?? input.steps ?? 100)),
    oscillationFrame: Number.isFinite(Number(payload.oscillation_frame)) ? Number(payload.oscillation_frame) : null,
    baseHistory: asPointList(payload.base_history),
    ghostHistory,
    finalPoint,
    parameters: {
      dt: Number(getNestedValue(payload, ["parameters", "dt"]) ?? persisted.analysis.parameters.dt),
      friction: Number(getNestedValue(payload, ["parameters", "friction"]) ?? persisted.analysis.parameters.friction),
      epsilon: Number(getNestedValue(payload, ["parameters", "epsilon"]) ?? persisted.analysis.parameters.epsilon),
      geometry_R: Number(getNestedValue(payload, ["parameters", "geometry_R"]) ?? persisted.analysis.parameters.geometry_R),
      geometry_r: Number(getNestedValue(payload, ["parameters", "geometry_r"]) ?? persisted.analysis.parameters.geometry_r),
      max_steps: Number(getNestedValue(payload, ["parameters", "max_steps"]) ?? persisted.analysis.parameters.max_steps),
      tol_speed: Number(getNestedValue(payload, ["parameters", "tol_speed"]) ?? persisted.analysis.parameters.tol_speed),
      n_clusters: Number(getNestedValue(payload, ["parameters", "n_clusters"]) ?? persisted.analysis.parameters.n_clusters),
      embedding_model:
        typeof getNestedValue(payload, ["parameters", "embedding_model"]) === "string"
          ? String(getNestedValue(payload, ["parameters", "embedding_model"]))
          : persisted.analysis.parameters.embedding_model,
    },
  };
}

async function runGhostPython(payload: JsonRecord): Promise<JsonRecord> {
  const inputPath = join(TEMP_DIR, `${randomUUID()}-ghost.json`);
  writeFileSync(inputPath, JSON.stringify(payload, null, 2), "utf-8");

  try {
    return await new Promise<JsonRecord>((resolve, reject) => {
      const child = spawn(PYTHON_CMD, [GHOST_SCRIPT_PATH, inputPath], {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
        },
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });
      child.on("error", (error) => {
        reject(error);
      });
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `ghost python exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as JsonRecord);
        } catch (error) {
          reject(new Error(`Failed to parse ghost python output: ${(error as Error).message}`));
        }
      });
    });
  } finally {
    try {
      unlinkSync(inputPath);
    } catch {}
  }
}

function asPoint(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return null;
  return {
    x: Number(value[0] ?? 0),
    y: Number(value[1] ?? 0),
  };
}

function asPointList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asPoint(entry))
    .filter((entry): entry is { x: number; y: number } => Boolean(entry));
}

function parseMetadataJson(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function getNestedValue(source: JsonRecord, path: string[]) {
  let current: unknown = source;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
