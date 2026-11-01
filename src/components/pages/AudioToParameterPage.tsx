"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  Loader2,
  Scissors,
  Square,
  Upload,
  Zap,
} from "lucide-react";

import { AudioWaveformEditor } from "@/components/audio/AudioWaveformEditor";
import { JournalDraftButton } from "@/components/cross-modal/JournalDraftButton";
import { MacroGenerator } from "@/components/rag-v3/MacroGenerator";
import { V3InfoTip } from "@/components/rag-v3/V3Tooltip";
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
  type AudioAnalysisStatus,
  type AudioEngine,
  type AudioSegmentResultPoint,
} from "@/lib/audio-segment-result";
import {
  buildAlignedAudioAnalysisPoints,
  collectStage7WindowEvents,
  loadStage7RhythmSources,
  resetSegmentsForWindowMode,
  stage7FeaturesCoverRange,
  type AudioWindowMode,
  type Stage7RhythmSource,
} from "@/lib/audio-window-modes";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { computeModalityTrust, DEFAULT_MODALITY_TRUST_CONFIG } from "@/lib/modality-trust";
import { useUiText } from "@/lib/ui-i18n";

type Engine = AudioEngine;
type AnalysisStatus = AudioAnalysisStatus;
type SpectrogramDetail = "low" | "medium" | "high";
type SpectrogramScale = "linear" | "logarithmic" | "mel" | "bark" | "erb";
type SpectrogramRenderer = "standard" | "windowed";
type SiglipSpectrogramLayout = "mel" | "composite" | "rgb_delta";

type SegmentPoint = AudioSegmentResultPoint;

