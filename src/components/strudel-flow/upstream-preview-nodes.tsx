"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

type PreviewData = {
  title?: string;
  label?: string;
  sound?: string;
  selectedPattern?: string;
  selectedChordType?: string;
  mode?: string;
  steps?: number;
  gain?: string;
  pan?: string;
  distort?: string;
  lpf?: string;
  fast?: string;
  slow?: string;
  room?: string;
  polyPattern1?: string;
  polyPattern2?: string;
  polyPattern3?: string;
  rows?: Array<{ instrument: string; pattern: boolean[] }>;
};

function buildSummary(type: string, data: PreviewData) {
  if (type === "synth-select-node") return data.sound ? `sound: ${data.sound}` : "synth";
  if (type === "arpeggiator-node") return `${data.selectedPattern ?? "pattern"} · ${data.selectedChordType ?? "scale"}`;
  if (type === "pad-node") return `${data.mode ?? "arp"} · ${data.steps ?? 0} steps`;
  if (type === "beat-machine-node") return `${data.rows?.length ?? 0} tracks · ${data.steps ?? 0} steps`;
  if (type === "polyrhythm-node") return [data.polyPattern1, data.polyPattern2, data.polyPattern3].filter(Boolean).join(" · ");
  if (type === "gain-node") return `gain ${data.gain ?? "1"}`;
  if (type === "pan-node") return `pan ${data.pan ?? "0.5"}`;
  if (type === "distort-node") return `distort ${data.distort ?? "0"}`;
  if (type === "lpf-node") return `lpf ${data.lpf ?? "off"}`;
  if (type === "room-node") return `room ${data.room ?? "0"}`;
  if (type === "fast-node") return `fast ${data.fast ?? "1"}`;
  if (type === "slow-node") return `slow ${data.slow ?? "1"}`;
  return "";
}

function tone(type: string) {
  if (type === "beat-machine-node" || type === "polyrhythm-node") return "border-cyan-400/40 bg-cyan-500/10";
  if (type === "pad-node" || type === "arpeggiator-node" || type === "synth-select-node") return "border-emerald-400/40 bg-emerald-500/10";
  return "border-violet-400/40 bg-violet-500/10";
}

function PreviewNode({ data, type }: NodeProps) {
  const previewData = data as PreviewData;
  return (
    <div className={`min-w-[180px] rounded-md border px-3 py-2 text-xs shadow-lg ${tone(type ?? "")}`}>
      <Handle type="target" position={Position.Left} className="h-2 w-2 border-none bg-cyan-300" />
      <div className="font-semibold text-foreground">{previewData.title ?? previewData.label ?? type}</div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{type}</div>
      <div className="mt-2 text-[11px] leading-5 text-muted-foreground">{buildSummary(type ?? "", previewData) || "native upstream preview"}</div>
      <Handle type="source" position={Position.Right} className="h-2 w-2 border-none bg-emerald-300" />
    </div>
  );
}

export const upstreamPreviewNodeTypes = {
  "pad-node": PreviewNode,
  "arpeggiator-node": PreviewNode,
  "beat-machine-node": PreviewNode,
  "polyrhythm-node": PreviewNode,
  "synth-select-node": PreviewNode,
  "gain-node": PreviewNode,
  "pan-node": PreviewNode,
  "distort-node": PreviewNode,
  "lpf-node": PreviewNode,
  "room-node": PreviewNode,
  "fast-node": PreviewNode,
  "slow-node": PreviewNode,
  "custom-node": PreviewNode,
};
