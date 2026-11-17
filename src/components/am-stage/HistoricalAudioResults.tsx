import type { HistoricalSegmentResult } from "@/lib/am-stage-automation/historical-segment-results";

type DescriptionLabels = {
  section: string;
  title: string;
  artifact: string;
  unknown: string;
  target: string;
  evidence: string;
};

export function HistoricalAudioDescriptionsView({ descriptions, labels }: {
  descriptions: HistoricalSegmentResult["audioDescriptions"];
  labels: DescriptionLabels;
}) {
  if (!descriptions.length) return null;
  return <section className="space-y-1 rounded border border-border/70 p-2" aria-label={labels.section}>
    <h3 className="text-[10px] font-medium">{labels.title}</h3>
    {descriptions.map((description, index) => <article key={`${description.artifactId ?? description.sourceActionId}-${index}`} className="space-y-1 border-t border-border/50 pt-1">
      <div className="text-[9px] text-muted-foreground">{description.sourceActionId} · {labels.artifact} <code title={description.artifactId ?? undefined}>{description.artifactId ?? labels.unknown}</code>{description.language ? ` · ${description.language}` : ""}</div>
      <p className="whitespace-pre-wrap text-[10px]">{description.text}</p>
      {description.targetRange ? <p className="text-[9px] text-muted-foreground">{labels.target}: {description.targetRange.startSeconds.toFixed(2)}–{description.targetRange.endSeconds.toFixed(2)} s</p> : null}
      {description.evidenceRange ? <p className="text-[9px] text-muted-foreground">{labels.evidence}: {description.evidenceRange.startSeconds.toFixed(2)}–{description.evidenceRange.endSeconds.toFixed(2)} s</p> : null}
      {description.semantics ? <p className="text-[9px] text-muted-foreground">{description.semantics}</p> : null}
    </article>)}
  </section>;
}

export function HistoricalAudioTextView({ actionId, text, model, runtime, labels }: {
  actionId: "audio.describe.lfm3" | "audio.transcribe.lfm3";
  text: string;
  model?: string;
  runtime?: string;
  labels: { section: string; description: string; transcription: string };
}) {
  return <section className="mt-2 space-y-1 rounded border border-cyan-400/30 bg-cyan-950/10 p-2" aria-label={labels.section}>
    <strong className="text-xs">{actionId === "audio.transcribe.lfm3" ? labels.transcription : labels.description}</strong>
    <p className="whitespace-pre-wrap text-xs">{text}</p>
    {model || runtime ? <p className="text-[9px] text-muted-foreground">{[model, runtime].filter(Boolean).join(" · ")}</p> : null}
  </section>;
}