interface SegmentResponse {
  parameters?: ActiveParameter[];
  error?: string;
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

export function AudioToParameterPage({ active = true }: { active?: boolean } = {}) {
  const t = useUiText();
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState({ time: 0, token: 0 });
  const [regionOffset, setRegionOffset] = useState(0);
  const [regionDuration, setRegionDuration] = useState(10);
  const [segmentInterval, setSegmentInterval] = useState(2);
  const [windowMode, setWindowMode] = useState<AudioWindowMode>("uniform");
  const [windowSourceSegments, setWindowSourceSegments] = useState<Stage7RhythmSource[]>([]);
  const [windowModeBusy, setWindowModeBusy] = useState(false);
  const [nodeInterval, setNodeInterval] = useState(20);
  const [segments, setSegments] = useState<SegmentPoint[]>([]);
  const [clapTopK, setClapTopK] = useState(20);
  const [siglipTopK, setSiglipTopK] = useState(20);
  const [busy, setBusy] = useState<Engine | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showClap, setShowClap] = useState(true);
  const [showSiglip, setShowSiglip] = useState(true);
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
  const [trustThreshold, setTrustThreshold] = useState(DEFAULT_MODALITY_TRUST_CONFIG.lowTrustThreshold);
  const [trustFloor, setTrustFloor] = useState(DEFAULT_MODALITY_TRUST_CONFIG.floorWeight);
  const modalityTrustConfig = useMemo(() => ({ ...DEFAULT_MODALITY_TRUST_CONFIG, lowTrustThreshold: trustThreshold, floorWeight: trustFloor }), [trustFloor, trustThreshold]);
  const [vocalMatrixMode, setVocalMatrixMode] = useState(false);
  const [morphoStatus, setMorphoStatus] = useState<MorphoStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshMorphoStatus = useCallback(async () => {
    const response = await fetch("/api/morpho/status", { cache: "no-store" });
    if (response.ok) setMorphoStatus((await response.json()) as MorphoStatus);
  }, []);
  useEffect(() => {
    if (active) void refreshMorphoStatus();
  }, [active, refreshMorphoStatus]);
  useEffect(() => {
    if (!active || !morphoStatus?.index_job?.running) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshMorphoStatus();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [active, morphoStatus?.index_job?.running, refreshMorphoStatus]);

  const selectFile = useCallback((nextFile: File) => {
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(nextFile);
    });
    setFile(nextFile);
    setAudioDuration(0);
    setCurrentTime(0);
    setRegionOffset(0);
    setSegments([]);
    setWindowMode("uniform");
    setWindowSourceSegments([]);
    setError("");
    setNotice(
      t("Файл загружен. Нажмите «Авто-разбивка» после появления длительности."),
    );
  }, [t]);

  const regenerateWindowMode = useCallback(async (
    mode: AudioWindowMode,
    overrides?: { duration?: number; interval?: number; start?: number; end?: number },
  ) => {
    const duration = overrides?.duration ?? audioDuration;
    const interval = overrides?.interval ?? segmentInterval;
    const start = overrides?.start ?? 0;
    const end = overrides?.end ?? duration;
    const uniformPoints = buildAudioAnalysisPoints(duration, interval, start, end);
    if (!uniformPoints.length) { setError(t("Укажите корректный временной диапазон: конец должен быть позже начала минимум на 0,1 секунды.")); return; }
    setError("");

    if (mode === "uniform") {
      setWindowMode(mode);
      setSegments(resetSegmentsForWindowMode(uniformPoints));
      setRegionOffset(uniformPoints[0].offset);
      setRegionDuration(uniformPoints[0].duration);
      setCurrentTime(uniformPoints[0].time);
      setNotice(`${t("Uniform windows prepared")}: ${uniformPoints.length}.`);
      return;
    }
    if (windowModeBusy || busy) return;
    setWindowModeBusy(true);
    try {
      let sources = windowSourceSegments;
      if (!stage7FeaturesCoverRange(sources, start, end)) {
        sources = stage7FeaturesCoverRange(segments, start, end) ? segments : resetSegmentsForWindowMode(uniformPoints);
      }
      if (!file && !stage7FeaturesCoverRange(sources, start, end)) throw new Error(t("Load the audio file to compute Stage 7 beat/onset events."));
      if (file) sources = await loadStage7RhythmSources(file, start, end, sources, (progress) => {
        if (progress === "start") setNotice(t("Preparing Stage 7 rhythm events"));
      });
      setWindowSourceSegments(sources);
      const events = collectStage7WindowEvents(sources, mode);
      const points = buildAlignedAudioAnalysisPoints(duration, interval, start, end, events);
      if (!points.length) throw new Error(t(mode === "beat" ? "No beat events found in this time range." : "No onset events found in this time range."));
      setWindowMode(mode);
      setSegments(resetSegmentsForWindowMode(points));
      setRegionOffset(points[0].offset);
      setRegionDuration(points[0].duration);
      setCurrentTime(points[0].time);
      setNotice(`${t(mode === "beat" ? "Beat-aligned windows ready" : "Transient-aligned windows ready")}: ${points.length}. ${t("Previous CLAP/SigLIP results were cleared for the new node list.")}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWindowModeBusy(false);
    }
  }, [audioDuration, busy, file, segmentInterval, segments, t, windowModeBusy, windowSourceSegments]);

  const splitTrack = useCallback(() => { void regenerateWindowMode(windowMode); }, [regenerateWindowMode, windowMode]);
  const handleWaveDuration = useCallback(
    (duration: number) => {
      setAudioDuration(duration);
      setRegionDuration(Math.min(segmentInterval, duration));
    },
    [segmentInterval],
  );
  const handleRegion = useCallback((offset: number, duration: number) => {
    setRegionOffset(offset);
    setRegionDuration(duration);
  }, []);

  const analyze = useCallback(
    async (engine: Engine) => {
      if (!file || !segments.length || busy || windowModeBusy) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(engine);
      setError("");
      setNotice("");
      let working = segments.map((segment) => ({
        ...segment,
        clap: [...segment.clap],
        siglip: [...segment.siglip],
      }));
      const statusField = engine === "clap" ? "clapStatus" : "siglipStatus";
      try {
        for (let index = 0; index < working.length; index += 1) {
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
          working = nextWorking;
          setSegments(nextWorking);
          setNotice(
            `${engine === "clap" ? "CLAP" : "SigLIP2"}: ${t("Обработано")} ${index + 1} / ${working.length}.`,
          );
        }
      } catch (caught) {
        const active = working.find(
          (segment) => segment[statusField] === "processing",
        );
        if (active) active[statusField] = "error";
        setSegments([...working]);
        if (controller.signal.aborted) setNotice(t("Пакетный анализ остановлен."));
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
      t,
      vocalMatrixMode,
      windowModeBusy,
    ],
  );

  const stop = useCallback(async () => {
    abortRef.current?.abort();
    await fetch("/api/audio-to-parameter/segment", { method: "DELETE" }).catch(
      () => undefined,
    );
    abortRef.current = null;
    setBusy(null);
    setNotice(t("Остановка анализа запрошена."));
  }, [t]);

  const nodeSegments = useMemo(
    () => smoothTimelineSegments(segments, nodeInterval),
    [nodeInterval, segments],
  );
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
  const clapTrust = useMemo(() => computeModalityTrust(visibleClap.map((parameter) => parameter.similarity)), [visibleClap]);
  const siglipTrust = useMemo(() => computeModalityTrust(visibleSiglip.map((parameter) => parameter.similarity)), [visibleSiglip]);
  const macroParameters = useMemo(
    () => blendMode ? blendParameterFrames(visibleClap, visibleSiglip, clapWeight, modalityTrustConfig) : mergeFrames(visibleClap, visibleSiglip),
    [blendMode, clapWeight, modalityTrustConfig, visibleClap, visibleSiglip],
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
    downloadJson(buildPriorityTimeline(nodeSegments, { audioName: file.name, audioDuration, rawInterval: segmentInterval, nodeInterval, blend: blendMode, clapWeight, trustConfig: modalityTrustConfig, vocalMatrix: vocalMatrixMode }), "priority-timeline");
  };

  const exportLegacyTimeline = () => {
    if (!file || !segments.length) return;
    downloadJson({
      schema_version: "FLOWMUSIC_AUDIO_PARAMETER_TIMELINE_V1",
      audio: { name: file.name, duration_seconds: audioDuration },
      sampling: {
        interval_seconds: segmentInterval,
        spectrogram_detail: spectrogramDetail,
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
              Audio-to-Parameter · Segmented CLAP + SigLIP2
            </h1>
            <V3InfoTip content={t("Последовательный анализ временных точек, независимая интерполяция и синхронное воспроизведение.")} />
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <Badge variant="outline">{formatTime(audioDuration)}</Badge>
            <Badge variant="outline">{t("Точек:")} {segments.length}</Badge>
            <Badge
              variant="outline"
              className="border-cyan-400/40 text-cyan-300"
            >
              CLAP {clapTopK}
            </Badge>
            <Badge
              variant="outline"
              className="border-fuchsia-400/40 text-fuchsia-300"
            >
              SigLIP2 {siglipTopK}
            </Badge>
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
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="flex w-full min-w-0 flex-col gap-3">
          <section className="grid gap-3 rounded-lg border border-cyan-400/20 bg-black/30 p-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0">
              {!audioUrl ? (
                <label className="flex min-h-52 cursor-pointer items-center justify-center rounded border border-dashed border-cyan-400/30 bg-black/40">
                  <span className="flex items-center gap-2 text-sm text-zinc-400">
                    <Upload className="size-5" />
                    {t("Выбрать аудиофайл")}
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

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel
                    label={t("Raw sampling, сек")}
                    hint={t("Высокочастотный сбор от 0.5 до 30 секунд. По умолчанию 2 секунды.")}
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
                <label className="col-span-2 block text-[10px] text-zinc-400">
                  {t("Analysis window placement")}
                  <select aria-label={t("Analysis window placement")} value={windowMode} disabled={!file || !audioDuration || Boolean(busy) || windowModeBusy} onChange={(event) => void regenerateWindowMode(event.target.value as AudioWindowMode)} className="mt-1 h-9 w-full rounded border border-white/15 bg-zinc-950 px-2 text-xs text-zinc-100">
                    <option value="uniform">{t("Uniform grid")}</option>
                    <option value="beat">{t("Beat aligned")}</option>
                    <option value="onset">{t("Transient / onset aligned")}</option>
                  </select>
                  <span className="mt-1 block text-[10px] text-zinc-500">{windowModeBusy ? t("Preparing Stage 7 rhythm events") : t("Beat/onset modes reuse Stage 7 data; nodes closer than 0.5 s are merged.")}</span>
                </label>
                <div>
                  <FieldLabel label={t("Node interval, сек")} hint={t("Сглаженные узлы итогового timeline: от 0,5 до 360 секунд.")} />
                  <Input type="number" min={0.5} max={360} step={0.5} value={nodeInterval} onChange={(event) => setNodeInterval(Math.max(0.5, Math.min(360, Number(event.target.value) || 0.5)))} />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={splitTrack}
                    disabled={!audioDuration || Boolean(busy) || windowModeBusy}
                  >
                    <Scissors className="size-4" />
                    {t("Авто-разбивка")}
                  </Button>
                </div>
                <div>
                  <FieldLabel
                    label="CLAP Top-K"
                    hint={t("Число параметров для каждой временной точки CLAP.")}
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
                    hint={t("Число параметров для каждой спектрограммы SigLIP2.")}
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
                    label={t("Шкала")}
                    hint={t("Вертикальная шкала Wavesurfer Spectrogram.")}
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
                    label={t("Рендер")}
                    hint={t("Windowed считает только видимую область и стабильнее работает с длинными треками.")}
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
                    label={t("SigLIP кадр")}
                    hint={t("Mel — один mel-график. Composite — mel, STFT, chroma и spectral contrast в одном изображении.")}
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
                    label={t("Детализация")}
                    hint={t("FFT: low 512, medium 1024, high 2048. То же качество применяется к изображениям для SigLIP2.")}
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
                    label={t("Палитра")}
                    hint={t("Палитра видимой спектрограммы.")}
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
                <ToggleRow label={t("Blend CLAP & SigLIP")} checked={blendMode} onChange={setBlendMode} />
                <ToggleRow label={t("Vocal Allocation Matrix")} checked={vocalMatrixMode} onChange={setVocalMatrixMode} />
                <ToggleRow
                  label={t("Показывать спектрограмму")}
                  checked={showSpectrogram}
                  onChange={setShowSpectrogram}
                />
                <ToggleRow
                  label={t("Показывать CLAP")}
                  checked={showClap}
                  onChange={setShowClap}
                />
                <ToggleRow
                  label={t("Показывать SigLIP2")}
                  checked={showSiglip}
                  onChange={setShowSiglip}
                />
                <ToggleRow
                  label={t("Интерполяция CLAP")}
                  checked={interpolateClap}
                  onChange={setInterpolateClap}
                />
                <ToggleRow
                  label={t("Интерполяция SigLIP2")}
                  checked={interpolateSiglip}
                  onChange={setInterpolateSiglip}
                />
              </div>
              {blendMode ? <div className="space-y-1"><FieldLabel label={`${t("Вес CLAP:")} ${Math.round(clapWeight * 100)}%`} hint={t("Остаток веса принадлежит SigLIP2. Scores нормализуются отдельно перед объединением.")} /><Input type="range" min={0} max={1} step={0.05} value={clapWeight} onChange={(event) => setClapWeight(Number(event.target.value))} /><div className="grid grid-cols-2 gap-2 text-[9px] text-muted-foreground"><span>CLAP trust · {clapTrust.sampleCount ? `${Math.round(clapTrust.trust * 100)}%` : "—"}</span><span>SigLIP2 trust · {siglipTrust.sampleCount ? `${Math.round(siglipTrust.trust * 100)}%` : "—"}</span><label>Low-trust threshold · {Math.round(trustThreshold * 100)}%<input aria-label="Modality low-trust threshold" className="w-full accent-cyan-400" type="range" min="0" max="1" step="0.05" value={trustThreshold} onChange={(event) => setTrustThreshold(Number(event.target.value))} /></label><label>Minimum modality weight · {Math.round(trustFloor * 100)}%<input aria-label="Modality trust floor weight" className="w-full accent-cyan-400" type="range" min="0" max="0.5" step="0.05" value={trustFloor} onChange={(event) => setTrustFloor(Number(event.target.value))} /></label></div></div> : null}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="bg-cyan-700 hover:bg-cyan-600"
                  disabled={!file || !segments.length || Boolean(busy) || windowModeBusy}
                  onClick={() => void analyze("clap")}
                >
                  {busy === "clap" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  {t("Запустить CLAP")}
                </Button>
                <Button
                  className="bg-fuchsia-700 hover:bg-fuchsia-600"
                  disabled={
                    !file ||
                    !segments.length ||
                    Boolean(busy) ||
                    windowModeBusy ||
                    !morphoStatus?.ready
                  }
                  onClick={() => void analyze("siglip")}
                >
                  {busy === "siglip" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  {t("Запустить SigLIP2")}
                </Button>
              </div>
              {!morphoStatus?.ready ? (
                <div className="rounded border border-amber-400/25 bg-amber-950/20 p-2 text-xs text-amber-200">
                  <div>
                    {morphoStatus?.index_job?.running
                      ? `${t("Перестройка индекса:")} ${morphoStatus.index_job.progress?.current ?? 0} / ${morphoStatus.index_job.progress?.total ?? 0}`
                      : `${t("Индекс SigLIP2 не готов:")} ${(morphoStatus?.stale_reasons ?? [morphoStatus?.status ?? "unknown"]).join("; ")}`}
                  </div>
                  <Link className="mt-2 flex w-full items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent" href="/am-core#service-bay">
                    {t("Открыть Service Bay")}
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
                  {t("Остановить пакетный анализ")}
                </Button>
              ) : null}
              <Button
                className="w-full"
                variant="outline"
                disabled={
                  !segments.some(
                    (segment) => segment.clap.length || segment.siglip.length,
                  )
                }
                onClick={exportTimeline}
              >
                <Download className="size-4" />
                {t("Экспорт Priority Timeline")}
              </Button>
              <Button className="w-full" variant="ghost" disabled={!segments.some((segment) => segment.clap.length || segment.siglip.length)} onClick={exportLegacyTimeline}>
                <Download className="size-4" />{t("Экспорт legacy timeline")}
              </Button>
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
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-400">
              <span>Parameter Timeline · {formatTime(currentTime)}</span>
              <V3InfoTip content={t("Нажмите точку для перемотки")} />
            </div>
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
            <ParameterTimelineGraph
              segments={nodeSegments}
              currentTime={currentTime}
              duration={audioDuration}
              showClap={showClap}
              showSiglip={showSiglip}
            />
          </section>

          <div className={`grid min-h-[620px] gap-3 ${blendMode ? "grid-cols-1" : "xl:grid-cols-2"}`}>
            {blendMode ? <ParameterBank title="Blended CLAP + SigLIP2" accent="cyan" parameters={macroParameters} useDomainLayerColors onChange={(name, value) => { updateValue("clap", name, value); updateValue("siglip", name, value); }} onRemove={(name) => { removeValue("clap", name); removeValue("siglip", name); }} /> : <><ParameterBank
              title="CLAP Parameters"
              accent="cyan"
              parameters={visibleClap}
              useDomainLayerColors
              onChange={(name, value) => updateValue("clap", name, value)}
              onRemove={(name) => removeValue("clap", name)}
            /><ParameterBank
              title="SigLIP2 Spectrogram Parameters"
              accent="fuchsia"
              parameters={visibleSiglip}
              useDomainLayerColors
              onChange={(name, value) => updateValue("siglip", name, value)}
              onRemove={(name) => removeValue("siglip", name)}
            /></>}
          </div>

          <aside className="flex flex-wrap gap-2">
            <MacroGenerator parameters={macroParameters} />
            <JournalDraftButton
              modality="audio"
              engine="clap"
              actionLabel="Сохранить CLAP в Journal"
              parameters={clapFrame}
              model={{ id: "laion/clap-htsat-fused" }}
              settings={{
                interval_seconds: segmentInterval,
                timeline_points: segments.length,
              }}
              asset={file}
              label={`Segmented CLAP · ${file?.name ?? "track"}`}
            />
            <JournalDraftButton
              modality="audio"
              engine="siglip2"
              actionLabel="Сохранить SigLIP2 в Journal"
              parameters={siglipFrame}
              model={{ id: "google/siglip2-base-patch16-224" }}
              settings={{
                interval_seconds: segmentInterval,
                timeline_points: segments.length,
                spectrogram_detail: spectrogramDetail,
              }}
              asset={file}
              label={`Segmented SigLIP2 · ${file?.name ?? "track"}`}
            />
          </aside>
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
  useDomainLayerColors = false,
}: {
  title: string;
  accent: "cyan" | "fuchsia";
  parameters: ActiveParameter[];
  onChange: (name: string, value: number | string) => void;
  onRemove: (name: string) => void;
  useDomainLayerColors?: boolean;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border bg-black/30 p-3 ${accent === "cyan" ? "border-cyan-400/25" : "border-fuchsia-400/25"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2
          className={`font-mono text-xs font-semibold uppercase tracking-[0.18em] ${accent === "cyan" ? "text-cyan-300" : "text-fuchsia-300"}`}
        >
          {title}
        </h2>
        <Badge variant="outline">{parameters.length}</Badge>
      </div>
      <VirtualizedParamList
        parameters={parameters}
        useDomainLayerColors={useDomainLayerColors}
        className="min-h-0 flex-1"
        onChange={onChange}
        onRemove={onRemove}
      />
    </section>
  );
}

function ParameterTimelineGraph({
  segments,
  currentTime,
  duration,
  showClap,
  showSiglip,
}: {
  segments: Array<{ time: number; clap: ActiveParameter[]; siglip: ActiveParameter[] }>;
  currentTime: number;
  duration: number;
  showClap: boolean;
  showSiglip: boolean;
}) {
  const t = useUiText();
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

  if (!series.length || !duration)
    return (
      <div className="mt-3 flex h-44 items-center justify-center rounded border border-white/10 bg-black text-xs text-zinc-600">
        <V3InfoTip content={t("После анализа здесь появятся наиболее активно изменяющиеся числовые параметры.")} />
      </div>
    );
  return (
    <div className="mt-3 rounded border border-white/10 bg-black p-2">
      <svg
        viewBox="0 0 1000 220"
        className="h-52 w-full"
        role="img"
        aria-label={t("График параметров во времени")}
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
