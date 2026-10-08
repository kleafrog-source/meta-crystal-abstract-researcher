"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play, Square, ZoomIn } from "lucide-react";
import { WaveForm, WaveSurfer, useWavesurferContext } from "wavesurfer-react";
import type WaveSurferRef from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.esm.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.esm.js";
import { Button } from "@/components/ui/button";

interface Props {
  url: string; offset: number; duration: number; totalDuration: number;
  onDuration: (value: number) => void; onRegion: (offset: number, duration: number) => void;
  onFile: (file: File) => void;
}

export function AudioWaveformEditor(props: Props) {
  const [mounted, setMounted] = useState<WaveSurferRef | null>(null);
  const [showSpectrum, setShowSpectrum] = useState(false);
  const plugins = useMemo(() => {
    const items = [
      { plugin: RegionsPlugin, key: "regions", options: undefined },
      { plugin: RecordPlugin, key: "record", options: { renderRecordedAudio: false } },
    ];
    if (showSpectrum) items.push({ plugin: SpectrogramPlugin, key: "spectrogram", options: { container: "#clap-spectrogram", labels: true, height: 120 } } as never);
    return items;
  }, [showSpectrum]);

  return <div className="rounded border border-cyan-400/25 bg-black/35 p-3" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file?.type.startsWith("audio/") || file) props.onFile(file); }}>
    <WaveSurfer container="#clap-waveform" plugins={plugins as never} onMount={setMounted} url={props.url} height={128} waveColor="#64748b" progressColor="#22d3ee" cursorColor="#f8fafc" dragToSeek normalize barWidth={2} barGap={1} minPxPerSec={4}>
      <div className="overflow-hidden rounded"><WaveForm id="clap-waveform" /></div>
      <WaveformController {...props} wavesurfer={mounted} onRecorded={(blob) => props.onFile(new File([blob], `recording-${Date.now()}.webm`, { type: blob.type || "audio/webm" }))} />
    </WaveSurfer>
    <details className="mt-3" onToggle={(event) => setShowSpectrum(event.currentTarget.open)}><summary className="cursor-pointer text-xs text-zinc-400">Спектрограмма</summary><div id="clap-spectrogram" className="mt-2 overflow-hidden rounded bg-black" /></details>
    <p className="mt-2 text-[11px] text-zinc-500">Перетащите аудиофайл сюда. Голубую область можно перемещать и растягивать; протяните по свободной волне, чтобы выбрать новый фрагмент.</p>
  </div>;
}

function WaveformController({ wavesurfer, offset, duration, totalDuration, onDuration, onRegion, onRecorded }: Props & { wavesurfer: WaveSurferRef | null; onRecorded: (blob: Blob) => void }) {
  const context = useWavesurferContext();
  const plugins = context?.[1] as unknown as { regions?: RegionsPlugin; record?: RecordPlugin } | undefined;
  const regionRef = useRef<ReturnType<RegionsPlugin["addRegion"]> | null>(null);
  const syncing = useRef(false);
  const [playing, setPlaying] = useState(false); const [loop, setLoop] = useState(true); const loopRef = useRef(true); const [dragSelect, setDragSelect] = useState(true); const [dragSeek, setDragSeek] = useState(true); const [recording, setRecording] = useState(false); const [zoom, setZoom] = useState(4);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  useEffect(() => { wavesurfer?.setOptions({ dragToSeek: dragSeek }); }, [dragSeek, wavesurfer]);

  useEffect(() => { if (!wavesurfer) return; return wavesurfer.on("ready", () => onDuration(wavesurfer.getDuration())); }, [onDuration, wavesurfer]);
  useEffect(() => { if (!wavesurfer) return; const a = wavesurfer.on("play", () => setPlaying(true)); const b = wavesurfer.on("pause", () => setPlaying(false)); return () => { a(); b(); }; }, [wavesurfer]);
  useEffect(() => {
    const regions = plugins?.regions; if (!regions || !totalDuration) return;
    regions.clearRegions();
    regionRef.current = regions.addRegion({ id: "selection", start: offset, end: Math.min(totalDuration, offset + duration), drag: true, resize: true, minLength: 1, maxLength: Math.min(800, totalDuration), color: "rgba(34,211,238,.22)" });
    const stopUpdated = regions.on("region-updated", (region) => { if (!syncing.current) onRegion(region.start, Math.max(1, region.end - region.start)); });
    const stopCreated = regions.on("region-created", (region) => { if (region.id !== "selection") { regionRef.current?.remove(); regionRef.current = region; onRegion(region.start, Math.max(1, region.end - region.start)); } });
    const stopIn = regions.on("region-in", (region) => { if (region === regionRef.current) onRegion(region.start, Math.max(1, region.end - region.start)); });
    const stopOut = regions.on("region-out", (region) => { if (loopRef.current && region === regionRef.current) region.play(true); });
    const disableSelection = dragSelect ? regions.enableDragSelection({ color: "rgba(34,211,238,.22)", minLength: 1, maxLength: Math.min(800, totalDuration) }) : () => undefined;
    return () => { stopUpdated(); stopCreated(); stopIn(); stopOut(); disableSelection(); };
  }, [dragSelect, onRegion, plugins?.regions, totalDuration]);
  useEffect(() => {
    const region = regionRef.current; if (!region || !totalDuration) return;
    syncing.current = true; region.setOptions({ start: Math.max(0, offset), end: Math.min(totalDuration, offset + duration) }); syncing.current = false;
  }, [duration, offset, totalDuration]);
  useEffect(() => { const record = plugins?.record; if (!record) return; return record.on("record-end", (blob) => { setRecording(false); onRecorded(blob); }); }, [onRecorded, plugins?.record]);

  const toggleRecord = async () => { const record = plugins?.record; if (!record) return; if (record.isRecording()) record.stopRecording(); else { await record.startRecording(); setRecording(true); } };
  return <div className="mt-3 flex flex-wrap items-center gap-2">
    <Button type="button" size="sm" variant="outline" onClick={() => regionRef.current ? regionRef.current.play(true) : wavesurfer?.playPause()}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}Фрагмент</Button>
    <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />Loop regions</label>
    <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={dragSelect} onChange={(e) => setDragSelect(e.target.checked)} />Drag select</label>
    <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={dragSeek} onChange={(e) => setDragSeek(e.target.checked)} />Drag to seek</label>
    <Button type="button" size="sm" variant={recording ? "destructive" : "outline"} onClick={() => void toggleRecord()}>{recording ? <Square className="size-4" /> : <Mic className="size-4" />}{recording ? "Стоп" : "Записать"}</Button>
    <ZoomIn className="ml-auto size-4 text-zinc-500" /><input aria-label="Zoom" type="range" min={1} max={100} value={zoom} onChange={(e) => { const value = Number(e.target.value); setZoom(value); wavesurfer?.zoom(value); }} />
  </div>;
}
