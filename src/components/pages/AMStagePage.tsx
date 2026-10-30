"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Download,
  Loader2,
  Scissors,
  Square,
  Upload,
  Zap,
} from "lucide-react";

import { AudioWaveformEditor } from "@/components/audio/AudioWaveformEditor";
import { SemanticSearch } from "@/components/rag-v3/SemanticSearch";
import { JournalDraftButton } from "@/components/cross-modal/JournalDraftButton";
import { MacroGenerator } from "@/components/rag-v3/MacroGenerator";
import { VirtualizedParamList } from "@/components/rag-v3/VirtualizedParamList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AMIcon } from "@/components/ui/am-icon";
import {
  blendParameterFrames,
  buildAudioAnalysisPoints,
  buildPriorityTimeline,
  interpolateParameterFrames,
  smoothTimelineSegments,
} from "@/lib/audio-segment-timeline";
import {
  applySuccessfulSegmentResult,
  getIncompleteSegmentIndexes,
  prepareSegmentRun,
  type AudioAnalysisStatus,
  type AudioEngine,
  type AudioSegmentResultPoint,
} from "@/lib/audio-segment-result";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { ACOUSTIC_DOMAIN_LAYERS, GLOBAL_CONSENSUS_LAYER } from "@/lib/domain-layers";
import { useRagV3Store } from "@/store/rag-v3-store";
import { classifyDomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";
import { buildLayerTimelineLanes, LAYER_TIMELINE_SERIES_LIMIT } from "@/lib/am-stage-layer-timeline";

type Engine = AudioEngine;
type AnalysisStatus = AudioAnalysisStatus;
type SpectrogramDetail = "low" | "medium" | "high";
type SpectrogramScale = "linear" | "logarithmic" | "mel" | "bark" | "erb";
type SpectrogramRenderer = "standard" | "windowed";
type SiglipSpectrogramLayout = "mel" | "composite" | "rgb_delta";

type SegmentPoint = AudioSegmentResultPoint;
const TEST_PRESET_BRIEF = "Vocal formant and glottal articulation over granular wavetable synthesis; spectral filtering and distortion; binaural spatial motion and room reflections; dynamics envelope, compression and transient control; evolving polyrhythmic tempo and syncopation; chaotic stochastic modulation and attractor variation; compositional omega state-vector transitions; LFO performance expression and MIDI velocity.";

interface SegmentResponse {
  parameters?: ActiveParameter[];
  error?: string;
  spectrogram?: Record<string, unknown> & { image_base64?: string };
}

interface MorphoStatus {
  ready: boolean;
  status: string;
  stale_reasons?: string[];
  index_job?: {
    running?: boolean;
    progress?: { current?: number; total?: number };
  };
}

interface GraphSeries {
  key: string;
  label: string;
  source: Engine;
  values: Array<{ time: number; value: number; min: number; max: number }>;
  movement: number;
}

const COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#60a5fa",
  "#fb7185",
  "#c084fc",
];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00.0";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

function mergeFrames(
  first: ActiveParameter[],
  second: ActiveParameter[],
): ActiveParameter[] {
  const merged = new Map(
    first.map((parameter) => [parameter.technical_name, parameter]),
  );
  for (const parameter of second)
    if (!merged.has(parameter.technical_name))
      merged.set(parameter.technical_name, parameter);
  return [...merged.values()];
}

function currentFrame(
  segments: Array<{ time: number; clap: ActiveParameter[]; siglip: ActiveParameter[] }>,
  time: number,
  engine: Engine,
  interpolate: boolean,
): ActiveParameter[] {
  if (!segments.length) return [];
  let index = 0;
  for (let i = 0; i < segments.length; i += 1)
    if (segments[i].time <= time) index = i;
  const field = engine === "clap" ? "clap" : "siglip";
  const current = segments[index][field];
  const next = segments[index + 1];
  if (!interpolate || !next || next.time <= segments[index].time)
    return current;
  const progress =
    (time - segments[index].time) / (next.time - segments[index].time);
  return interpolateParameterFrames(current, next[field], progress);
}

function statusClass(status: AnalysisStatus): string {
  if (status === "complete")
    return "border-emerald-400/50 bg-emerald-950/30 text-emerald-200";
  if (status === "processing")
    return "border-amber-400/50 bg-amber-950/30 text-amber-200";
  if (status === "error") return "border-red-400/50 bg-red-950/30 text-red-200";
  return "border-white/15 bg-zinc-950 text-zinc-400";
}

