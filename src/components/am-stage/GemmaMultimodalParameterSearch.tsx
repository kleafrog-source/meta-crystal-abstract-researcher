"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Search, Square, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/lib/ui-i18n";
import { useCapabilityEnabled } from "@/hooks/use-capability-registry";
import type { ActiveParameter } from "@/lib/rag-v3/types";

interface GemmaAudioSearchResponse {
  error?: string;
  type?: "progress" | "complete" | "error";
  modality?: "audio" | "image";
  model?: string;
  dimensions?: number;
  duration_seconds?: number;
  offset_seconds?: number;
  total_candidates?: number;
  current?: number;
  total?: number;
  failed?: boolean;
  chunks?: number;
  failed_chunks?: Array<{ index: number; offset_seconds: number; duration_seconds: number; error: string }>;
  results?: GemmaAudioParameter[];
}

export type GemmaAudioParameter = ActiveParameter & { source_window?: { offset_seconds: number; duration_seconds: number } };
export interface GemmaMultimodalParameterSearchHandle { searchAudio: (audioFile?: File) => Promise<GemmaAudioParameter[] | null>; cancel: () => void }

export const GemmaMultimodalParameterSearch = forwardRef<GemmaMultimodalParameterSearchHandle, { audioFile?: File | null; selectedLayers?: string[]; spectrogramFrame?: { dataUrl: string; offset: number }; onResults?: (results: GemmaAudioParameter[], modality: "audio" | "image") => void }>(function GemmaMultimodalParameterSearch({ audioFile = null, selectedLayers = [], spectrogramFrame, onResults }, ref) {
  const t = useUiText();
  const audioCapabilityEnabled = useCapabilityEnabled("audio.gemma.awtd");
  const imageCapabilityEnabled = useCapabilityEnabled("spec.gemma.*");
  const [topK, setTopK] = useState(30);
  const [chunkSeconds, setChunkSeconds] = useState(30);
  const [overlapSeconds, setOverlapSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [totalChunks, setTotalChunks] = useState(0);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GemmaAudioSearchResponse | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const search = async (modality: "audio" | "image", audioOverride?: File): Promise<GemmaAudioParameter[] | null> => {
    const audioInput = audioOverride ?? audioFile;
    if (modality === "audio" && !audioInput) return null;
    if (modality === "image" && !spectrogramFrame) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); setError(null); setResults(null); setProgress(modality === "audio" ? t("Preparing audio…") : t("Searching spectrogram frame…"));
    let finalResults: GemmaAudioParameter[] | null = null;
    try {
      const form = new FormData();
      form.set("modality", modality);
      if (modality === "audio" && audioInput) {
        form.set("audio", audioInput!, audioInput!.name);
        form.set("chunk_seconds", String(chunkSeconds));
        form.set("overlap_seconds", String(overlapSeconds));
      } else if (modality === "image" && spectrogramFrame) {
        if (!spectrogramFrame.dataUrl.startsWith("data:image/png;base64,")) throw new Error(t("Invalid spectrogram image data."));
        const encoded = spectrogramFrame.dataUrl.split(",")[1];
        if (!encoded) throw new Error(t("Invalid spectrogram image data."));
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        form.set("image", new Blob([bytes], { type: "image/png" }), "siglip-spectrogram.png");
        form.set("offset", String(spectrogramFrame.offset));
      }
      form.set("top_k", String(topK));
      form.set("domain_layers", JSON.stringify(selectedLayers));
      const response = await fetch("/api/rag-v3/gemma-audio-search", { method: "POST", body: form, signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json() as GemmaAudioSearchResponse;
        throw new Error(payload.error || t("Gemma audio search failed."));
      }
      if (modality === "image") {
        const payload = await response.json() as GemmaAudioSearchResponse;
        setResults(payload); setTotalChunks(1); setProgress("");
        onResults?.(payload.results ?? [], modality);
        finalResults = payload.results ?? [];
      } else {
        if (!response.body) throw new Error(t("Audio search returned no progress stream."));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let completed = false;
        const handleLine = (line: string) => {
          if (!line.trim()) return;
            const event = JSON.parse(line) as GemmaAudioSearchResponse;
          if (event.type === "error") throw new Error(event.error || t("Gemma audio search failed."));
          if (event.type === "progress") {
            setTotalChunks(event.total ?? 0);
            const progressMessage = event.failed ? t("Chunk {current}/{total} failed; continuing.") : t("Chunk {current}/{total}");
            setProgress(progressMessage.replace("{current}", String(event.current ?? 0)).replace("{total}", String(event.total ?? 0)));
            if (event.results) setResults(event);
          }
          if (event.type === "complete") {
            completed = true;
            setTotalChunks(event.chunks ?? 0);
            setResults(event);
            setProgress("");
            onResults?.(event.results ?? [], modality);
            finalResults = event.results ?? [];
            if (event.failed_chunks?.length) {
              const failed = event.failed_chunks.length;
              setError(t("{failed} of {total} audio chunks failed; results include successful chunks.").replace("{failed}", String(failed)).replace("{total}", String(event.total ?? event.chunks ?? 0)));
            }
          }
        };
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n"); pending = lines.pop() ?? "";
          for (const line of lines) handleLine(line);
          if (done) break;
        }
        if (pending.trim()) handleLine(pending);
        if (!completed) throw new Error(t("Audio search ended before the final chunk."));
      }
    } catch (cause) {
      if (controller.signal.aborted) setProgress(t("Search cancelled."));
      else setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      controllerRef.current = null;
      setBusy(false);
    }
    return finalResults;
  };

  useImperativeHandle(ref, () => ({ searchAudio: (input) => search("audio", input), cancel: () => controllerRef.current?.abort() }), [audioFile, chunkSeconds, overlapSeconds, selectedLayers, topK]);

  return (
    <details data-am-stage-zone="gemma-audio-query" className="rounded-lg border border-violet-400/25 bg-black/30 p-3">
      <summary className="flex flex-wrap cursor-pointer list-none items-center justify-between gap-2 text-xs font-mono uppercase tracking-wider text-violet-200 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{t("Experimental · EmbeddingGemma audio / spectrogram → parameters")}</span>
        <Badge variant="outline" className="shrink-0 border-violet-400/30 text-violet-200">{t("Manual only · no idle load")}</Badge>
      </summary>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("Audio is normalized via the CLAP audio pipeline to mono 48 kHz PCM WAV. Sequential windows are at most 30 seconds and search the existing Gemma text index; this does not replace CLAP or SigLIP2.")}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{t("This mode retrieves parameter identities; suggested values remain at catalogue defaults.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground" title={audioFile?.name ?? t("Load audio in Work axis first.")}>
          <Upload className="size-4 shrink-0" /><span className="truncate">{audioFile?.name ?? t("Load audio in Work axis first.")}</span>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">{t("Chunk s")}<input className="h-9 w-16 rounded border border-border bg-background px-2 text-foreground" aria-label={t("Chunk seconds")} type="number" min={1} max={30} value={chunkSeconds} onChange={(event) => setChunkSeconds(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">{t("Overlap s")}<input className="h-9 w-14 rounded border border-border bg-background px-2 text-foreground" aria-label={t("Overlap seconds")} type="number" min={0} max={2} step={0.5} value={overlapSeconds} onChange={(event) => setOverlapSeconds(Math.max(0, Math.min(2, Number(event.target.value) || 0)))} /></label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">{t("Top-K")}<input className="h-9 w-16 rounded border border-border bg-background px-2 text-foreground" aria-label={t("Top-K")} type="number" min={1} max={100} value={topK} onChange={(event) => setTopK(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
        <Button data-am-stage-action="gemma-audio-search" onClick={() => void search("audio")} disabled={!audioFile || busy || audioCapabilityEnabled !== true} title={audioCapabilityEnabled === false ? t("Disabled in Settings") : undefined}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{busy ? t("Embedding media…") : t("Search audio")}</Button>
        {busy ? <Button variant="destructive" size="sm" onClick={() => controllerRef.current?.abort()}><Square className="size-3.5" />{t("Cancel")}</Button> : null}
        {spectrogramFrame ? <Button data-am-stage-action="gemma-spectrogram-search" variant="outline" onClick={() => void search("image")} disabled={busy || imageCapabilityEnabled !== true} title={imageCapabilityEnabled === false ? t("Disabled in Settings") : undefined}><Search className="size-4" />{t("Search current SigLIP frame")} · {spectrogramFrame.offset.toFixed(1)}s</Button> : null}
      </div>
      {progress ? <p role="status" aria-live="polite" className="mt-2 text-xs text-cyan-200">{progress}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded border border-red-400/30 bg-red-950/20 p-2 text-xs text-red-200">{error}</p> : null}
      {results ? <div className="mt-3 space-y-2">
        {results.type === "progress" ? <p className="text-[10px] text-muted-foreground">{progress}</p> : <p className="text-[10px] text-muted-foreground">{results.modality === "image"
          ? t("SigLIP spectrogram at {offset}s · {count} candidates · {dimensions}D").replace("{offset}", Number(results.offset_seconds ?? 0).toFixed(1)).replace("{count}", String(results.total_candidates ?? 0)).replace("{dimensions}", String(results.dimensions ?? 0))
          : t("Audio query matched {count} candidates · {duration}s · {dimensions}D").replace("{count}", String(results.total_candidates ?? 0)).replace("{duration}", Number(results.duration_seconds ?? 0).toFixed(1)).replace("{dimensions}", String(results.dimensions ?? 0))}</p>}
        {results.type === "complete" ? <p className="text-[10px] text-muted-foreground">{t("Merged {chunks} chunks by best similarity per parameter.").replace("{chunks}", String(totalChunks || 1))}{results.failed_chunks?.length ? ` · ${t("{count} chunks failed").replace("{count}", String(results.failed_chunks.length))}` : ""}</p> : null}
        <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{(results.results ?? []).map((item) => <li key={item.technical_name} className="min-w-0 rounded border border-white/10 bg-black/25 p-2 text-[10px]"><div className="truncate font-mono text-violet-200">{item.technical_name}</div><div className="mt-1 line-clamp-2 text-foreground">{item.name_ru || item.description_en || item.category}</div><div className="mt-1 flex justify-between gap-2 text-muted-foreground"><span>{t("Similarity")} {item.similarity.toFixed(3)}</span><span className="truncate">{String(item.suggested_value)}</span></div></li>)}</ol>
      </div> : null}
    </details>
  );
});
