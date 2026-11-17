export interface V3BuildJobState {
  running: boolean;
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
  lastError: string | null;
  logTail: string[];
  progress: { stage: string | null; current: number; total: number; label: string | null };
}

function idle(): V3BuildJobState {
  return { running: false, startedAt: 0, finishedAt: 0, exitCode: null, lastError: null, logTail: [], progress: { stage: null, current: 0, total: 0, label: null } };
}

interface V3GlobalJobState {
  index: V3BuildJobState;
  anchors: V3BuildJobState;
}

const shared = globalThis as typeof globalThis & { __ragV3BuildJobs?: V3GlobalJobState };
const jobs = shared.__ragV3BuildJobs ?? { index: idle(), anchors: idle() };
shared.__ragV3BuildJobs = jobs;
export async function startV3IndexBuild() {
  return { started: false, reason: "legacy_build_disabled_use_service_bay_candidate_workflow" as const };
}

export async function startV3AnchorsBuild() {
  return { started: false, reason: "legacy_build_disabled_use_service_bay_candidate_workflow" as const };
}

export function getV3IndexJob() { return { ...jobs.index, logTail: [...jobs.index.logTail], progress: { ...jobs.index.progress } }; }
export function getV3AnchorsJob() { return { ...jobs.anchors, logTail: [...jobs.anchors.logTail], progress: { ...jobs.anchors.progress } }; }
