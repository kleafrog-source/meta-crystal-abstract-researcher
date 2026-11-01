import type { AudioSegmentResultPoint } from "@/lib/audio-segment-result";
import type { AudioAnalysisPoint } from "@/lib/audio-segment-timeline";
import type { SegmentAcousticFeatures } from "@/lib/segment-side-meta";

export type AudioWindowMode = "uniform" | "beat" | "onset";
export type Stage7RhythmSource = Pick<AudioSegmentResultPoint, "offset" | "duration"> & {
  sideMeta?: {
    acoustic_features?: Pick<SegmentAcousticFeatures, "feature_version" | "sample_rate_hz" | "duration_seconds" | "tempo_bpm_approx" | "beat_times_seconds" | "onset_times_seconds">;
  };
};
export const MIN_AUDIO_WINDOW_GAP_SECONDS = 0.5;

export function stage7FeaturesCoverRange(segments: readonly Stage7RhythmSource[], start: number, end: number): boolean {
  if (end - start < 0.1) return false;
  const intervals = segments
    .filter((segment) => Boolean(segment.sideMeta?.acoustic_features))
    .map((segment) => [segment.offset, segment.offset + (segment.sideMeta?.acoustic_features?.duration_seconds ?? segment.duration)] as const)
    .sort((a, b) => a[0] - b[0]);
  let coveredUntil = start;
  for (const [windowStart, windowEnd] of intervals) {
    if (windowEnd <= coveredUntil) continue;
    if (windowStart > coveredUntil + 0.01) return false;
    coveredUntil = Math.max(coveredUntil, windowEnd);
    if (coveredUntil >= end - 0.01) return true;
  }
  return false;
}

export function collectStage7WindowEvents(segments: readonly Stage7RhythmSource[], mode: AudioWindowMode): number[] {
  if (mode === "uniform") return [];
  const key = mode === "beat" ? "beat_times_seconds" : "onset_times_seconds";
  const events = segments.flatMap((segment) => {
    const features = segment.sideMeta?.acoustic_features;
    const duration = features?.duration_seconds ?? segment.duration;
    return (features?.[key] ?? [])
      .filter((time) => Number.isFinite(time) && time >= 0 && time <= duration)
      .map((time) => segment.offset + time);
  });
  return events.sort((a, b) => a - b).filter((time, index, ordered) => index === 0 || Math.abs(time - ordered[index - 1]) > 0.001);
}

export function mergeWindowEvents(events: readonly number[], minimumGap = MIN_AUDIO_WINDOW_GAP_SECONDS): number[] {
  const gap = Math.max(MIN_AUDIO_WINDOW_GAP_SECONDS, Number.isFinite(minimumGap) ? minimumGap : MIN_AUDIO_WINDOW_GAP_SECONDS);
  const ordered = [...new Set(events.filter(Number.isFinite))].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const event of ordered) if (!merged.length || event - merged[merged.length - 1] >= gap - 1e-9) merged.push(event);
  return merged;
}

export function buildAlignedAudioAnalysisPoints(
  totalDuration: number,
  interval: number,
  requestedStart: number,
  requestedEnd: number,
  events: readonly number[],
): AudioAnalysisPoint[] {
  if (!Number.isFinite(totalDuration) || totalDuration < 0.1) return [];
  const start = Math.max(0, Math.min(totalDuration, Number.isFinite(requestedStart) ? requestedStart : 0));
  const end = Math.max(start, Math.min(totalDuration, Number.isFinite(requestedEnd) ? requestedEnd : totalDuration));
  const rangeDuration = end - start;
  if (rangeDuration < 0.1) return [];
  const windowDuration = Math.min(Math.max(0.5, Math.min(30, interval || 2)), rangeDuration);
  const alignedEvents = mergeWindowEvents(events).filter((time) => time >= start && time <= end);
  return alignedEvents.map((time) => ({
    time,
    offset: Math.max(start, Math.min(end - windowDuration, time - windowDuration / 2)),
    duration: windowDuration,
  }));
}

export function resetSegmentsForWindowMode(points: readonly AudioAnalysisPoint[]): AudioSegmentResultPoint[] {
  return points.map((point) => ({ ...point, clap: [], siglip: [], clapStatus: "pending", siglipStatus: "pending" }));
}

export async function loadStage7RhythmSources(
  file: File,
  start: number,
  end: number,
  cachedSegments: readonly Stage7RhythmSource[],
  onProgress: (message: "start" | "complete") => void,
): Promise<Stage7RhythmSource[]> {
  if (stage7FeaturesCoverRange(cachedSegments, start, end)) return [...cachedSegments];
  onProgress("start");
  const form = new FormData();
  form.set("audio", file, file.name);
  form.set("offset", String(start));
  form.set("duration", String(end - start));
  const response = await fetch("/api/am-stage/acoustic-window-sources", { method: "POST", body: form });
  const payload = await response.json() as {
    windows?: Array<{ offset: number; duration: number; acoustic_features: NonNullable<NonNullable<Stage7RhythmSource["sideMeta"]>["acoustic_features"]> }>;
    error?: string;
  };
  if (!response.ok || !payload.windows?.length) throw new Error(payload.error || "Stage 7 rhythm event extraction returned no source windows.");
  onProgress("complete");
  return payload.windows.map((window) => ({
    offset: window.offset,
    duration: window.duration,
    sideMeta: { acoustic_features: window.acoustic_features },
  }));
}
