"use client";

import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Loader2, WandSparkles } from "lucide-react";
import type { SegmentAcousticFeatures } from "@/lib/segment-side-meta";
import { useUiText } from "@/lib/ui-i18n";
import { useCapabilityEnabled } from "@/hooks/use-capability-registry";
import type { AudioSegmentResultPoint } from "@/lib/audio-segment-result";
import type { SegmentSideMeta } from "@/lib/segment-side-meta";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { JournalDraftButton } from "@/components/cross-modal/JournalDraftButton";
import type { Lfm3PromptMode, Lfm3Runtime } from "@/lib/lfm3-audio";

type Specialist = "helm" | "gender" | "language";
type BusyAction = Specialist | "acoustic" | "lfm3";

const SPECIALISTS: Array<{ id: Specialist; label: string }> = [
  { id: "helm", label: "Run Helm gates" },
  { id: "gender", label: "Detect voice presentation" },
  { id: "language", label: "Detect Indic language" },
];

export const SegmentSideMetadataPanel = memo(function SegmentSideMetadataPanel({
  file,
  segment,
  segmentIndex,
  onResult,
  window,
  journalParameters,
  onCopyToBrief,
  onSeedReverseQuery,
}: {
  file: File | null;
  segment: AudioSegmentResultPoint | null;
  segmentIndex: number;
  onResult: (patch: Partial<SegmentSideMeta>) => void;
  window: { offset: number; duration: number };
  journalParameters: ActiveParameter[];
  onCopyToBrief: (text: string) => void;
  onSeedReverseQuery: (text: string) => void;
}) {
  const t = useUiText();
  const helmEnabled = useCapabilityEnabled("side-meta.helm");
  const voiceEnabled = useCapabilityEnabled("side-meta.voice");
  const indicEnabled = useCapabilityEnabled("side-meta.indic");
  const dspEnabled = useCapabilityEnabled("side-meta.librosa");
  const lfm3Enabled = useCapabilityEnabled("side-meta.lfm3");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");
  const [lfmRuntime, setLfmRuntime] = useState<Lfm3Runtime>("ollama");
  const [lfmMode, setLfmMode] = useState<Lfm3PromptMode>("describe");
  const [lfmResult, setLfmResult] = useState<NonNullable<SegmentSideMeta["lfm3_description"]> | null>(null);
  const [lfmResultSegmentKey, setLfmResultSegmentKey] = useState<string | null>(null);
  const acceptedLfm3Description = segment?.sideMeta?.lfm3_description;
  const segmentKey = segment ? `${segment.offset}:${segment.duration}` : `range:${window.offset}:${window.duration}`;
  const visibleLfmResult = lfmResultSegmentKey === segmentKey ? lfmResult : null;

  const runLfm3 = async () => {
    if (!file || busy) return;
    setBusy("lfm3");
    setError("");
    setLfmResult(null);
    try {
      const form = new FormData();
      form.set("audio", file, file.name);
      form.set("runtime", lfmRuntime);
      form.set("mode", lfmMode);
      form.set("offset", String(segment?.offset ?? window.offset));
      form.set("duration", String(segment?.duration ?? window.duration));
      const response = await fetch("/api/am-stage/lfm3-audio", { method: "POST", body: form });
      const payload = await response.json() as { text?: string; model?: string; runtime?: Lfm3Runtime; quantization?: string | null; mode?: Lfm3PromptMode; ran_at?: string; offset_seconds?: number; duration_seconds?: number; error?: string };
      if (!response.ok || !payload.text || !payload.model || !payload.runtime || !payload.ran_at) throw new Error(payload.error || t("LFM3 description failed."));
      setLfmResult({ model: payload.model, runtime: payload.runtime, quantization: payload.quantization ?? null, mode: payload.mode ?? lfmMode, ran_at: payload.ran_at, text: payload.text, offset_seconds: payload.offset_seconds ?? window.offset, duration_seconds: payload.duration_seconds ?? window.duration });
      setLfmResultSegmentKey(segmentKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

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
      if (specialist === "gender") form.set("helm_has_vocals", String(segment.sideMeta?.helm?.gates.has_vocals.value === true));
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
      {SPECIALISTS.map(({ id, label }) => { const enabled = id === "helm" ? helmEnabled : id === "gender" ? voiceEnabled : indicEnabled; return <Button key={id} size="sm" variant="outline" data-am-stage-action={`side-meta-${id}`} disabled={enabled !== true || !file || !segment || busy !== null || (id === "gender" && segment.sideMeta?.helm?.gates.has_vocals.value !== true)} title={enabled === false ? t("Disabled in Settings") : id === "helm" ? t("Temporarily unavailable · disabled by operator.") : id === "gender" ? t("Run Helm first; voice presentation is available only when vocals are detected.") : undefined} onClick={() => void run(id)}>{busy === id ? t("Running…") : t(label)}</Button>; })}
      <Button size="sm" variant="outline" data-am-stage-action="extract-acoustic-features" disabled={dspEnabled !== true || !file || !segment || busy !== null || (segment.duration < 0.25 || segment.duration > 30)} title={dspEnabled === false ? t("Disabled in Settings") : segment && segment.duration > 30 ? t("Acoustic feature windows are limited to 30 seconds.") : undefined} onClick={() => void runAcousticExtraction()}>{busy === "acoustic" ? t("Extracting…") : t("Extract acoustic features")}</Button>
    </div>
    <div data-am-stage-zone="lfm3-audio-description" className="space-y-2 rounded border border-cyan-400/20 bg-black/25 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-200">LFM3 · Audio to text</h3><Badge variant="outline">{segment ? `${t("Segment")} ${segmentIndex + 1}` : t("Current audio range")}</Badge></div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="text-[9px] text-zinc-400">{t("Runtime")}<select aria-label={t("Runtime")} value={lfmRuntime} disabled={busy !== null} onChange={(event) => setLfmRuntime(event.target.value as Lfm3Runtime)} className="mt-1 h-8 w-full rounded border border-white/15 bg-black/50 px-2 text-xs text-zinc-200"><option value="llama.cpp">{t("llama.cpp · GGUF")}</option><option value="ollama">{t("Ollama · verified local")}</option></select></label>
        <label className="text-[9px] text-zinc-400">{t("Task")}<select aria-label={t("Task")} value={lfmMode} disabled={busy !== null} onChange={(event) => setLfmMode(event.target.value as Lfm3PromptMode)} className="mt-1 h-8 w-full rounded border border-white/15 bg-black/50 px-2 text-xs text-zinc-200"><option value="describe">{t("Sound description · EN")}</option><option value="asr">{t("Speech recognition · EN")}</option></select></label>
        <Button size="sm" variant="outline" data-am-stage-action="describe-segment-lfm3" disabled={lfm3Enabled !== true || !file || busy !== null || (segment ? segment.duration < 0.25 || segment.duration > 30 : window.duration < 0.25 || window.duration > 30)} title={lfm3Enabled === false ? t("Disabled in Settings") : undefined} onClick={() => void runLfm3()}>{busy === "lfm3" ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}{busy === "lfm3" ? t("Listening…") : t("Describe segment / clip (LFM3)")}</Button>
      </div>
      <p className="text-[9px] text-zinc-500">{t("Explicit run only · max 30 seconds · one model at a time. Ollama · verified local is the default; llama.cpp GGUF is an alternate runtime.")}</p>
      {visibleLfmResult ? <div className="space-y-2 rounded border border-cyan-400/15 bg-black/35 p-2">
        <textarea aria-label={t("LFM3 result") } readOnly value={visibleLfmResult.text} className="min-h-20 w-full resize-y rounded border border-white/10 bg-black/35 p-2 text-xs leading-relaxed text-zinc-200" />
        <div className="flex flex-wrap items-center gap-1 text-[9px] text-zinc-500"><span>{visibleLfmResult.model}</span><span>·</span><span>{visibleLfmResult.runtime}</span>{visibleLfmResult.quantization ? <><span>·</span><span>{visibleLfmResult.quantization}</span></> : null}<span>·</span><span>{visibleLfmResult.offset_seconds.toFixed(1)}–{(visibleLfmResult.offset_seconds + visibleLfmResult.duration_seconds).toFixed(1)}s</span></div>
        <div className="flex flex-wrap gap-1.5">
          {segment ? <Button size="sm" variant="secondary" data-am-stage-action="accept-lfm3-segment-description" onClick={() => { onResult({ lfm3_description: visibleLfmResult }); setLfmResult(null); }}>{t("Keep on segment")}</Button> : <span className="self-center text-[9px] text-zinc-500">{t("Create segments to store this description in a session snapshot.")}</span>}
          <Button size="sm" variant="outline" data-am-stage-action="lfm3-copy-to-brief" onClick={() => onCopyToBrief(visibleLfmResult.text)}>{t("Copy to Brief")}</Button>
          <Button size="sm" variant="outline" data-am-stage-action="lfm3-seed-reverse-query" onClick={() => onSeedReverseQuery(visibleLfmResult.text)}>{t("Seed Reverse Query")}</Button>
          {journalParameters.length ? <JournalDraftButton modality="audio" engine="lfm3-audio" parameters={journalParameters} model={{ id: visibleLfmResult.model, ...(visibleLfmResult.quantization ? { revision: visibleLfmResult.quantization } : {}) }} settings={{ runtime: visibleLfmResult.runtime, mode: visibleLfmResult.mode, offset: visibleLfmResult.offset_seconds, duration: visibleLfmResult.duration_seconds }} query={visibleLfmResult.text} asset={file} label={`LFM3 audio description · ${file?.name ?? "clip"}`} actionLabel="Save to Journal" /> : <span className="self-center text-[9px] text-zinc-500">{t("Run a parameter analysis before saving this clip to Journal.")}</span>}
        </div>
      </div> : null}
      {acceptedLfm3Description && !visibleLfmResult ? <div className="space-y-1 rounded border border-cyan-400/15 bg-black/35 p-2"><div className="flex items-center justify-between gap-2 text-[9px] text-zinc-500"><span>{t("Accepted LFM3 description")}</span><span>{acceptedLfm3Description.runtime} · {acceptedLfm3Description.quantization ?? "GGUF"}</span></div><p className="text-xs leading-relaxed text-zinc-200">{acceptedLfm3Description.text}</p><div className="flex flex-wrap gap-1.5"><Button size="sm" variant="outline" onClick={() => onCopyToBrief(acceptedLfm3Description.text)}>{t("Copy to Brief")}</Button><Button size="sm" variant="outline" onClick={() => onSeedReverseQuery(acceptedLfm3Description.text)}>{t("Seed Reverse Query")}</Button></div></div> : null}
    </div>
    {error ? <p role="alert" className="break-words rounded border border-red-400/30 bg-red-950/20 p-2 text-[10px] text-red-200">{error}</p> : null}
    {segment?.sideMeta ? <div className="space-y-1 text-[10px] text-zinc-300">
      {segment.sideMeta.helm ? <p><span className="text-fuchsia-200">Helm:</span> {Object.entries(segment.sideMeta.helm.gates).map(([name, gate]) => `${t(name)} ${gate.value === null ? "—" : gate.value ? t("Yes") : t("No")} (${gate.probability === null ? "—" : gate.probability.toFixed(2)})`).join(" · ")}</p> : null}
      {segment.sideMeta.gender ? <p><span className="text-fuchsia-200">{t("Voice presentation")}:</span> {t(segment.sideMeta.gender.label)} · {segment.sideMeta.gender.score.toFixed(2)}</p> : null}
      {segment.sideMeta.language ? <div className="flex flex-wrap items-center gap-1"><p className="min-w-0 flex-1"><span className="text-fuchsia-200">{t("Indic languages")}:</span> {segment.sideMeta.language.tags.map((tag) => `${tag.code} ${tag.label} (${tag.confidence.toFixed(2)})`).join(" · ") || `${t(segment.sideMeta.language.status === "no_indic" ? "No Indic language detected" : "No language above confidence threshold.")} · ${t("top")} ${segment.sideMeta.language.top_confidence.toFixed(2)} / τ ${segment.sideMeta.language.threshold?.toFixed(2) ?? "0.78"}`}</p>{segment.sideMeta.language.tags.length ? <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => void navigator.clipboard.writeText(segment.sideMeta?.language?.tags.map((tag) => tag.code).join(", ") ?? "")}><Copy className="mr-1 size-3" />{t("Copy tags")}</Button> : null}</div> : null}
      {segment.sideMeta.acoustic_features ? <AcousticFeatureSummary features={segment.sideMeta.acoustic_features} t={t} /> : null}
    </div> : null}
  </section>;
});

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
