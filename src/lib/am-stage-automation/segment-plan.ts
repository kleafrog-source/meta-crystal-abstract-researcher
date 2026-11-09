export interface AutomationSegmentWindow {
  id: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds?: number;
  [key: string]: unknown;
}

/**
 * SegmentPlan artifacts persist their windows under `data.windows`.
 * Keep accepting the old direct-array shape, but fail closed when a bound
 * plan is present and malformed so consumers never silently search the
 * entire audio range as one window.
 */
export function readSegmentWindows(value: unknown): AutomationSegmentWindow[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { windows?: unknown }).windows)
      ? (value as { windows: unknown[] }).windows
      : null;

  if (!candidate?.length) throw new Error("The bound SegmentPlan does not contain valid segment windows.");

  const windows = candidate.map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id.trim() || !Number.isFinite(row.startSeconds) || !Number.isFinite(row.endSeconds)) return null;
    const startSeconds = Number(row.startSeconds);
    const endSeconds = Number(row.endSeconds);
    if (startSeconds < 0 || endSeconds <= startSeconds) return null;
    return { ...row, startSeconds, endSeconds } as AutomationSegmentWindow;
  });

  if (windows.some((window) => window === null)) throw new Error("The bound SegmentPlan contains invalid segment windows.");
  return windows as AutomationSegmentWindow[];
}
