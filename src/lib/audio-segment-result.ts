import type { ActiveParameter } from "./rag-v3/types";

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
