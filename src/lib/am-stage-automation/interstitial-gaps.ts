export interface GapWindow {
  id: string;
  startSeconds: number;
  endSeconds: number;
}

export interface GapDescriptionRecord {
  id: string;
  status: string;
  result?: unknown;
}

export interface InterstitialGapSample {
  target: GapWindow;
  sentAudio: { startSeconds: number; endSeconds: number; durationSeconds: number };
  context: {
    left: { id: string; text: string; language: "en" | "ru" };
    right: { id: string; text: string; language: "en" | "ru" };
  };
}

function recordResult(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function usableDescription(record: GapDescriptionRecord) {
  if (record.status !== "succeeded") return null;
  const result = recordResult(record.result);
  const en = typeof result?.description_natural_en === "string" ? result.description_natural_en.trim() : "";
  if (en) return { text: en, language: "en" as const };
  const ru = typeof result?.description_natural_ru === "string" ? result.description_natural_ru.trim() : "";
  return ru ? { text: ru, language: "ru" as const } : null;
}

/**
 * Builds one centered sample for each undescribed segment strictly between
 * successful described nodes. It deliberately does not infer outer gaps.
 * Boundaries are rounded to milliseconds, then clamped to the target node.
 */
export function buildInterstitialGapSamples(
  windows: readonly GapWindow[],
  descriptions: readonly GapDescriptionRecord[],
  requestedDurationSeconds: number,
): InterstitialGapSample[] {
  if (!Number.isFinite(requestedDurationSeconds) || requestedDurationSeconds < 0.25 || requestedDurationSeconds > 30) {
    throw new Error("Central clip duration must be between 0.25 and 30 seconds.");
  }
  const ordered = [...windows].sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);
  const byId = new Map(descriptions.map((record) => [record.id, record]));
  const anchors = ordered.flatMap((window, index) => {
    const record = byId.get(window.id);
    const description = record ? usableDescription(record) : null;
    return description ? [{ index, window, description }] : [];
  });
  const samples: InterstitialGapSample[] = [];
  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
    const left = anchors[anchorIndex];
    const right = anchors[anchorIndex + 1];
    for (const target of ordered.slice(left.index + 1, right.index)) {
      const nodeDuration = target.endSeconds - target.startSeconds;
      if (!Number.isFinite(nodeDuration) || nodeDuration < 0.25) {
        throw new Error(`Node ${target.id} is shorter than the 0.25-second LFM3 minimum.`);
      }
      const durationSeconds = Math.round(Math.min(requestedDurationSeconds, nodeDuration, 30) * 1000) / 1000;
      if (durationSeconds < 0.25) throw new Error(`Node ${target.id} cannot provide a 0.25-second LFM3 clip.`);
      const center = (target.startSeconds + target.endSeconds) / 2;
      let startSeconds = Math.round((center - durationSeconds / 2) * 1000) / 1000;
      let endSeconds = Math.round((center + durationSeconds / 2) * 1000) / 1000;
      if (startSeconds < target.startSeconds) {
        startSeconds = Math.ceil(target.startSeconds * 1000) / 1000;
        endSeconds = Math.round((startSeconds + durationSeconds) * 1000) / 1000;
      }
      if (endSeconds > target.endSeconds) {
        endSeconds = Math.floor(target.endSeconds * 1000) / 1000;
        startSeconds = Math.round((endSeconds - durationSeconds) * 1000) / 1000;
      }
      const actualDuration = Math.round((endSeconds - startSeconds) * 1000) / 1000;
      if (startSeconds < target.startSeconds || endSeconds > target.endSeconds || actualDuration < 0.25) {
        throw new Error(`Node ${target.id} cannot provide an in-range LFM3 clip at millisecond precision.`);
      }
      samples.push({
        target: { ...target },
        sentAudio: { startSeconds, endSeconds, durationSeconds: actualDuration },
        context: {
          left: { id: left.window.id, ...left.description },
          right: { id: right.window.id, ...right.description },
        },
      });
    }
  }
  return samples;
}