export function AMStagePage() {
  const v3Parameters = useRagV3Store((state) => state.activeParameters);
  const setV3Query = useRagV3Store((state) => state.setQuery);
  const updateV3ParameterValue = useRagV3Store((state) => state.updateParameterValue);
  const removeV3Parameter = useRagV3Store((state) => state.removeParameter);
  const [selectedLayers, setSelectedLayers] = useState<string[]>(ACOUSTIC_DOMAIN_LAYERS.map((layer) => layer.id));
  const [showGlobalConsensus, setShowGlobalConsensus] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState({ time: 0, token: 0 });
  const [regionOffset, setRegionOffset] = useState(0);
  const [regionDuration, setRegionDuration] = useState(10);
  const [analysisStart, setAnalysisStart] = useState(0);
  const [analysisEnd, setAnalysisEnd] = useState(0);
  const [segmentInterval, setSegmentInterval] = useState(2);
  const [nodeInterval, setNodeInterval] = useState(20);
  const [segments, setSegments] = useState<SegmentPoint[]>([]);
  const [clapTopK, setClapTopK] = useState(20);
  const [siglipTopK, setSiglipTopK] = useState(20);
  const [busy, setBusy] = useState<Engine | null>(null);
  const [stoppedEngine, setStoppedEngine] = useState<Engine | null>(null);
  const [textBankViewMode, setTextBankViewMode] = useState<"compact" | "standard" | "expanded">("standard");
  const [clapBankViewMode, setClapBankViewMode] = useState<"compact" | "standard" | "expanded">("standard");
  const [siglipBankViewMode, setSiglipBankViewMode] = useState<"compact" | "standard" | "expanded">("standard");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showClap, setShowClap] = useState(true);
  const [showSiglip, setShowSiglip] = useState(true);
  const [timelineView, setTimelineView] = useState<"modality" | "layer">("modality");
  const [interpolateClap, setInterpolateClap] = useState(true);
  const [interpolateSiglip, setInterpolateSiglip] = useState(true);
  const [showSpectrogram, setShowSpectrogram] = useState(true);
  const [spectrogramScale, setSpectrogramScale] =
    useState<SpectrogramScale>("mel");
  const [spectrogramDetail, setSpectrogramDetail] =
    useState<SpectrogramDetail>("medium");
  const [spectrogramColor, setSpectrogramColor] = useState<
    "gray" | "igray" | "roseus"
  >("roseus");
  const [spectrogramRenderer, setSpectrogramRenderer] =
    useState<SpectrogramRenderer>("windowed");
  const [siglipSpectrogramLayout, setSiglipSpectrogramLayout] =
    useState<SiglipSpectrogramLayout>("rgb_delta");
  const [blendMode, setBlendMode] = useState(false);
  const [clapWeight, setClapWeight] = useState(0.5);
  const [vocalMatrixMode, setVocalMatrixMode] = useState(false);
  const [morphoStatus, setMorphoStatus] = useState<MorphoStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    for (const [key, setter] of [["text", setTextBankViewMode], ["clap", setClapBankViewMode], ["siglip", setSiglipBankViewMode]] as const) {
      const saved = window.sessionStorage.getItem(`am-stage-${key}-bank-view`);
      if (saved === "compact" || saved === "standard" || saved === "expanded") setter(saved);
    }
  }, []);
  useEffect(() => { window.sessionStorage.setItem("am-stage-text-bank-view", textBankViewMode); }, [textBankViewMode]);
  useEffect(() => { window.sessionStorage.setItem("am-stage-clap-bank-view", clapBankViewMode); }, [clapBankViewMode]);
  useEffect(() => { window.sessionStorage.setItem("am-stage-siglip-bank-view", siglipBankViewMode); }, [siglipBankViewMode]);

  const refreshMorphoStatus = useCallback(async () => {
    const response = await fetch("/api/morpho/status", { cache: "no-store" });
    if (response.ok) setMorphoStatus((await response.json()) as MorphoStatus);
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void refreshMorphoStatus(), 0);
    const timer = window.setInterval(
      () => void refreshMorphoStatus(),
      morphoStatus?.index_job?.running ? 2_000 : 10_000,
    );
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [morphoStatus?.index_job?.running, refreshMorphoStatus]);

  const filteredV3Parameters = useMemo(() => v3Parameters.filter((parameter) => {
    const storedLayer = (parameter as ActiveParameter & { domain_layer?: string }).domain_layer;
    const layer = storedLayer ?? classifyDomainLayer(parameter.technical_name, parameter.category);
    return !layer || selectedLayers.includes(layer) || (showGlobalConsensus && layer === GLOBAL_CONSENSUS_LAYER.id);
  }), [v3Parameters, selectedLayers, showGlobalConsensus]);

  const selectFile = useCallback((nextFile: File) => {
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(nextFile);
    });
    setFile(nextFile);
    setAudioDuration(0);
    setAnalysisStart(0);
    setAnalysisEnd(0);
    setCurrentTime(0);
    setRegionOffset(0);
    setSegments([]);
    setStoppedEngine(null);
    setError("");
    setNotice(
      "Файл загружен. Нажмите «Авто-разбивка» после появления длительности.",
    );
  }, []);

  const splitTrack = useCallback((overrides?: { duration?: number; interval?: number; start?: number; end?: number }) => {
    const duration = overrides?.duration ?? audioDuration;
    const interval = overrides?.interval ?? segmentInterval;
    const start = overrides?.start ?? analysisStart;
    const end = overrides?.end ?? (analysisEnd || duration);
    const points = buildAudioAnalysisPoints(duration, interval, start, end);
    if (!points.length) {
      setError("Укажите корректный временной диапазон: конец должен быть позже начала минимум на 0,1 секунды.");
      setSegments([]);
      return;
    }
    setSegments(
      points.map((point) => ({
        ...point,
        clap: [],
        siglip: [],
        clapStatus: "pending",
        siglipStatus: "pending",
      })),
    );
    setRegionOffset(0);
    setRegionDuration(
      Math.min(interval, duration || interval),
    );
    setCurrentTime(0);
    setStoppedEngine(null);
    setNotice(`Подготовлено точек анализа: ${points.length}.`);
    setError("");
  }, [analysisEnd, analysisStart, audioDuration, segmentInterval]);
  const applyTestPreset = useCallback(async () => {
    setError("");
    setNotice("Загружаю проверочный аудиофайл…");
    try {
      const response = await fetch("/test-fixtures/SPEZ.mp3");
      if (!response.ok) throw new Error(`Не удалось загрузить SPEZ.mp3: HTTP ${response.status}`);
      const audioFile = new File([await response.blob()], "SPEZ.mp3", { type: "audio/mpeg" });
      const metadataUrl = URL.createObjectURL(audioFile);
      let duration: number;
      try {
        duration = await new Promise<number>((resolve, reject) => {
          const audio = new Audio();
          audio.preload = "metadata";
          audio.onloadedmetadata = () => resolve(audio.duration);
          audio.onerror = () => reject(new Error("Не удалось прочитать длительность SPEZ.mp3."));
          audio.src = metadataUrl;
        });
      } finally {
        URL.revokeObjectURL(metadataUrl);
      }
      selectFile(audioFile);
      setSegmentInterval(5);
      setNodeInterval(5);
      setAnalysisStart(0);
      setAnalysisEnd(duration);
      setV3Query(TEST_PRESET_BRIEF);
      splitTrack({ duration, interval: 5, start: 0, end: duration });
      setNotice(`Проверочный preset готов: SPEZ.mp3 · ${formatTime(duration)} · raw/node 5 s · авторазбивка создана. Модели не запущены.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setNotice("");
    }
  }, [selectFile, setV3Query, splitTrack]);
  const handleWaveDuration = useCallback(
    (duration: number) => {
      setAudioDuration(duration);
      setAnalysisEnd((current) => current > 0 ? Math.min(current, duration) : duration);
      setRegionDuration(Math.min(segmentInterval, duration));
    },
    [segmentInterval],
  );
  const handleRegion = useCallback((offset: number, duration: number) => {
    setRegionOffset(offset);
    setRegionDuration(duration);
  }, []);

  const analyze = useCallback(
    async (engine: Engine, resume = false) => {
      if (!file || !segments.length || busy) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(engine);
      setStoppedEngine(null);
      setError("");
      setNotice("");
      const statusField = engine === "clap" ? "clapStatus" : "siglipStatus";
      let working = prepareSegmentRun(segments, engine, resume);
      try {
        for (const index of getIncompleteSegmentIndexes(working, engine)) {
          if (controller.signal.aborted) throw new DOMException("Analysis stopped", "AbortError");
          working[index][statusField] = "processing";
          setSegments([...working]);
          const form = new FormData();
          form.append("audio", file, file.name);
          form.append("engine", engine);
          form.append("offset", String(working[index].offset));
          form.append("duration", String(working[index].duration));
          form.append(
            "top_k",
            String(engine === "clap" ? clapTopK : siglipTopK),
          );
          form.append("spectrogram_detail", spectrogramDetail);
          form.append("spectrogram_layout", siglipSpectrogramLayout);
          form.append("vocal_matrix", String(vocalMatrixMode));
          const response = await fetch("/api/audio-to-parameter/segment", {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
          const payload = (await response.json()) as SegmentResponse;
          if (!response.ok)
            throw new Error(payload.error ?? `HTTP ${response.status}`);
          const parameters = Array.isArray(payload.parameters)
            ? payload.parameters
            : [];
          const nextWorking = applySuccessfulSegmentResult(
            working,
            index,
            engine,
            parameters,
          );
          if (engine === "siglip" && payload.spectrogram?.image_base64) {
            const { image_base64, ...metadata } = payload.spectrogram;
            nextWorking[index].siglipPreview = {
              dataUrl: `data:image/png;base64,${image_base64}`,
              metadata,
            };
          }
          working = nextWorking;
          setSegments(nextWorking);
          const completed = nextWorking.filter((segment) => segment[statusField] === "complete").length;
          setNotice(`${engine === "clap" ? "CLAP" : "SigLIP2"}: обработано ${completed} / ${working.length}.`);
        }
      } catch (caught) {
        const active = working.find(
          (segment) => segment[statusField] === "processing",
        );
        if (active) active[statusField] = "error";
        setSegments([...working]);
        if (controller.signal.aborted) {
          setStoppedEngine(engine);
          setNotice("Пакетный анализ остановлен. Готовые точки сохранены; продолжить можно со следующей незавершённой.");
        }
        else
          setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(null);
      }
    },
    [
      busy,
      clapTopK,
      file,
      segments,
      siglipTopK,
      siglipSpectrogramLayout,
      spectrogramDetail,
      vocalMatrixMode,
    ],
  );

  const stop = useCallback(async () => {
    if (busy) setStoppedEngine(busy);
    abortRef.current?.abort();
    await fetch("/api/audio-to-parameter/segment", { method: "DELETE" }).catch(
      () => undefined,
    );
    setNotice("Остановка анализа запрошена; текущий запрос завершает отмену.");
  }, [busy]);

  const nodeSegments = useMemo(
    () => smoothTimelineSegments(segments, nodeInterval),
    [nodeInterval, segments],
  );
  const clapCompleted = segments.filter((segment) => segment.clapStatus === "complete").length;
  const siglipCompleted = segments.filter((segment) => segment.siglipStatus === "complete").length;
  const canContinueClap = stoppedEngine === "clap" && clapCompleted > 0 && clapCompleted < segments.length;
  const canContinueSiglip = stoppedEngine === "siglip" && siglipCompleted > 0 && siglipCompleted < segments.length;
  const activeSiglipSegment = useMemo(() => {
    const withPreview = segments.filter((segment) => segment.siglipPreview);
    return withPreview.reduce<SegmentPoint | null>((nearest, segment) =>
      !nearest || Math.abs(segment.time - currentTime) < Math.abs(nearest.time - currentTime) ? segment : nearest, null)
      ?? withPreview.at(-1)
      ?? null;
  }, [currentTime, segments]);
  const clapFrame = useMemo(
    () => currentFrame(nodeSegments, currentTime, "clap", interpolateClap),
    [currentTime, interpolateClap, nodeSegments],
  );
  const siglipFrame = useMemo(
    () => currentFrame(nodeSegments, currentTime, "siglip", interpolateSiglip),
    [currentTime, interpolateSiglip, nodeSegments],
  );
  const visibleClap = showClap ? clapFrame : [];
  const visibleSiglip = showSiglip ? siglipFrame : [];
  const macroParameters = useMemo(
    () => blendMode ? blendParameterFrames(visibleClap, visibleSiglip, clapWeight) : mergeFrames(visibleClap, visibleSiglip),
    [blendMode, clapWeight, visibleClap, visibleSiglip],
  );

  const seekToSegment = (segment: SegmentPoint) => {
    setCurrentTime(segment.time);
    setSeekRequest((current) => ({
      time: segment.time,
      token: current.token + 1,
    }));
    setRegionOffset(segment.offset);
    setRegionDuration(segment.duration);
  };

  const updateValue = (
    engine: Engine,
    name: string,
    value: number | string,
  ) => {
    setSegments((current) => {
      let activeIndex = 0;
      for (let index = 0; index < current.length; index += 1)
        if (current[index].time <= currentTime) activeIndex = index;
      return current.map((segment, index) => {
        if (index !== activeIndex) return segment;
        const field = engine === "clap" ? "clap" : "siglip";
        return {
          ...segment,
          [field]: segment[field].map((parameter) =>
            parameter.technical_name === name
              ? { ...parameter, current_value: value, suggested_value: value }
              : parameter,
          ),
        };
      });
    });
  };

  const removeValue = (engine: Engine, name: string) => {
    setSegments((current) => {
      let activeIndex = 0;
      for (let index = 0; index < current.length; index += 1)
        if (current[index].time <= currentTime) activeIndex = index;
      return current.map((segment, index) => {
        if (index !== activeIndex) return segment;
        const field = engine === "clap" ? "clap" : "siglip";
        return {
          ...segment,
          [field]: segment[field].filter(
            (parameter) => parameter.technical_name !== name,
          ),
        };
      });
    });
  };

  const downloadJson = (payload: unknown, suffix: string) => {
    if (!file) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${file.name.replace(/\.[^.]+$/, "")}-${suffix}.json`; anchor.click(); URL.revokeObjectURL(url);
  };

  const exportTimeline = () => {
    if (!file || !segments.length) return;
    downloadJson(buildPriorityTimeline(nodeSegments, { audioName: file.name, audioDuration, rawInterval: segmentInterval, nodeInterval, blend: blendMode, clapWeight, vocalMatrix: vocalMatrixMode }), "priority-timeline");
  };

  const exportLegacyTimeline = () => {
    if (!file || !segments.length) return;
    downloadJson({
      schema_version: "FLOWMUSIC_AUDIO_PARAMETER_TIMELINE_V1",
      audio: { name: file.name, duration_seconds: audioDuration },
      sampling: {
        interval_seconds: segmentInterval,
        spectrogram_detail: spectrogramDetail,
        analysis_range_seconds: { start: analysisStart, end: analysisEnd || audioDuration },
        timestamp_origin: "original audio file start (0 seconds)",
      },
      interpolation: {
        clap: interpolateClap,
        siglip: interpolateSiglip,
        cross_engine: false,
      },
      points: nodeSegments.map((segment) => ({
        time_seconds: segment.time,
        analysis_window: {
          offset_seconds: segment.offset,
          duration_seconds: segment.duration,
        },
        clap: segment.clap.map((parameter) => ({
          technical_name: parameter.technical_name,
          value: parameter.current_value,
        })),
        siglip: segment.siglip.map((parameter) => ({
          technical_name: parameter.technical_name,
          value: parameter.current_value,
        })),
      })),
    }, "legacy-timeline");
  };

  return (
    <div className="flowmusic-console flex h-full flex-col text-zinc-100">
      <header className="border-b border-white/15 bg-black/70 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
              <AMIcon name="audioToParameter" size="md" bright />
              AM Tri-Modal Stage · AM-Stage
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Последовательный анализ временных точек, независимая интерполяция
              и синхронное воспроизведение.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <Badge variant="outline">{formatTime(audioDuration)}</Badge>
            <Badge variant="outline">точек: {segments.length}</Badge>
            <Badge
              variant="outline"
              className="border-cyan-400/40 text-cyan-300"
            >
              CLAP {clapCompleted}/{segments.length} · K{clapTopK}
            </Badge>
            <Badge
              variant="outline"
              className="border-fuchsia-400/40 text-fuchsia-300"
            >
              SigLIP2 {siglipCompleted}/{segments.length} · K{siglipTopK}
            </Badge>
            <Link href="/am-core#service-bay" title="Open Service Bay status and rebuild controls">
              <Badge
                variant="outline"
                className={
                  morphoStatus?.ready
                    ? "border-emerald-400/40 text-emerald-300"
                    : "border-amber-400/40 text-amber-300"
                }
              >
                SigLIP index: {morphoStatus?.status ?? "checking"}
              </Badge>
            </Link>
            <Button size="sm" variant="outline" onClick={() => void applyTestPreset()} disabled={Boolean(busy)}>Проверочный preset</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="flex w-full min-w-0 flex-col gap-3">
          <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="min-w-0 space-y-3">
              <SemanticSearch primaryLabel="Brief" secondaryLabel="Transition" collapsible />
          <details className="rounded-lg border border-white/10 bg-black/30 p-3">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-zinc-300">Analysis controls · sampling, time gate, CLAP / SigLIP2, Continue</summary>
            <div className="mt-3">            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel
                    label="Raw sampling, сек"
                    hint="Высокочастотный сбор от 0.5 до 30 секунд. По умолчанию 2 секунды."
                  />
                  <Input
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={segmentInterval}
                    onChange={(event) =>
                      setSegmentInterval(
                        Math.max(
                          0.5,
                          Math.min(30, Number(event.target.value) || 0.5),
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel label="Node interval, сек" hint="Сглаженные узлы итогового timeline: от 0,5 до 360 секунд." />
                  <Input type="number" min={0.5} max={360} step={0.5} value={nodeInterval} onChange={(event) => setNodeInterval(Math.max(0.5, Math.min(360, Number(event.target.value) || 0.5)))} />
                </div>
                <div className="col-span-2 rounded border border-white/10 p-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-300">Analysis time gate · timestamps relative to original file</span>
                    <button type="button" className="text-[10px] text-cyan-300 hover:underline" onClick={() => { setAnalysisStart(regionOffset); setAnalysisEnd(Math.min(audioDuration, regionOffset + regionDuration)); }}>Use waveform selection</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-zinc-500">Start (s)<Input type="number" min={0} max={audioDuration} step={0.1} value={analysisStart} onChange={(event) => setAnalysisStart(Math.max(0, Math.min(audioDuration, Number(event.target.value) || 0)))} /></label>
                    <label className="text-[10px] text-zinc-500">End (s)<Input type="number" min={0} max={audioDuration} step={0.1} value={analysisEnd || audioDuration} onChange={(event) => setAnalysisEnd(Math.max(0, Math.min(audioDuration, Number(event.target.value) || 0)))} /></label>
                  </div>
                  <p className="mt-1 text-[9px] text-zinc-500">Auto-split and both model runs stay inside this range. Export times remain relative to the original file.</p>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => splitTrack()}
                    disabled={!audioDuration || Boolean(busy)}
                  >
                    <Scissors className="size-4" />
                    Авто-разбивка
                  </Button>
                </div>
                <div>
                  <FieldLabel
                    label="CLAP Top-K"
                    hint="Число параметров для каждой временной точки CLAP."
                  />
                  <Input
                    type="number"
                    min={3}
                    max={100}
                    value={clapTopK}
                    onChange={(event) =>
                      setClapTopK(
                        Math.max(
                          3,
                          Math.min(100, Number(event.target.value) || 3),
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel
                    label="SigLIP Top-K"
                    hint="Число параметров для каждой спектрограммы SigLIP2."
                  />
                  <Input
                    type="number"
                    min={3}
                    max={100}
                    value={siglipTopK}
                    onChange={(event) =>
                      setSiglipTopK(
                        Math.max(
                          3,
                          Math.min(100, Number(event.target.value) || 3),
                        ),
                      )
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div>
                  <FieldLabel
                    label="Шкала"
                    hint="Вертикальная шкала Wavesurfer Spectrogram."
                  />
                  <Select
                    value={spectrogramScale}
                    onValueChange={(value) =>
                      setSpectrogramScale(value as SpectrogramScale)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["mel", "linear", "logarithmic", "bark", "erb"].map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel
                    label="Рендер"
                    hint="Windowed считает только видимую область и стабильнее работает с длинными треками."
                  />
                  <Select
                    value={spectrogramRenderer}
                    onValueChange={(value) =>
                      setSpectrogramRenderer(value as SpectrogramRenderer)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="windowed">windowed</SelectItem>
                      <SelectItem value="standard">standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel
                    label="SigLIP кадр"
                    hint="Mel — один mel-график. Composite — mel, STFT, chroma и spectral contrast в одном изображении."
                  />
                  <Select
                    value={siglipSpectrogramLayout}
                    onValueChange={(value) =>
                      setSiglipSpectrogramLayout(
                        value as SiglipSpectrogramLayout,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rgb_delta">RGB delta</SelectItem>
                      <SelectItem value="composite">composite</SelectItem>
                      <SelectItem value="mel">mel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel
                    label="Детализация"
                    hint="FFT: low 512, medium 1024, high 2048. То же качество применяется к изображениям для SigLIP2."
                  />
                  <Select
                    value={spectrogramDetail}
                    onValueChange={(value) =>
                      setSpectrogramDetail(value as SpectrogramDetail)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["low", "medium", "high"].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel
                    label="Палитра"
                    hint="Палитра видимой спектрограммы."
                  />
                  <Select
                    value={spectrogramColor}
                    onValueChange={(value) =>
                      setSpectrogramColor(value as typeof spectrogramColor)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["roseus", "gray", "igray"].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleRow label="Blend CLAP & SigLIP" checked={blendMode} onChange={setBlendMode} />
                <ToggleRow label="Vocal Allocation Matrix" checked={vocalMatrixMode} onChange={setVocalMatrixMode} />
                <ToggleRow
                  label="Показывать спектрограмму"
                  checked={showSpectrogram}
                  onChange={setShowSpectrogram}
                />
                <ToggleRow
                  label="Показывать CLAP"
                  checked={showClap}
                  onChange={setShowClap}
                />
                <ToggleRow
                  label="Показывать SigLIP2"
                  checked={showSiglip}
                  onChange={setShowSiglip}
                />
                <ToggleRow
                  label="Интерполяция CLAP"
                  checked={interpolateClap}
                  onChange={setInterpolateClap}
                />
                <ToggleRow
                  label="Интерполяция SigLIP2"
                  checked={interpolateSiglip}
                  onChange={setInterpolateSiglip}
                />
              </div>
              {activeSiglipSegment?.siglipPreview ? <section className="flex gap-3 rounded border border-fuchsia-400/20 bg-black/30 p-2" aria-label="SigLIP input frame preview">
                <Image src={activeSiglipSegment.siglipPreview.dataUrl} width={112} height={112} unoptimized alt="Фактический preprocessing frame для SigLIP2" className="size-28 shrink-0 rounded border border-fuchsia-400/20 bg-black object-contain" />
                <div className="min-w-0 text-[10px] text-zinc-400"><h3 className="mb-1 font-mono uppercase text-fuchsia-300">SigLIP input frame · {formatTime(activeSiglipSegment.offset)}</h3><p>Тот же PNG, который передаётся в SigLIP2. Активная точка: {formatTime(activeSiglipSegment.time)}.</p><p className="mt-1 break-words">{String(activeSiglipSegment.siglipPreview.metadata.layout ?? "rgb_delta")} · {String(activeSiglipSegment.siglipPreview.metadata.detail ?? "medium")} · crop {String(activeSiglipSegment.siglipPreview.metadata.duration ?? activeSiglipSegment.duration)} s · {JSON.stringify(activeSiglipSegment.siglipPreview.metadata.panels ?? [])}</p></div>
              </section> : null}
              {blendMode ? <div><FieldLabel label={`Вес CLAP: ${Math.round(clapWeight * 100)}%`} hint="Остаток веса принадлежит SigLIP2. Scores нормализуются отдельно перед объединением." /><Input type="range" min={0} max={1} step={0.05} value={clapWeight} onChange={(event) => setClapWeight(Number(event.target.value))} /></div> : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5 rounded border border-cyan-400/20 p-2">
                  <Button className="w-full bg-cyan-700 hover:bg-cyan-600" disabled={!file || !segments.length || Boolean(busy)} title="Новая обработка CLAP с начала; только CLAP результаты будут заменены." onClick={() => void analyze("clap")}>
                    {busy === "clap" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                    CLAP · с начала
                  </Button>
                  <Button className="w-full" variant="outline" disabled={!file || Boolean(busy) || !canContinueClap} onClick={() => void analyze("clap", true)}>
                    Продолжить CLAP ({clapCompleted}/{segments.length})
                  </Button>
                </div>
                <div className="space-y-1.5 rounded border border-fuchsia-400/20 p-2">
                  <Button className="w-full bg-fuchsia-700 hover:bg-fuchsia-600" disabled={!file || !segments.length || Boolean(busy) || !morphoStatus?.ready} title="Новая обработка SigLIP2 с начала; только SigLIP2 результаты будут заменены." onClick={() => void analyze("siglip")}>
                    {busy === "siglip" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                    SigLIP2 · с начала
                  </Button>
                  <Button className="w-full" variant="outline" disabled={!file || Boolean(busy) || !morphoStatus?.ready || !canContinueSiglip} onClick={() => void analyze("siglip", true)}>
                    Продолжить SigLIP2 ({siglipCompleted}/{segments.length})
                  </Button>
                </div>
              </div>
              {!morphoStatus?.ready ? (
                <div className="rounded border border-amber-400/25 bg-amber-950/20 p-2 text-xs text-amber-200">
                  <div>
                    {morphoStatus?.index_job?.running
                      ? `Перестройка index: ${morphoStatus.index_job.progress?.current ?? 0} / ${morphoStatus.index_job.progress?.total ?? 0}`
                      : `SigLIP2 index не готов: ${(morphoStatus?.stale_reasons ?? [morphoStatus?.status ?? "unknown"]).join("; ")}`}
                  </div>
                  <Link className="mt-2 flex w-full items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent" href="/am-core#service-bay">
                    Открыть Service Bay
                  </Link>
                </div>
              ) : null}
              {busy ? (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={() => void stop()}
                >
                  <Square className="size-4" />
                  Остановить пакетный анализ
                </Button>
              ) : null}
              {notice ? (
                <div className="rounded border border-cyan-400/20 bg-cyan-950/20 p-2 text-xs text-cyan-200">
                  {notice}
                </div>
              ) : null}
              {error ? (
                <div className="rounded border border-red-400/30 bg-red-950/20 p-2 text-xs text-red-200">
                  {error}
                </div>
              ) : null}
            </div></div>
          </details>
            </div>
            <aside className="flex min-w-0 flex-col gap-2 rounded-lg border border-cyan-400/20 bg-black/30 p-3">
              <MacroGenerator parameters={filteredV3Parameters} collapsible collapseLabel={`TEXT · Semantic V3 · ${filteredV3Parameters.length}`} />
              <MacroGenerator parameters={macroParameters} collapsible collapseLabel={`CLAP + SigLIP2 · ${macroParameters.length}`} />
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Button variant="outline" disabled={!segments.some((segment) => segment.clap.length || segment.siglip.length)} onClick={exportTimeline}><Download className="size-4" />Экспорт Priority Timeline</Button>
                <Button variant="ghost" disabled={!segments.some((segment) => segment.clap.length || segment.siglip.length)} onClick={exportLegacyTimeline}><Download className="size-4" />Экспорт legacy timeline</Button>
                <JournalDraftButton modality="audio" engine="clap" actionLabel="Сохранить CLAP в Journal" parameters={clapFrame} model={{ id: "laion/clap-htsat-fused" }} settings={{ interval_seconds: segmentInterval, timeline_points: segments.length }} asset={file} label={`Segmented CLAP · ${file?.name ?? "track"}`} />
                <JournalDraftButton modality="audio" engine="siglip2" actionLabel="Сохранить SigLIP2 в Journal" parameters={siglipFrame} model={{ id: "google/siglip2-base-patch16-224" }} settings={{ interval_seconds: segmentInterval, timeline_points: segments.length, spectrogram_detail: spectrogramDetail }} asset={file} label={`Segmented SigLIP2 · ${file?.name ?? "track"}`} />
              </div>
            </aside>
          </section>

          <section className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-2" aria-label="Parameter timeline node seek">
            <div className="flex gap-1 overflow-x-auto pb-2">
              {segments.map((segment, index) => (
                <button
                  key={`${segment.time}-${index}`}
                  type="button"
                  onClick={() => seekToSegment(segment)}
                  className={`min-w-28 rounded border px-2 py-2 text-left text-[10px] ${Math.abs(currentTime - segment.time) < 0.05 ? "border-white bg-white/10 text-white" : "border-white/10 bg-black/40 text-zinc-400"}`}
                >
                  <div className="font-mono">{formatTime(segment.time)}</div>
                  <div className="mt-1 flex gap-1">
                    <span
                      className={`rounded border px-1 ${statusClass(segment.clapStatus)}`}
                    >
                      C {segment.clap.length}
                    </span>
                    <span
                      className={`rounded border px-1 ${statusClass(segment.siglipStatus)}`}
                    >
                      S {segment.siglip.length}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-cyan-400/20 bg-black/30 p-4">
            <div className="min-w-0">
              {!audioUrl ? (
                <label className="flex min-h-52 cursor-pointer items-center justify-center rounded border border-dashed border-cyan-400/30 bg-black/40">
                  <span className="flex items-center gap-2 text-sm text-zinc-400">
                    <Upload className="size-5" />
                    Выбрать аудиофайл
                  </span>
                  <input
                    className="hidden"
                    type="file"
                    accept="audio/*"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) selectFile(selected);
                    }}
                  />
                </label>
              ) : (
                <AudioWaveformEditor
                  instanceId="audio-segments"
                  url={audioUrl}
                  offset={regionOffset}
                  duration={regionDuration}
                  totalDuration={audioDuration}
                  onDuration={handleWaveDuration}
                  onRegion={handleRegion}
                  onFile={selectFile}
                  onTime={setCurrentTime}
                  seekRequest={seekRequest}
                  loopRegion={false}
                  minimap
                  spectrogram={{
                    visible: showSpectrogram,
                    scale: spectrogramScale,
                    detail: spectrogramDetail,
                    colorMap: spectrogramColor,
                    renderer: spectrogramRenderer,
                  }}
                />
              )}
              {file ? (
                <div className="mt-2 truncate text-xs text-zinc-500">
                  {file.name}
                </div>
              ) : null}
            </div>

          </section>

          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(170px,1fr)_minmax(0,9fr)]">
            <aside className="rounded-lg border border-border bg-background/85 p-3">
              <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider">Domain layer mask</h2>
              <div className="flex flex-col gap-1.5">
                {ACOUSTIC_DOMAIN_LAYERS.map((layer) => {
                  const checked = selectedLayers.includes(layer.id);
                  return <label key={layer.id} className="flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[10px]" style={{ borderColor: `${layer.color}70`, color: layer.color }}><input type="checkbox" checked={checked} onChange={() => setSelectedLayers((current) => checked ? current.filter((id) => id !== layer.id) : [...current, layer.id])} />{layer.label}</label>;
                })}
                <label className="flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[10px]" style={{ borderColor: `${GLOBAL_CONSENSUS_LAYER.color}70`, color: GLOBAL_CONSENSUS_LAYER.color }}><input type="checkbox" checked={showGlobalConsensus} onChange={(event) => setShowGlobalConsensus(event.target.checked)} />{GLOBAL_CONSENSUS_LAYER.label}</label>
              </div>
            </aside>
          <section className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-400">
              <span>Parameter Timeline · {formatTime(currentTime)}</span>
              <span>Нажмите точку для перемотки</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">Parameter timeline</h3>
              <div className="flex gap-1 text-xs" role="group" aria-label="Timeline view">
                {([ ["modality", "By modality"], ["layer", "By layer"] ] as const).map(([view, label]) => (
                  <button key={view} type="button" onClick={() => setTimelineView(view)} aria-pressed={timelineView === view} className={`rounded border px-2 py-1 ${timelineView === view ? "border-violet-400 bg-violet-950/40 text-violet-200" : "border-white/15 text-zinc-400 hover:text-white"}`}>{label}</button>
                ))}
              </div>
            </div>
            <ParameterTimelineGraph
              segments={nodeSegments}
              textParameters={v3Parameters}
              currentTime={currentTime}
              duration={audioDuration}
              showClap={showClap}
              showSiglip={showSiglip}
              view={timelineView}
            />
          </section>

          </div>

          <section className="grid min-h-[560px] gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ParameterBank title="CLAP Parameters" accent="cyan" parameters={visibleClap} viewMode={clapBankViewMode} onViewModeChange={setClapBankViewMode} useDomainLayerColors onChange={(name, value) => updateValue("clap", name, value)} onRemove={(name) => removeValue("clap", name)} />
            <ParameterBank title="SigLIP2 Spectrogram Parameters" accent="fuchsia" parameters={visibleSiglip} viewMode={siglipBankViewMode} onViewModeChange={setSiglipBankViewMode} useDomainLayerColors onChange={(name, value) => updateValue("siglip", name, value)} onRemove={(name) => removeValue("siglip", name)} />
          </section>
          <ParameterBank title={`TEXT · Semantic V3 · ${filteredV3Parameters.length}/${v3Parameters.length}`} accent="cyan" parameters={filteredV3Parameters} viewMode={textBankViewMode} onViewModeChange={setTextBankViewMode} useDomainLayerColors onChange={updateV3ParameterValue} onRemove={removeV3Parameter} />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-zinc-300">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ParameterBank({
  title,
  accent,
  parameters,
  onChange,
  onRemove,
  viewMode,
  onViewModeChange,
  useDomainLayerColors = false,
}: {
  title: string;
  accent: "cyan" | "fuchsia";
  parameters: ActiveParameter[];
  onChange: (name: string, value: number | string) => void;
  onRemove: (name: string) => void;
  viewMode: "compact" | "standard" | "expanded";
  onViewModeChange: (mode: "compact" | "standard" | "expanded") => void;
  useDomainLayerColors?: boolean;
}) {
  return (
    <details open className={`min-w-0 rounded-lg border bg-black/30 p-3 ${accent === "cyan" ? "border-cyan-400/25" : "border-fuchsia-400/25"}`}>
      <summary className="mb-2 flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <h2 className={`font-mono text-xs font-semibold uppercase tracking-[0.18em] ${accent === "cyan" ? "text-cyan-300" : "text-fuchsia-300"}`}>
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-white/10 p-0.5" role="group" aria-label={`${title} view mode`}>
            {([["compact", "Compact"], ["standard", "Standard"], ["expanded", "Expanded"]] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onViewModeChange(mode); }} className={`rounded px-1.5 py-1 text-[9px] ${viewMode === mode ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{label}</button>)}
          </div>
          <Badge variant="outline">{parameters.length}</Badge>
        </div>
      </summary>
      <VirtualizedParamList
        parameters={parameters}
        className="min-h-0 flex-1"
        displayMode={viewMode === "expanded" ? "detail" : viewMode}
        useDomainLayerColors={useDomainLayerColors}
        onChange={onChange}
        onRemove={onRemove}
      />
    </details>
  );
}

function ParameterTimelineGraph({
  segments,
  textParameters,
  currentTime,
  duration,
  showClap,
  showSiglip,
  view,
}: {
  segments: Array<{ time: number; clap: ActiveParameter[]; siglip: ActiveParameter[] }>;
  textParameters: ActiveParameter[];
  currentTime: number;
  duration: number;
  showClap: boolean;
  showSiglip: boolean;
  view: "modality" | "layer";
}) {
  const lanes = useMemo(() => buildLayerTimelineLanes(segments, textParameters, duration, showClap, showSiglip), [duration, segments, showClap, showSiglip, textParameters]);
  const series = useMemo(() => {
    const candidates: GraphSeries[] = [];
    for (const source of ["clap", "siglip"] as const) {
      if (
        (source === "clap" && !showClap) ||
        (source === "siglip" && !showSiglip)
      )
        continue;
      const names = new Set<string>();
      for (const segment of segments)
        for (const parameter of segment[source])
          if (typeof parameter.current_value === "number")
            names.add(parameter.technical_name);
      for (const name of names) {
        const values = segments.flatMap((segment) => {
          const parameter = segment[source].find(
            (item) => item.technical_name === name,
          );
          if (!parameter || typeof parameter.current_value !== "number")
            return [];
          const min = parameter.min_value ?? parameter.current_value - 1;
          const max = parameter.max_value ?? parameter.current_value + 1;
          return [
            { time: segment.time, value: parameter.current_value, min, max },
          ];
        });
        const movement = values.reduce(
          (sum, point, index) =>
            index
              ? sum +
                Math.abs(point.value - values[index - 1].value) /
                  Math.max(1e-9, point.max - point.min)
              : sum,
          0,
        );
        if (values.length > 1)
          candidates.push({
            key: `${source}:${name}`,
            label: name,
            source,
            values,
            movement,
          });
      }
    }
    return candidates.sort((a, b) => b.movement - a.movement).slice(0, 24);
  }, [segments, showClap, showSiglip]);

  if (!duration || (view === "modality" ? !series.length : !lanes.length))
    return (
      <div className="mt-3 flex h-44 items-center justify-center rounded border border-white/10 bg-black text-xs text-zinc-600">
        {view === "layer" ? "После появления числовых результатов здесь отобразятся слои. Текстовые параметры появятся после выбора brief." : "После анализа здесь появятся наиболее активно изменяющиеся числовые параметры."}
      </div>
    );
  if (view === "layer") return (
    <div className="mt-3 space-y-2 rounded border border-white/10 bg-black p-2">
      <p className="text-[9px] text-zinc-500">До {LAYER_TIMELINE_SERIES_LIMIT} наиболее изменяющихся серий на слой; C = CLAP, S = SigLIP2, T = TEXT brief. GLOBAL_CONSENSUS исключён.</p>
      {lanes.map((lane) => (
        <section key={lane.id} className="rounded border border-white/10 bg-zinc-950/70 p-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
            <span className="font-medium" style={{ color: lane.color }}>{lane.label}</span>
            <span className="text-zinc-500">{lane.series.length}{lane.totalSeries > lane.series.length ? ` / ${lane.totalSeries} series` : " series"}</span>
          </div>
          <svg viewBox="0 0 1000 72" className="h-16 w-full" role="img" aria-label={`${lane.label} timeline`}>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1={ratio * 1000} x2={ratio * 1000} y1="0" y2="72" stroke="#27272a" strokeWidth="1" />)}
            {lane.series.map((item) => {
              const points = item.values.map((point) => {
                const normalized = Math.max(0, Math.min(1, (point.value - point.min) / Math.max(1e-9, point.max - point.min)));
                return `${(point.time / duration) * 1000},${66 - normalized * 58}`;
              }).join(" ");
              const opacity = item.source === "text" ? 0.55 : item.source === "clap" ? 0.9 : 0.7;
              const y = 66 - Math.max(0, Math.min(1, (item.values[0].value - item.values[0].min) / Math.max(1e-9, item.values[0].max - item.values[0].min))) * 58;
              return <g key={item.key}><polyline points={points} fill="none" stroke={lane.color} strokeWidth="1.6" opacity={opacity} />{item.values.length === 1 ? <circle cx={(item.values[0].time / duration) * 1000} cy={y} r="2.5" fill={lane.color} /> : null}</g>;
            })}
            <line x1={(currentTime / duration) * 1000} x2={(currentTime / duration) * 1000} y1="0" y2="72" stroke="white" strokeWidth="1.5" />
          </svg>
          <div className="flex max-h-8 flex-wrap gap-x-2 overflow-auto text-[8px] text-zinc-500">{lane.series.map((item) => <span key={item.key}><b className="text-zinc-300">{item.source === "clap" ? "C" : item.source === "siglip" ? "S" : "T"}</b> · {item.label}</span>)}</div>
        </section>
      ))}
    </div>
  );
  return (
    <div className="mt-3 rounded border border-white/10 bg-black p-2">
      <svg
        viewBox="0 0 1000 220"
        className="h-52 w-full"
        role="img"
        aria-label="График параметров во времени"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={ratio * 1000}
            x2={ratio * 1000}
            y1="0"
            y2="220"
            stroke="#27272a"
            strokeWidth="1"
          />
        ))}
        {series.map((item, index) => {
          const points = item.values
            .map((point) => {
              const normalized = Math.max(
                0,
                Math.min(
                  1,
                  (point.value - point.min) /
                    Math.max(1e-9, point.max - point.min),
                ),
              );
              return `${(point.time / duration) * 1000},${210 - normalized * 190}`;
            })
            .join(" ");
          return (
            <polyline
              key={item.key}
              points={points}
              fill="none"
              stroke={COLORS[index % COLORS.length]}
              strokeWidth="2"
              opacity={item.source === "clap" ? 0.9 : 0.65}
            />
          );
        })}
        <line
          x1={(currentTime / duration) * 1000}
          x2={(currentTime / duration) * 1000}
          y1="0"
          y2="220"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
      <div className="mt-2 flex max-h-20 flex-wrap gap-x-3 gap-y-1 overflow-auto text-[9px] text-zinc-400">
        {series.map((item, index) => (
          <span key={item.key} className="flex items-center gap-1">
            <i
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            {item.source === "clap" ? "C" : "S"} · {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
