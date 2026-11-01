const STORAGE_KEY = "am_stage_vocal_formants_v1";

export interface VocalMatrixFormantSummary {
  schema: "am_stage_formants_v1";
  f1_hz: number;
  f2_hz: number;
  confidence: number;
  segment_index: number;
  offset_seconds: number;
  duration_seconds: number;
  extracted_at: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function isSummary(value: unknown): value is VocalMatrixFormantSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schema === "am_stage_formants_v1"
    && Number.isFinite(item.f1_hz) && Number.isFinite(item.f2_hz)
    && Number.isFinite(item.confidence) && Number.isInteger(item.segment_index)
    && Number.isFinite(item.offset_seconds) && Number.isFinite(item.duration_seconds)
    && typeof item.extracted_at === "string";
}

export function saveVocalMatrixFormants(summary: VocalMatrixFormantSummary | null, storage = browserStorage()): void {
  if (!storage) return;
  try {
    if (summary) storage.setItem(STORAGE_KEY, JSON.stringify(summary));
    else storage.removeItem(STORAGE_KEY);
  } catch { /* Acoustic side metadata remains saved in the AM-Stage segment. */ }
}

export function loadVocalMatrixFormants(storage = browserStorage()): VocalMatrixFormantSummary | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isSummary(value) ? value : null;
  } catch {
    return null;
  }
}
