"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useUiText } from "@/lib/ui-i18n";
import type { AudioSegmentResultPoint } from "@/lib/audio-segment-result";
import type { SegmentSideMeta } from "@/lib/segment-side-meta";

type Specialist = "helm" | "gender" | "language";

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
  const [busy, setBusy] = useState<Specialist | null>(null);
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
    </div>
    {error ? <p role="alert" className="break-words rounded border border-red-400/30 bg-red-950/20 p-2 text-[10px] text-red-200">{error}</p> : null}
    {segment?.sideMeta ? <div className="space-y-1 text-[10px] text-zinc-300">
      {segment.sideMeta.helm ? <p><span className="text-fuchsia-200">Helm:</span> {Object.entries(segment.sideMeta.helm.gates).map(([name, gate]) => `${t(name)} ${gate.value === null ? "—" : gate.value ? t("Yes") : t("No")} (${gate.probability === null ? "—" : gate.probability.toFixed(2)})`).join(" · ")}</p> : null}
      {segment.sideMeta.gender ? <p><span className="text-fuchsia-200">{t("Voice presentation")}:</span> {t(segment.sideMeta.gender.label)} · {segment.sideMeta.gender.score.toFixed(2)}</p> : null}
      {segment.sideMeta.language ? <div className="flex flex-wrap items-center gap-1"><p className="min-w-0 flex-1"><span className="text-fuchsia-200">{t("Indic languages")}:</span> {segment.sideMeta.language.tags.map((tag) => `${tag.code} ${tag.label} (${tag.confidence.toFixed(2)})`).join(" · ") || t("No language above confidence threshold.")}</p>{segment.sideMeta.language.tags.length ? <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => void navigator.clipboard.writeText(segment.sideMeta?.language?.tags.map((tag) => tag.code).join(", ") ?? "")}><Copy className="mr-1 size-3" />{t("Copy tags")}</Button> : null}</div> : null}
    </div> : null}
  </section>;
}
