import { join } from "path";

export const MMSS_REPORT_PATH = join(process.cwd(), "data", "meta_crystals", "mmss_eval_report.json");

export function buildMmssEnv(input: Record<string, unknown> = {}) {
  const env: Record<string, string> = {};

  const chatModel = typeof input.chatModel === "string" ? input.chatModel.trim() : "";
  const embedModel = typeof input.embedModel === "string" ? input.embedModel.trim() : "";
  const chatTimeoutSec =
    typeof input.chatTimeoutSec === "number" || typeof input.chatTimeoutSec === "string"
      ? String(input.chatTimeoutSec)
      : "";
  const embedTimeoutSec =
    typeof input.embedTimeoutSec === "number" || typeof input.embedTimeoutSec === "string"
      ? String(input.embedTimeoutSec)
      : "";
  const ollamaHost = typeof input.ollamaHost === "string" ? input.ollamaHost.trim() : "";

  if (chatModel) env.MMSS_OLLAMA_CHAT_MODEL = chatModel;
  if (embedModel) env.MMSS_OLLAMA_EMBED_MODEL = embedModel;
  if (chatTimeoutSec) env.MMSS_OLLAMA_CHAT_TIMEOUT_SEC = chatTimeoutSec;
  if (embedTimeoutSec) env.MMSS_OLLAMA_EMBED_TIMEOUT_SEC = embedTimeoutSec;
  if (ollamaHost) env.OLLAMA_BASE_URL = ollamaHost;

  return env;
}
