"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import type { SegmentAcousticFeatures } from "@/lib/segment-side-meta";
import { useUiText } from "@/lib/ui-i18n";
import type { AudioSegmentResultPoint } from "@/lib/audio-segment-result";
import type { SegmentSideMeta } from "@/lib/segment-side-meta";

type Specialist = "helm" | "gender" | "language";
type BusyAction = Specialist | "acoustic";

const SPECIALISTS: Array<{ id: Specialist; label: string }> = [
  { id: "helm", label: "Run Helm gates" },
  { id: "gender", label: "Detect voice presentation" },
  { id: "language", label: "Detect Indic language" },
];

export function SegmentSideMetadataPanel({
  file,
  segment,
  segmentIndex,
  onResult,
}: {
  file: File | null;
  segment: AudioSegmentResultPoint | null;
  segmentIndex: number;
  onResult: (patch: Partial<SegmentSideMeta>) => void;
}) {
  const t = useUiText();
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");

  const run = async (specialist: Specialist) => {
    if (!file || !segment || busy) return;
    setBusy(specialist);
    setError("");
    try {
      const form = new FormData();
      form.set("specialist", specialist);
      form.set("audio", file, file.name);
      form.set("offset", String(segment.offset));
      form.set("duration", String(segment.duration));
      const response = await fetch("/api/am-stage/side-metadata", { method: "POST", body: form });
      const payload = await response.json() as { side_meta?: Partial<SegmentSideMeta>; error?: string };
      if (!response.ok || !payload.side_meta) throw new Error(payload.error || t("Specialist analysis failed."));
      onResult(payload.side_meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const runAcousticExtraction = async () => {
    if (!file || !segment || busy) return;
    setBusy("acoustic");
    setError("");
    try {
      const form = new FormData();
      form.set("audio", file, file.name);
      form.set("offset", String(segment.offset));
      form.set("duration", String(segment.duration));
      const helmGate = segment.sideMeta?.helm?.gates.has_vocals.value;
      form.set("helm_has_vocals", helmGate === null || helmGate === undefined ? "unknown" : String(helmGate));
      const response = await fetch("/api/am-stage/acoustic-features", { method: "POST", body: form });
      const payload = await response.json() as { side_meta?: Partial<SegmentSideMeta>; error?: string };
      if (!response.ok || !payload.side_meta?.acoustic_features) throw new Error(payload.error || t("Acoustic feature extraction failed."));
      onResult(payload.side_meta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return <section data-am-stage-zone="segment-side-metadata" className="space-y-2 rounded-lg border border-fuchsia-400/20 bg-black/30 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-fuchsia-200">{t("Segment specialists · side metadata")}</h2>
        <p className="mt-1 text-[10px] text-zinc-500">{segment ? `${t("Segment")} ${segmentIndex + 1} · ${segment.offset.toFixed(1)}–${(segment.offset + segment.duration).toFixed(1)}s` : t("Create or load an audio segment first.")}</p>
      </div>
      <Badge variant="outline" className="border-fuchsia-400/25 text-fuchsia-200">{t("Manual run · unloads after use")}</Badge>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {SPECIALISTS.map(({ id, label }) => <Button key={id} size="sm" variant="outline" data-am-stage-action={`side-meta-${id}`} disabled={!file || !segment || busy !== null || (id === "helm" && (segment.duration < 0.25 || segment.duration > 10))} title={id === "helm" && segment && segment.duration > 10 ? t("Helm audio windows are limited to 10 seconds.") : undefined} onClick={() => void run(id)}>{busy === id ? t("Running…") : t(label)}</Button>)}
      <Button size="sm" variant="outline" data-am-stage-action="extract-acoustic-features" disabled={!file || !segment || busy !== null || (segment.duration < 0.25 || segment.duration > 30)} title={segment && segment.duration > 30 ? t("Acoustic feature windows are limited to 30 seconds.") : undefined} onClick={() => void runAcousticExtraction()}>{busy === "acoustic" ? t("Extracting…") : t("Extract acoustic features")}</Button>
    </div>
    {error ? <p role="alert" className="break-words rounded border border-red-400/30 bg-red-950/20 p-2 text-[10px] text-red-200">{error}</p> : null}
    {segment?.sideMeta ? <div className="space-y-1 text-[10px] text-zinc-300">
      {segment.sideMeta.helm ? <p><span className="text-fuchsia-200">Helm:</span> {Object.entries(segment.sideMeta.helm.gates).map(([name, gate]) => `${t(name)} ${gate.value === null ? "—" : gate.value ? t("Yes") : t("No")} (${gate.probability === null ? "—" : gate.probability.toFixed(2)})`).join(" · ")}</p> : null}
      {segment.sideMeta.gender ? <p><span className="text-fuchsia-200">{t("Voice presentation")}:</span> {t(segment.sideMeta.gender.label)} · {segment.sideMeta.gender.score.toFixed(2)}</p> : null}
      {segment.sideMeta.language ? <div className="flex flex-wrap items-center gap-1"><p className="min-w-0 flex-1"><span className="text-fuchsia-200">{t("Indic languages")}:</span> {segment.sideMeta.language.tags.map((tag) => `${tag.code} ${tag.label} (${tag.confidence.toFixed(2)})`).join(" · ") || t("No language above confidence threshold.")}</p>{segment.sideMeta.language.tags.length ? <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => void navigator.clipboard.writeText(segment.sideMeta?.language?.tags.map((tag) => tag.code).join(", ") ?? "")}><Copy className="mr-1 size-3" />{t("Copy tags")}</Button> : null}</div> : null}
      {segment.sideMeta.acoustic_features ? <AcousticFeatureSummary features={segment.sideMeta.acoustic_features} t={t} /> : null}
    </div> : null}
  </section>;
}

function AcousticFeatureSummary({ features, t }: { features: SegmentAcousticFeatures; t: (value: string) => string }) {
  const formants = features.formants;
  const skipReason = features.formant_skip_reason === "helm_negative"
    ? t("Skipped because Helm marked this segment as non-vocal.")
    : features.formant_skip_reason === "low_energy"
      ? t("Signal level is below the formant threshold.")
      : features.formant_skip_reason === "insufficient_voiced_frames"
        ? t("Too few periodic voiced frames for formants.")
        : t("No voiced frames detected.");
  return <div className="rounded border border-cyan-400/15 bg-black/30 p-2">
    <p className="font-medium text-cyan-200">{t("Acoustic features · librosa")}</p>
    <p>{t("RMS")}: {features.rms_mean.toFixed(3)} · {features.loudness_dbfs_approx.toFixed(1)} dBFS {t("approx.")} · {t("Peak")}: {features.peak.toFixed(3)}</p>
    <p>{t("Centroid")}: {Math.round(features.spectral_centroid_mean_hz)} Hz · {t("Bandwidth")}: {Math.round(features.spectral_bandwidth_mean_hz)} Hz · {t("Rolloff 85%")}: {Math.round(features.spectral_rolloff_85_mean_hz)} Hz</p>
    <p>{t("Tempo")}: {features.tempo_bpm_approx === null ? "—" : `${features.tempo_bpm_approx.toFixed(1)} BPM`} · {t("Beats")}: {features.beat_times_seconds.length} · {t("Onsets")}: {features.onset_times_seconds.length}</p>
    {formants ? <p className="text-fuchsia-200">{t("Formants")}: F1 {Math.round(formants.f1_hz)} Hz · F2 {Math.round(formants.f2_hz)} Hz · {t("heuristic confidence")} {formants.confidence.toFixed(2)}</p> : <p>{t("Formants not estimated")}: {skipReason}</p>}
  </div>;
}
