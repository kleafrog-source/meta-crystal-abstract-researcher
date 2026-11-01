export const DEFAULT_SAINA_HELM_BASE_URL = "http://127.0.0.1:11435";

/** Helm's Saina endpoint is intentionally isolated from the stock Ollama URL. */
export function getSainaHelmBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.AM_STAGE_SAINA_BASE_URL?.trim() || DEFAULT_SAINA_HELM_BASE_URL;
  const normalized = configured.replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("AM_STAGE_SAINA_BASE_URL must be an absolute HTTP(S) URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("AM_STAGE_SAINA_BASE_URL must use HTTP or HTTPS.");
  }
  return normalized;
}
