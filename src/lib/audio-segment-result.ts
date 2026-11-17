import type { ActiveParameter } from "./rag-v3/types";
import type { SegmentSideMeta } from "./segment-side-meta";

export type AudioEngine = "clap" | "siglip";
export type AudioAnalysisStatus = "pending" | "processing" | "complete" | "error";

export interface AudioSegmentResultPoint {
  time: number;
  offset: number;
  duration: number;
  clap: ActiveParameter[];
  siglip: ActiveParameter[];
  clapStatus: AudioAnalysisStatus;
  siglipStatus: AudioAnalysisStatus;
  siglipPreview?: {
    dataUrl: string;
    metadata: Record<string, unknown>;
  };
  sideMeta?: SegmentSideMeta;
}

export function applySuccessfulSegmentResult(
  segments: readonly AudioSegmentResultPoint[],
  index: number,
  engine: AudioEngine,
  parameters: ActiveParameter[],
): AudioSegmentResultPoint[] {
  if (!Number.isInteger(index) || index < 0 || index >= segments.length)
    throw new RangeError("Segment index is out of range");

  const resultField = engine;
  const statusField = engine === "clap" ? "clapStatus" : "siglipStatus";
  return segments.map((segment, currentIndex) =>
    currentIndex === index
      ? { ...segment, [resultField]: parameters, [statusField]: "complete" }
      : segment,
  );
}

/** Apply a provider result while retaining user edits made after this segment request began. */
export function applySuccessfulSegmentResultPreservingManualEdits(
  latestSegments: readonly AudioSegmentResultPoint[],
  requestBaseSegments: readonly AudioSegmentResultPoint[],
  index: number,
  engine: AudioEngine,
  parameters: ActiveParameter[],
): AudioSegmentResultPoint[] {
  if (!Number.isInteger(index) || index < 0 || index >= latestSegments.length || index >= requestBaseSegments.length)
    throw new RangeError("Segment index is out of range");

  const requestBase = requestBaseSegments[index][engine];
  const latest = latestSegments[index][engine];
  const latestByName = new Map(latest.map((parameter) => [parameter.technical_name, parameter]));
  const baseByName = new Map(requestBase.map((parameter) => [parameter.technical_name, parameter]));
  const manuallyRemoved = new Set(requestBase
    .filter((parameter) => !latestByName.has(parameter.technical_name))
    .map((parameter) => parameter.technical_name));
  const manuallyChanged = latest.filter((parameter) => {
    const before = baseByName.get(parameter.technical_name);
    return !before
      || parameter.current_value !== before.current_value
      || parameter.suggested_value !== before.suggested_value;
  });
  const manualByName = new Map(manuallyChanged.map((parameter) => [parameter.technical_name, parameter]));
  const providerByName = new Set(parameters.map((parameter) => parameter.technical_name));
  const reconciled = parameters
    .filter((parameter) => !manuallyRemoved.has(parameter.technical_name))
    .map((parameter) => {
      const manual = manualByName.get(parameter.technical_name);
      return manual
        ? { ...parameter, current_value: manual.current_value, suggested_value: manual.suggested_value }
        : parameter;
    });
  reconciled.push(...manuallyChanged.filter((parameter) => !providerByName.has(parameter.technical_name)));

  return applySuccessfulSegmentResult(latestSegments, index, engine, reconciled);
}

export function applySegmentSideMeta(
  segments: readonly AudioSegmentResultPoint[],
  index: number,
  patch: Partial<SegmentSideMeta>,
): AudioSegmentResultPoint[] {
  if (!Number.isInteger(index) || index < 0 || index >= segments.length)
    throw new RangeError("Segment index is out of range");
  return segments.map((segment, currentIndex) => {
    if (currentIndex !== index) return segment;
    const sideMeta = { schema: "segment_side_meta_v1" as const, ...segment.sideMeta, ...patch };
    if (patch.helm && patch.helm.gates.has_vocals.value !== true) delete sideMeta.gender;
    return { ...segment, sideMeta };
  });
}

export function prepareSegmentRun(
  segments: readonly AudioSegmentResultPoint[],
  engine: AudioEngine,
  resume: boolean,
): AudioSegmentResultPoint[] {
  if (resume) return segments.map((segment) => ({ ...segment, clap: [...segment.clap], siglip: [...segment.siglip] }));
  const statusField = engine === "clap" ? "clapStatus" : "siglipStatus";
  return segments.map((segment) => ({
    ...segment,
    [engine]: [],
    [statusField]: "pending",
    ...(engine === "siglip" ? { siglipPreview: undefined } : {}),
  }));
}

export function getIncompleteSegmentIndexes(
  segments: readonly AudioSegmentResultPoint[],
  engine: AudioEngine,
): number[] {
  const statusField = engine === "clap" ? "clapStatus" : "siglipStatus";
  return segments.flatMap((segment, index) => segment[statusField] === "complete" ? [] : [index]);
}
