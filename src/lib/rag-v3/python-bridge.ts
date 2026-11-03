import { spawn } from "node:child_process";
import type { TextIndexId } from "./composite-index";
import { TEXT_INDEX_MODELS } from "./composite-index";
import { loadEmbeddingRuntimeSettings } from "@/lib/embedding-settings";

export interface V3AnchorValue {
  value: number | string;
  before: number | string;
  source: "numeric" | "value_anchor" | "lexical" | "relation" | "axis" | "retrieval" | "not_generated" | "default" | "neutral";
  detail: string;
}

export function runV3AnchoringBridge(payload: {
  query: string;
  concepts?: string[];
  query_embeddings?: number[][];
  relation_hints?: Record<string, { direction: number; confidence: number; relation: string }>;
  scoped_params: Array<Record<string, unknown>>;
  current_values: Record<string, number | string>;
  text_index?: TextIndexId;
  value_anchors_ready?: boolean;
  select_anchors_ready?: boolean;
}): Promise<Record<string, V3AnchorValue>> {
  return loadEmbeddingRuntimeSettings().then((settings) => new Promise((resolve, reject) => {
    const textIndex = payload.text_index ?? "qwen3";
    const child = spawn(process.env.PYTHON_EXECUTABLE || "python", ["python_engine/anchoring_v3/bridge.py"], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", RAG_V3_TEXT_INDEX: textIndex, OLLAMA_BASE_URL: settings.baseUrl, OLLAMA_EMBED_MODEL: TEXT_INDEX_MODELS[textIndex] },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `V3 anchoring bridge exited with ${code}`));
      try {
        resolve(JSON.parse(stdout) as Record<string, V3AnchorValue>);
      } catch (error) {
        reject(new Error(`Invalid V3 anchoring response: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  }));
}
