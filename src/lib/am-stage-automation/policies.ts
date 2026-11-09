export const AUTOMATION_POLICY = Object.freeze({
  maximumSegmentCount: 500,
  defaultSegmentIntervalSeconds: 5,
  defaultSegmentMaximum: 15,
  defaultTopK: 50,
  adapterTopKLimit: 100,
  candidateBudget: 5_000,
});

export function resolveBriefTemplate(template: string, variables: Record<string, string>) {
  const unresolved = new Set<string>();
  const text = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_match, key: string) => {
    const value = variables[key];
    if (typeof value !== "string" || !value.trim()) { unresolved.add(key); return `{{${key}}}`; }
    return value;
  });
  return { text, unresolved: [...unresolved] };
}

export function parseBriefTemplateVariables(source: string) {
  const variables: Record<string, string> = {};
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error("Template substitution line " + (index + 1) + " must use key=value.");
    const key = line.slice(0, separator).trim(); const value = line.slice(separator + 1).trim();
    if (!/^[a-zA-Z0-9_.-]+$/u.test(key) || !value) throw new Error("Template substitution line " + (index + 1) + " needs a valid key and a non-empty value.");
    variables[key] = value;
  }
  return variables;
}

export function resolveAutomationTopK(input: { requested: number; automatic: boolean; requestCount: number; candidateCount?: number | null }) {
  const requested = Math.max(1, Math.min(AUTOMATION_POLICY.adapterTopKLimit, Math.trunc(input.requested || AUTOMATION_POLICY.defaultTopK)));
  if (!input.automatic) return { requested, effective: requested, origin: "manual" as const, reason: null };
  const count = Math.max(1, Math.trunc(input.requestCount || 1));
  const candidateCount = Number.isFinite(input.candidateCount) && Number(input.candidateCount) > 0 ? Math.trunc(Number(input.candidateCount)) : AUTOMATION_POLICY.adapterTopKLimit;
  const effective = Math.min(requested, AUTOMATION_POLICY.adapterTopKLimit, candidateCount, Math.floor(AUTOMATION_POLICY.candidateBudget / count));
  if (effective < 1) throw new Error("The candidate budget cannot provide even one result per request. Reduce the segment count or increase the scenario budget.");
  return { requested, effective, origin: "automatic" as const, reason: effective < requested ? `Candidate budget ${AUTOMATION_POLICY.candidateBudget} across ${count} requests.` : "Action default fits the current request count." };
}

export function planUniformWindows(start: number, end: number, options: { mode: "automatic" | "at_most" | "exact"; requestedCount: number; maximumCount: number; intervalSeconds: number }) {
  const duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || duration <= 0) throw new Error("Audio range must be positive and finite.");
  const maximum = Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(options.maximumCount || AUTOMATION_POLICY.defaultSegmentMaximum)));
  const requested = Math.max(1, Math.min(AUTOMATION_POLICY.maximumSegmentCount, Math.trunc(options.requestedCount || maximum)));
  const interval = Math.max(0.1, Number.isFinite(options.intervalSeconds) ? options.intervalSeconds : AUTOMATION_POLICY.defaultSegmentIntervalSeconds);
  const count = options.mode === "exact" ? requested : Math.min(maximum, Math.max(1, Math.ceil(duration / interval)));
  const windows = Array.from({ length: count }, (_, index) => {
    const windowStart = start + duration * index / count;
    const windowEnd = start + duration * (index + 1) / count;
    return { id: `segment-${index + 1}`, startSeconds: windowStart, endSeconds: windowEnd, durationSeconds: windowEnd - windowStart, startSource: index === 0 ? "range-boundary" : "uniform", endSource: index === count - 1 ? "range-boundary" : "uniform" };
  });
  if (windows.some((window) => window.durationSeconds <= 0) || Math.abs(windows[0].startSeconds - start) > 1e-6 || Math.abs(windows.at(-1)!.endSeconds - end) > 1e-6) throw new Error("Uniform segment plan failed coverage or non-empty window validation.");
  return { windows, requestedCount: requested, maximumCount: maximum, effectiveCount: windows.length, boundaryMode: "uniform" as const, countMode: options.mode, coverageMode: "full-range-no-overlap", coveredDuration: duration, coverageRatio: 1, gaps: [], overlaps: [], algorithmVersion: "automation-segments-v2" };
}

export function selectOrderedEvents(events: number[], start: number, end: number, count: number) {
  const unique = [...new Set(events.filter((event) => Number.isFinite(event) && event > start && event < end).map((event) => Math.round(event * 1000) / 1000))].sort((a, b) => a - b);
  const required = Math.max(0, count - 1);
  if (!required || !unique.length) return { selected: [] as number[], available: unique };
  const selected: number[] = []; let previousIndex = -1;
  for (let i = 1; i <= required; i++) {
    const target = start + (end - start) * i / count;
    const minIndex = previousIndex + 1;
    const maxIndex = unique.length - (required - i) - 1;
    if (minIndex > maxIndex) break;
    let best = minIndex;
    for (let index = minIndex + 1; index <= maxIndex; index++) if (Math.abs(unique[index] - target) < Math.abs(unique[best] - target)) best = index;
    selected.push(unique[best]); previousIndex = best;
  }
  return { selected, available: unique };
}
