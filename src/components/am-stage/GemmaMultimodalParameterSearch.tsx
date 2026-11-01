"use client";

import { useState } from "react";
import { Loader2, Search, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/lib/ui-i18n";
import type { ActiveParameter } from "@/lib/rag-v3/types";

interface GemmaAudioSearchResponse {
  error?: string;
  modality?: "audio" | "image";
  model?: string;
  dimensions?: number;
  duration_seconds?: number;
  offset_seconds?: number;
  total_candidates?: number;
  results?: ActiveParameter[];
}

export function GemmaMultimodalParameterSearch({ selectedLayers = [], spectrogramFrame }: { selectedLayers?: string[]; spectrogramFrame?: { dataUrl: string; offset: number } }) {
  const t = useUiText();
  const [file, setFile] = useState<File | null>(null);
  const [topK, setTopK] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GemmaAudioSearchResponse | null>(null);

  const search = async (modality: "audio" | "image") => {
    if (modality === "audio" && !file) return;
    if (modality === "image" && !spectrogramFrame) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const form = new FormData();
      form.set("modality", modality);
      if (modality === "audio" && file) {
        form.set("audio", file);
      } else if (modality === "image" && spectrogramFrame) {
        if (!spectrogramFrame.dataUrl.startsWith("data:image/png;base64,")) throw new Error(t("Invalid spectrogram image data."));
        const encoded = spectrogramFrame.dataUrl.split(",")[1];
        if (!encoded) throw new Error(t("Invalid spectrogram image data."));
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        form.set("image", new Blob([bytes], { type: "image/png" }), "siglip-spectrogram.png");
      }
      form.set("top_k", String(topK));
      form.set("domain_layers", JSON.stringify(selectedLayers));
      if (modality === "image" && spectrogramFrame) form.set("offset", String(spectrogramFrame.offset));
      const response = await fetch("/api/rag-v3/gemma-audio-search", { method: "POST", body: form });
      const payload = await response.json() as GemmaAudioSearchResponse;
      if (!response.ok) throw new Error(payload.error || t("Gemma audio search failed."));
      setResults(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details data-am-stage-zone="gemma-audio-query" className="rounded-lg border border-violet-400/25 bg-black/30 p-3">
      <summary className="flex flex-wrap cursor-pointer list-none items-center justify-between gap-2 text-xs font-mono uppercase tracking-wider text-violet-200 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{t("Experimental · EmbeddingGemma audio / spectrogram → parameters")}</span>
        <Badge variant="outline" className="shrink-0 border-violet-400/30 text-violet-200">{t("Manual only · no idle load")}</Badge>
      </summary>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("Embeds a short PCM WAV or the current SigLIP spectrogram PNG with EmbeddingGemma 2 and searches the existing Gemma text-parameter index. This is experimental and does not replace CLAP or SigLIP2.")}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{t("This mode retrieves parameter identities; suggested values remain at catalogue defaults.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          <Upload className="size-4 shrink-0" />
          <span className="truncate">{file?.name ?? t("Choose PCM WAV · up to 30 seconds")}</span>
          <input className="sr-only" type="file" accept=".wav,audio/wav,audio/x-wav" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); setResults(null); }} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("Top-K")}
          <input className="h-9 w-16 rounded border border-border bg-background px-2 text-foreground" aria-label={t("Top-K")} type="number" min={1} max={100} value={topK} onChange={(event) => setTopK(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} />
        </label>
        <Button data-am-stage-action="gemma-audio-search" onClick={() => void search("audio")} disabled={!file || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {busy ? t("Embedding media…") : t("Search with WAV")}
        </Button>
        {spectrogramFrame ? <Button data-am-stage-action="gemma-spectrogram-search" variant="outline" onClick={() => void search("image")} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {t("Search current SigLIP frame")} · {spectrogramFrame.offset.toFixed(1)}s
        </Button> : null}
      </div>
      {error ? <p role="alert" className="mt-2 rounded border border-red-400/30 bg-red-950/20 p-2 text-xs text-red-200">{error}</p> : null}
      {results ? <div className="mt-3 space-y-2">
        <p className="text-[10px] text-muted-foreground">{results.modality === "image"
          ? t("SigLIP spectrogram at {offset}s · {count} candidates · {dimensions}D").replace("{offset}", Number(results.offset_seconds ?? 0).toFixed(1)).replace("{count}", String(results.total_candidates ?? 0)).replace("{dimensions}", String(results.dimensions ?? 0))
          : t("Audio query matched {count} candidates · {duration}s · {dimensions}D").replace("{count}", String(results.total_candidates ?? 0)).replace("{duration}", Number(results.duration_seconds ?? 0).toFixed(1)).replace("{dimensions}", String(results.dimensions ?? 0))}</p>
        <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {(results.results ?? []).map((item) => <li key={item.technical_name} className="min-w-0 rounded border border-white/10 bg-black/25 p-2 text-[10px]">
            <div className="truncate font-mono text-violet-200">{item.technical_name}</div>
            <div className="mt-1 line-clamp-2 text-foreground">{item.name_ru || item.description_en || item.category}</div>
            <div className="mt-1 flex justify-between gap-2 text-muted-foreground"><span>{t("Similarity")} {item.similarity.toFixed(3)}</span><span className="truncate">{String(item.suggested_value)}</span></div>
          </li>)}
        </ol>
      </div> : null}
    </details>
  );
}
