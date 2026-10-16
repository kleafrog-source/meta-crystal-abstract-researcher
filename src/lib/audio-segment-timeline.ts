import type { ActiveParameter } from "@/lib/rag-v3/types";

export interface AudioAnalysisPoint {
  time: number;
  offset: number;
  duration: number;
}

export function buildAudioAnalysisPoints(
  totalDuration: number,
  interval: number,
): AudioAnalysisPoint[] {
  if (!Number.isFinite(totalDuration) || totalDuration < 0.1) return [];
  const safeInterval = Math.max(0.1, Math.min(600, interval || 10));
  const windowDuration = Math.min(totalDuration, safeInterval);
  if (safeInterval >= totalDuration) {
    return [
      { time: 0, offset: 0, duration: windowDuration },
      { time: totalDuration, offset: 0, duration: windowDuration },
    ];
  }

  const times: number[] = [];
  for (let time = 0; time < totalDuration; time += safeInterval)
    times.push(time);
  if (Math.abs((times.at(-1) ?? 0) - totalDuration) > 0.001)
    times.push(totalDuration);
  return times.map((time) => ({
    time,
    offset: Math.min(time, Math.max(0, totalDuration - windowDuration)),
    duration: windowDuration,
  }));
}

function snap(value: number, step?: number): number {
  if (!step || step <= 0) return value;
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

export function interpolateParameterFrames(
  current: ActiveParameter[],
  next: ActiveParameter[],
  progress: number,
): ActiveParameter[] {
  const ratio = Math.max(0, Math.min(1, progress));
  const left = new Map(
    current.map((parameter) => [parameter.technical_name, parameter]),
  );
  const right = new Map(
    next.map((parameter) => [parameter.technical_name, parameter]),
  );
  const names = [...new Set([...left.keys(), ...right.keys()])];

  return names.map((name) => {
    const a = left.get(name);
    const b = right.get(name);
    const base = (ratio < 0.5 ? (a ?? b) : (b ?? a))!;
    if (!a || !b) return { ...base };
    if (
      a.ui_element === "Range" &&
      typeof a.current_value === "number" &&
      typeof b.current_value === "number"
    ) {
      const min = a.min_value ?? Number.NEGATIVE_INFINITY;
      const max = a.max_value ?? Number.POSITIVE_INFINITY;
      const value = Math.max(
        min,
        Math.min(
          max,
          snap(
            a.current_value + (b.current_value - a.current_value) * ratio,
            a.step,
          ),
        ),
      );
      return {
        ...base,
        current_value: value,
        suggested_value: value,
        source: "transition",
        detail: `Timeline interpolation ${Math.round(ratio * 100)}%`,
      };
    }
    const value = ratio < 0.5 ? a.current_value : b.current_value;
    return {
      ...base,
      current_value: value,
      suggested_value: value,
      source: "transition",
      detail: `Timeline step transition ${Math.round(ratio * 100)}%`,
    };
  });
}
