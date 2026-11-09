import { applyConsensusSmooth } from "@/lib/am-stage-blend";
import { ACOUSTIC_DOMAIN_LAYERS } from "@/lib/domain-layers";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import type { AutomationArtifactPayload } from "./contracts";

type SourceArtifact = Pick<AutomationArtifactPayload, "actionId" | "data" | "segmentRefs">;

export function smoothAutomationFrames(
  artifacts: SourceArtifact[],
  options: { domainLayers?: string[]; topK?: number; centroidPercent?: number } = {},
) {
  const supported = new Set(["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"]);
  const sources = artifacts.filter((artifact) => supported.has(artifact.actionId) && Array.isArray(artifact.data));
  if (!sources.length) throw new Error("Client Stage-2 needs explicit text, CLAP, or SigLIP result artifacts from earlier stages.");

  const segmentIds = [...new Set(sources.flatMap((artifact) => [
    ...artifact.segmentRefs.map((segment) => segment.id),
    ...(artifact.data as Array<ActiveParameter & { automation_segment?: string }>).map((item) => item.automation_segment).filter((id): id is string => Boolean(id)),
  ]))];
  const targets = segmentIds.length ? segmentIds : ["range"];
  const selectedLayers = options.domainLayers ?? ACOUSTIC_DOMAIN_LAYERS.map((layer) => layer.id);
  const topK = Math.max(1, Math.min(500, Math.trunc(options.topK ?? 64)));
  const centroidPercent = Math.max(0, Math.min(100, options.centroidPercent ?? 50));

  return targets.flatMap((segmentId) => {
    const frames = sources.map((artifact) => {
      const values = artifact.data as Array<ActiveParameter & { automation_segment?: string }>;
      if (artifact.actionId.startsWith("text.")) return values;
      return values.filter((item) => !item.automation_segment || item.automation_segment === segmentId);
    });
    const smoothed = applyConsensusSmooth(frames, selectedLayers, topK, centroidPercent);
    return smoothed.flatMap((frame, frameIndex) => frame.map((parameter) => ({
      ...parameter,
      automation_segment: segmentId,
      consensus_frame: sources[frameIndex].actionId,
    })));
  });
}
