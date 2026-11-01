"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import Link from "next/link";
import Image from "next/image";
import {
  Download,
  ChevronDown,
  Loader2,
  Scissors,
  Square,
  Upload,
  Zap,
} from "lucide-react";

import { AudioWaveformEditor } from "@/components/audio/AudioWaveformEditor";
import { SemanticSearch } from "@/components/rag-v3/SemanticSearch";
import { V3InfoTip } from "@/components/rag-v3/V3Tooltip";
import { useUiText } from "@/lib/ui-i18n";
import { JournalDraftButton } from "@/components/cross-modal/JournalDraftButton";
import { ParamToTextWorkbench } from "@/components/am-stage/ParamToTextWorkbench";
import { GemmaMultimodalParameterSearch } from "@/components/am-stage/GemmaMultimodalParameterSearch";
import type { AmStageSessionData, AmStageSessionSummary, ParamTextWorkbenchSessionState } from "@/lib/am-stage-session";
import { MacroGenerator } from "@/components/rag-v3/MacroGenerator";
import { VirtualizedParamList } from "@/components/rag-v3/VirtualizedParamList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { buildLayerTimelineLanes, LAYER_TIMELINE_SERIES_LIMIT, UNCLASSIFIED_TIMELINE_LAYER } from "@/lib/am-stage-layer-timeline";
import { applyConsensusSmooth, averageParameterFrames, interpolateStageFrames, parameterMatchesLayers, type BlendCurve } from "@/lib/am-stage-blend";
import { computeModalityTrust, DEFAULT_MODALITY_TRUST_CONFIG } from "@/lib/modality-trust";

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

export function AMStagePage({ active = true }: { active?: boolean } = {}) {
  const t = useUiText();
  const stageRootRef = useRef<HTMLDivElement>(null);
  const v3Parameters = useRagV3Store((state) => state.activeParameters);
  const v3Query = useRagV3Store((state) => state.query);
  const setV3Query = useRagV3Store((state) => state.setQuery);
  const v3Session = useRagV3Store(useShallow((state) => ({ queryB: state.queryB, topK: state.topK, sources: state.sources, scopes: state.scopes, searchMode: state.searchMode, transitionRatio: state.transitionRatio, searchResults: state.searchResults, secondaryResults: state.secondaryResults, activeParameters: state.activeParameters, macro: state.macro })));
  const updateV3ParameterValue = useRagV3Store((state) => state.updateParameterValue);
  const removeV3Parameter = useRagV3Store((state) => state.removeParameter);
  const [selectedLayers, setSelectedLayers] = useState<string[]>(ACOUSTIC_DOMAIN_LAYERS.map((layer) => layer.id));
  const [showGlobalConsensus, setShowGlobalConsensus] = useState(false);
  const [consensusTopK, setConsensusTopK] = useState(64);
  const [consensusCentroidPercent, setConsensusCentroidPercent] = useState(35);
  const [titleOrder, setTitleOrder] = useState<"en-ru" | "ru-en">("en-ru");
  const [blendPair, setBlendPair] = useState("text-clap");
  const [blendPercent, setBlendPercent] = useState(50);
  const [blendCurve, setBlendCurve] = useState<BlendCurve>("linear");
  const [trustThreshold, setTrustThreshold] = useState(DEFAULT_MODALITY_TRUST_CONFIG.lowTrustThreshold);
  const [trustFloor, setTrustFloor] = useState(DEFAULT_MODALITY_TRUST_CONFIG.floorWeight);
  const [file, setFile] = useState<File | null>(null);
  const [audioReferenceName, setAudioReferenceName] = useState<string | null>(null);
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
  const [paramTextSessionState, setParamTextSessionState] = useState<ParamTextWorkbenchSessionState | null>(null);
  const [workbenchSessionKey, setWorkbenchSessionKey] = useState(0);
  const [activeSession, setActiveSession] = useState<{ id: string; title: string } | null>(null);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionSaveChoiceOpen, setSessionSaveChoiceOpen] = useState(false);
  const [sessionResetConfirmOpen, setSessionResetConfirmOpen] = useState(false);
  const [sessionRows, setSessionRows] = useState<AmStageSessionSummary[]>([]);
  const [sessionError, setSessionError] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [pendingSessionAction, setPendingSessionAction] = useState<null | { type: "open"; id: string } | { type: "new" }>(null);
  const fingerprintRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    for (const [key, setter] of [["text", setTextBankViewMode], ["clap", setClapBankViewMode], ["siglip", setSiglipBankViewMode]] as const) {
      const saved = window.sessionStorage.getItem(`am-stage-${key}-bank-view`);
      if (saved === "compact" || saved === "standard" || saved === "expanded") setter(saved);
    }
  }, []);
  useEffect(() => {
    const load = () => void fetch("/api/ui-preferences", { cache: "no-store" }).then((response) => response.json()).then((data: { parameterTitleOrder?: string }) => {
      if (data.parameterTitleOrder === "en-ru" || data.parameterTitleOrder === "ru-en") setTitleOrder(data.parameterTitleOrder);
    }).catch(() => undefined);
    const onPreferenceChange = (event: Event) => {
      const order = (event as CustomEvent<{ parameterTitleOrder?: string }>).detail?.parameterTitleOrder;
      if (order === "en-ru" || order === "ru-en") setTitleOrder(order);
    };
    load();
    window.addEventListener("ui-preferences:changed", onPreferenceChange);
    return () => window.removeEventListener("ui-preferences:changed", onPreferenceChange);
  }, []);
  useEffect(() => { window.sessionStorage.setItem("am-stage-text-bank-view", textBankViewMode); }, [textBankViewMode]);
  useEffect(() => { window.sessionStorage.setItem("am-stage-clap-bank-view", clapBankViewMode); }, [clapBankViewMode]);
  useEffect(() => { window.sessionStorage.setItem("am-stage-siglip-bank-view", siglipBankViewMode); }, [siglipBankViewMode]);

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

  const filteredV3Parameters = useMemo(() => v3Parameters.filter((parameter) => {
    const noLayerRestriction = selectedLayers.length === 0 || selectedLayers.length === ACOUSTIC_DOMAIN_LAYERS.length;
    const storedLayer = (parameter as ActiveParameter & { domain_layer?: string }).domain_layer;
    const layer = storedLayer ?? classifyDomainLayer(parameter.technical_name, parameter.category);
    const retrievalGroup = (parameter as ActiveParameter & { retrieval_group?: string }).retrieval_group;
    return layer !== GLOBAL_CONSENSUS_LAYER.id && (noLayerRestriction || !layer || selectedLayers.includes(layer) || retrievalGroup === "global_fill");
  }), [v3Parameters, selectedLayers]);
  const layerCounts = useMemo(() => {
    const names = new Map(ACOUSTIC_DOMAIN_LAYERS.map((layer) => [layer.id, new Set<string>()]));
    for (const parameter of [...v3Parameters, ...segments.flatMap((segment) => [...segment.clap, ...segment.siglip])]) {
      const layer = (parameter as ActiveParameter & { domain_layer?: string }).domain_layer ?? classifyDomainLayer(parameter.technical_name, parameter.category);
      const acousticLayer = ACOUSTIC_DOMAIN_LAYERS.find((item) => item.id === layer);
      if (acousticLayer) names.get(acousticLayer.id)?.add(parameter.technical_name);
    }
    return names;
  }, [segments, v3Parameters]);

  const saveTitleOrder = async (order: "en-ru" | "ru-en") => {
    const previous = titleOrder;
    setTitleOrder(order);
    try {
      const response = await fetch("/api/ui-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameterTitleOrder: order }) });
      if (!response.ok) throw new Error("Не удалось сохранить порядок заголовков.");
      window.dispatchEvent(new CustomEvent("ui-preferences:changed", { detail: { parameterTitleOrder: order } }));
    } catch (cause) {
      setTitleOrder(previous);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const selectFile = useCallback((nextFile: File) => {
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(nextFile);
    });
    setFile(nextFile);
    setAudioReferenceName(nextFile.name);
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
  const layerClap = useMemo(() => clapFrame.filter((parameter) => parameterMatchesLayers(parameter, selectedLayers)), [clapFrame, selectedLayers]);
  const layerSiglip = useMemo(() => siglipFrame.filter((parameter) => parameterMatchesLayers(parameter, selectedLayers)), [siglipFrame, selectedLayers]);
  const modalityTrustConfig = useMemo(() => ({ ...DEFAULT_MODALITY_TRUST_CONFIG, lowTrustThreshold: trustThreshold, floorWeight: trustFloor }), [trustFloor, trustThreshold]);
  const textTrust = useMemo(() => computeModalityTrust(filteredV3Parameters.map((parameter) => parameter.similarity)), [filteredV3Parameters]);
  const clapTrust = useMemo(() => computeModalityTrust(layerClap.map((parameter) => parameter.similarity)), [layerClap]);
  const siglipTrust = useMemo(() => computeModalityTrust(layerSiglip.map((parameter) => parameter.similarity)), [layerSiglip]);
  const matchesSelectedLayer = useCallback((parameter: ActiveParameter) => parameterMatchesLayers(parameter, selectedLayers), [selectedLayers]);
  const consensusFrames = useMemo(() => showGlobalConsensus
    ? applyConsensusSmooth([filteredV3Parameters, showClap ? layerClap : [], showSiglip ? layerSiglip : []], selectedLayers, consensusTopK, consensusCentroidPercent, modalityTrustConfig)
    : [filteredV3Parameters, showClap ? layerClap : [], showSiglip ? layerSiglip : []],
  [consensusCentroidPercent, consensusTopK, filteredV3Parameters, layerClap, layerSiglip, modalityTrustConfig, selectedLayers, showClap, showGlobalConsensus, showSiglip]);
  const [textStageParameters, visibleClap, visibleSiglip] = consensusFrames;
  const macroParameters = useMemo(
    () => blendMode ? blendParameterFrames(visibleClap, visibleSiglip, clapWeight, modalityTrustConfig) : mergeFrames(visibleClap, visibleSiglip),
    [blendMode, clapWeight, modalityTrustConfig, visibleClap, visibleSiglip],
  );
  const bridgeFrames = useMemo(() => {
    const pairs: Record<string, [ActiveParameter[], ActiveParameter[]]> = {
      "text-clap": [textStageParameters, visibleClap],
      "clap-siglip": [visibleClap, visibleSiglip],
      "text-siglip": [textStageParameters, visibleSiglip],
      "tri-modal": [textStageParameters, averageParameterFrames(visibleClap, visibleSiglip)],
    };
    const [first, second] = pairs[blendPair] ?? pairs["text-clap"];
    return interpolateStageFrames(first, second, blendPercent, blendCurve).filter((parameter) => parameterMatchesLayers(parameter, selectedLayers));
  }, [blendCurve, blendPair, blendPercent, selectedLayers, textStageParameters, visibleClap, visibleSiglip]);
  const capturedSessionData = useMemo<AmStageSessionData>(() => ({
    schema: "am_stage_session_v1",
    audio: { name: file?.name ?? audioReferenceName, duration_seconds: audioDuration, path: null, missing_on_restore: Boolean(audioReferenceName || file), warning: (audioReferenceName || file) ? "В снимке сохранены результаты и таймкоды, но браузерный аудиофайл не копируется. Выберите исходный файл повторно для воспроизведения и продолжения анализа." : null },
    analysis_settings: { region_offset: regionOffset, region_duration: regionDuration, analysis_start: analysisStart, analysis_end: analysisEnd, segment_interval: segmentInterval, node_interval: nodeInterval, clap_top_k: clapTopK, siglip_top_k: siglipTopK, spectrogram_scale: spectrogramScale, spectrogram_detail: spectrogramDetail, spectrogram_color: spectrogramColor, spectrogram_renderer: spectrogramRenderer, siglip_spectrogram_layout: siglipSpectrogramLayout, show_spectrogram: showSpectrogram },
    timeline: { segments: segments.map(({ siglipPreview: _preview, ...segment }) => segment) },
    banks: { text_parameters: v3Session.activeParameters, clap_parameters: [...new Map(segments.flatMap((segment) => segment.clap).map((parameter) => [parameter.technical_name, parameter])).values()], siglip_parameters: [...new Map(segments.flatMap((segment) => segment.siglip).map((parameter) => [parameter.technical_name, parameter])).values()], text_view: textBankViewMode, clap_view: clapBankViewMode, siglip_view: siglipBankViewMode, show_clap: showClap, show_siglip: showSiglip, interpolate_clap: interpolateClap, interpolate_siglip: interpolateSiglip },
    layers: { selected: selectedLayers, timeline_view: timelineView, stage2_visible: showGlobalConsensus, stage2_top_k: consensusTopK, stage2_centroid_percent: consensusCentroidPercent },
    interpolation: { pair: blendPair, percent: blendPercent, curve: blendCurve, blend_enabled: blendMode, clap_weight: clapWeight, trust_threshold: trustThreshold, trust_floor: trustFloor },
    vocal_matrix_mode: vocalMatrixMode,
    param_to_text: paramTextSessionState,
    v3: { query: v3Query, query_b: v3Session.queryB, top_k: v3Session.topK, sources: v3Session.sources, scopes: v3Session.scopes, search_mode: v3Session.searchMode, transition_ratio: v3Session.transitionRatio, search_results: v3Session.searchResults, secondary_results: v3Session.secondaryResults, active_parameters: v3Session.activeParameters, macro: v3Session.macro },
  }), [audioDuration, audioReferenceName, analysisEnd, analysisStart, blendCurve, blendMode, blendPair, blendPercent, clapTopK, clapWeight, consensusCentroidPercent, consensusTopK, file, interpolateClap, interpolateSiglip, nodeInterval, paramTextSessionState, regionDuration, regionOffset, selectedLayers, segments, segmentInterval, showClap, showGlobalConsensus, showSiglip, showSpectrogram, siglipSpectrogramLayout, siglipTopK, spectrogramColor, spectrogramDetail, spectrogramRenderer, textBankViewMode, timelineView, trustFloor, trustThreshold, v3Query, v3Session, vocalMatrixMode]);
  useEffect(() => {
    const fingerprint = JSON.stringify(capturedSessionData);
    setSessionDirty(Boolean(activeSession) && fingerprint !== fingerprintRef.current);
  }, [activeSession, capturedSessionData]);
  const onParamTextStateChange = useCallback((state: ParamTextWorkbenchSessionState) => setParamTextSessionState(state), []);
  const searchReverseBrief = useCallback((query: string) => {
    useRagV3Store.setState({ searchMode: "single", queryB: "", secondaryResults: [] });
    setV3Query(query);
    void useRagV3Store.getState().proposeParameters(query);
  }, [setV3Query]);

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
    const name = file?.name ?? audioReferenceName;
    if (!name) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name.replace(/\.[^.]+$/, "")}-${suffix}.json`; anchor.click(); URL.revokeObjectURL(url);
  };

  const exportTimeline = () => {
    const audioName = file?.name ?? audioReferenceName;
    if (!audioName || !segments.length) return;
    downloadJson(buildPriorityTimeline(nodeSegments, { audioName, audioDuration, rawInterval: segmentInterval, nodeInterval, blend: blendMode, clapWeight, trustConfig: modalityTrustConfig, textScores: filteredV3Parameters.map((parameter) => parameter.similarity), vocalMatrix: vocalMatrixMode }), "priority-timeline");
  };

  const exportLegacyTimeline = () => {
    const audioName = file?.name ?? audioReferenceName;
    if (!audioName || !segments.length) return;
    downloadJson({
      schema_version: "FLOWMUSIC_AUDIO_PARAMETER_TIMELINE_V1",
      audio: { name: audioName, duration_seconds: audioDuration },
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

  useEffect(() => {
    const handleStageShortcut = (event: KeyboardEvent) => {
      const root = stageRootRef.current;
      if (!root || event.repeat || !root.contains(event.target as Node) || !event.altKey || !event.shiftKey || !event.ctrlKey || event.metaKey) return;
      const target = event.target;
      const actionByKey: Record<string, string> = {
        KeyC: "clap-start",
        KeyX: "analysis-stop",
        KeyR: "clap-continue",
        KeyS: "siglip2-start",
        KeyT: "siglip2-continue",
        KeyP: "export-priority-timeline",
        KeyL: "export-legacy-timeline",
        KeyB: "search-a",
        KeyQ: "test-preset",
        KeyV: "voice-append",
        KeyW: "voice-replace",
      };
      const actionId = actionByKey[event.code];
      if (!actionId) return;
      const allowedFromTextarea = actionId.startsWith("voice-") || actionId === "search-a";
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input,select,[role=combobox],[contenteditable='true']") || (target.closest("textarea") && !allowedFromTextarea))) return;
      event.preventDefault();
      const actionButton = root.querySelector<HTMLButtonElement>(`[data-am-stage-action="${actionId}"]`);
      if (!actionButton) return;
      for (let ancestor = actionButton.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      }
      actionButton.click();
    };
    window.addEventListener("keydown", handleStageShortcut);
    return () => window.removeEventListener("keydown", handleStageShortcut);
  }, []);

  const refreshSessionRows = useCallback(async () => {
    const response = await fetch("/api/am-stage/sessions", { cache: "no-store" });
    const result = await response.json() as { sessions?: AmStageSessionSummary[]; error?: string };
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    setSessionRows(result.sessions ?? []);
  }, []);

  const saveSession = async (asNew: boolean): Promise<string | null> => {
    setSessionBusy(true); setSessionError("");
    try {
      const title = (asNew || !activeSession ? sessionTitleDraft : activeSession.title).trim() || audioReferenceName || "Сессия AM-Stage";
      const response = await fetch("/api/am-stage/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(!asNew && activeSession ? { id: activeSession.id } : {}), title, data: capturedSessionData }) });
      const result = await response.json() as { snapshot?: { meta: { id: string; title: string } }; error?: string };
      if (!response.ok || !result.snapshot) throw new Error(result.error || `HTTP ${response.status}`);
      const current = { id: result.snapshot.meta.id, title: result.snapshot.meta.title };
      setActiveSession(current); setSessionTitleDraft(current.title); fingerprintRef.current = JSON.stringify(capturedSessionData); setSessionDirty(false); setSessionSaveChoiceOpen(false); setSessionModalOpen(false);
      await refreshSessionRows().catch(() => undefined);
      return current.id;
    } catch (cause) { setSessionError(cause instanceof Error ? cause.message : String(cause)); return null; }
    finally { setSessionBusy(false); }
  };

  const openSession = async (id: string) => {
    setSessionBusy(true); setSessionError("");
    try {
      const response = await fetch(`/api/am-stage/sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json() as { snapshot?: { meta: { id: string; title: string }; data: AmStageSessionData }; error?: string };
      if (!response.ok || !result.snapshot) throw new Error(result.error || `HTTP ${response.status}`);
      const { meta, data } = result.snapshot;
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null); setFile(null); setAudioReferenceName(data.audio.name); setAudioDuration(data.audio.duration_seconds);
      setRegionOffset(data.analysis_settings.region_offset); setRegionDuration(data.analysis_settings.region_duration); setAnalysisStart(data.analysis_settings.analysis_start); setAnalysisEnd(data.analysis_settings.analysis_end);
      setSegmentInterval(data.analysis_settings.segment_interval); setNodeInterval(data.analysis_settings.node_interval); setClapTopK(data.analysis_settings.clap_top_k); setSiglipTopK(data.analysis_settings.siglip_top_k);
      setSpectrogramScale(data.analysis_settings.spectrogram_scale as SpectrogramScale); setSpectrogramDetail(data.analysis_settings.spectrogram_detail as SpectrogramDetail); setSpectrogramColor(data.analysis_settings.spectrogram_color as "gray" | "igray" | "roseus"); setSpectrogramRenderer(data.analysis_settings.spectrogram_renderer as SpectrogramRenderer); setSiglipSpectrogramLayout(data.analysis_settings.siglip_spectrogram_layout as SiglipSpectrogramLayout); setShowSpectrogram(data.analysis_settings.show_spectrogram);
      setSegments(data.timeline.segments); setCurrentTime(0);
      setTextBankViewMode(data.banks.text_view); setClapBankViewMode(data.banks.clap_view); setSiglipBankViewMode(data.banks.siglip_view); setShowClap(data.banks.show_clap); setShowSiglip(data.banks.show_siglip); setInterpolateClap(data.banks.interpolate_clap); setInterpolateSiglip(data.banks.interpolate_siglip);
      setSelectedLayers(data.layers.selected); setTimelineView(data.layers.timeline_view); setShowGlobalConsensus(data.layers.stage2_visible); setConsensusTopK(data.layers.stage2_top_k); setConsensusCentroidPercent(data.layers.stage2_centroid_percent);
      setBlendPair(data.interpolation.pair); setBlendPercent(data.interpolation.percent); setBlendCurve(data.interpolation.curve); setBlendMode(data.interpolation.blend_enabled); setClapWeight(data.interpolation.clap_weight); setTrustThreshold(data.interpolation.trust_threshold ?? DEFAULT_MODALITY_TRUST_CONFIG.lowTrustThreshold); setTrustFloor(data.interpolation.trust_floor ?? DEFAULT_MODALITY_TRUST_CONFIG.floorWeight); setVocalMatrixMode(data.vocal_matrix_mode);
      setParamTextSessionState(data.param_to_text); setWorkbenchSessionKey((key) => key + 1);
      useRagV3Store.setState({ query: data.v3.query, queryB: data.v3.query_b, topK: data.v3.top_k, sources: data.v3.sources, scopes: data.v3.scopes, searchMode: data.v3.search_mode as "single" | "transition", transitionRatio: data.v3.transition_ratio, searchResults: data.v3.search_results, secondaryResults: data.v3.secondary_results, activeParameters: data.v3.active_parameters, macro: data.v3.macro, isSearching: false, isGeneratingMacro: false, searchError: null, macroError: null });
      setActiveSession({ id: meta.id, title: meta.title }); setSessionTitleDraft(meta.title); fingerprintRef.current = JSON.stringify({ ...data, interpolation: { ...data.interpolation, trust_threshold: data.interpolation.trust_threshold ?? DEFAULT_MODALITY_TRUST_CONFIG.lowTrustThreshold, trust_floor: data.interpolation.trust_floor ?? DEFAULT_MODALITY_TRUST_CONFIG.floorWeight } }); setSessionDirty(false); setSessionModalOpen(false); setPendingSessionAction(null);
      setNotice(data.audio.missing_on_restore ? `Сессия открыта. Результаты и таймлайн восстановлены; для воспроизведения или продолжения анализа повторно выберите ${data.audio.name ?? "исходный аудиофайл"}.` : "Сессия AM-Stage восстановлена.");
    } catch (cause) { setSessionError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSessionBusy(false); }
  };

  const clearSessionState = () => {
    abortRef.current?.abort();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null); setFile(null); setAudioReferenceName(null); setAudioDuration(0); setCurrentTime(0); setSeekRequest({ time: 0, token: 0 });
    setRegionOffset(0); setRegionDuration(10); setAnalysisStart(0); setAnalysisEnd(0); setSegmentInterval(2); setNodeInterval(20); setSegments([]); setClapTopK(20); setSiglipTopK(20);
    setTextBankViewMode("standard"); setClapBankViewMode("standard"); setSiglipBankViewMode("standard"); setShowClap(true); setShowSiglip(true); setInterpolateClap(true); setInterpolateSiglip(true); setShowSpectrogram(true);
    setSpectrogramScale("mel"); setSpectrogramDetail("medium"); setSpectrogramColor("roseus"); setSpectrogramRenderer("windowed"); setSiglipSpectrogramLayout("rgb_delta"); setBlendMode(false); setClapWeight(.5); setTrustThreshold(DEFAULT_MODALITY_TRUST_CONFIG.lowTrustThreshold); setTrustFloor(DEFAULT_MODALITY_TRUST_CONFIG.floorWeight); setVocalMatrixMode(false);
    setSelectedLayers(ACOUSTIC_DOMAIN_LAYERS.map((layer) => layer.id)); setShowGlobalConsensus(false); setConsensusTopK(64); setConsensusCentroidPercent(35); setTimelineView("modality"); setBlendPair("text-clap"); setBlendPercent(50); setBlendCurve("linear");
    setParamTextSessionState(null); setWorkbenchSessionKey((key) => key + 1); setActiveSession(null); setSessionDirty(false); fingerprintRef.current = ""; setSessionResetConfirmOpen(false); setPendingSessionAction(null); setSessionModalOpen(false);
    useRagV3Store.setState({ query: "", queryB: "", topK: 50, sources: { library: true, frozen: true, atoms: true, generated: true }, scopes: { sound: true, structure: true, metadata: false, provenance: false, administrative: false }, vocalMatrixMode: false, searchMode: "single", transitionRatio: 50, searchResults: [], secondaryResults: [], activeParameters: [], macro: "", isSearching: false, isGeneratingMacro: false, searchError: null, macroError: null });
    setNotice("Создана новая пустая сессия AM-Stage. Сохранённые снимки не удалены."); setError("");
  };

  const requestNewSession = () => sessionDirty ? setSessionResetConfirmOpen(true) : clearSessionState();
  const requestOpenSession = (id: string) => sessionDirty ? setPendingSessionAction({ type: "open", id }) : void openSession(id);
  const saveForPendingAction = async () => {
    const id = await saveSession(false);
    if (!id || !pendingSessionAction) return;
    if (pendingSessionAction.type === "open") await openSession(pendingSessionAction.id);
    else clearSessionState();
  };

  const renameSession = async (id: string) => {
    const title = sessionTitleDraft.trim(); if (!title) return;
    const response = await fetch(`/api/am-stage/sessions/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    const result = await response.json() as { snapshot?: { meta: { title: string } }; error?: string };
    if (!response.ok) { setSessionError(result.error || `HTTP ${response.status}`); return; }
    if (activeSession?.id === id) setActiveSession({ id, title: result.snapshot?.meta.title ?? title });
    setRenamingSessionId(null); await refreshSessionRows();
  };

  const deleteSession = async (id: string) => {
    const row = sessionRows.find((item) => item.id === id);
    if (!window.confirm(`Удалить сохранённый снимок «${row?.title ?? id}»? Это удалит его папку и JSON-файл.`)) return;
    const response = await fetch(`/api/am-stage/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setSessionError(result.error || `HTTP ${response.status}`); return; }
    if (activeSession?.id === id) { setActiveSession(null); setSessionDirty(false); fingerprintRef.current = ""; }
    await refreshSessionRows();
  };

  const startSessionManager = async () => {
    setSessionError(""); setSessionModalOpen(true);
    try { await refreshSessionRows(); } catch (cause) { setSessionError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const requestSaveSession = () => {
    if (activeSession && sessionDirty) { setSessionTitleDraft(`${activeSession.title} — копия`); setSessionSaveChoiceOpen(true); return; }
    if (!activeSession) setSessionTitleDraft(audioReferenceName ? `${audioReferenceName.replace(/\.[^.]+$/, "")} · AM-Stage` : "Сессия AM-Stage");
    if (!activeSession) setSessionSaveChoiceOpen(true); else void saveSession(false);
  };

  return (
    <div ref={stageRootRef} data-am-stage className="flowmusic-console flex h-full min-w-0 flex-col text-zinc-100">
      <header className="border-b border-white/15 bg-black/70 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
              <AMIcon name="amStage" size="md" bright />
              AM Tri-Modal Stage · AM-Stage
              <V3InfoTip content="Последовательный анализ временных точек, независимая интерполяция и синхронное воспроизведение." />
            </h1>
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
            <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" onClick={requestSaveSession} disabled={sessionBusy}>{sessionBusy ? t("Сохраняю…") : `${t("Сохранить сессию")}${sessionDirty ? ` · ${t("изменена")}` : ""}`}</Button></TooltipTrigger><TooltipContent>{t("Сохранить текущее состояние анализа и настроек в снимок проекта.")}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" onClick={() => void startSessionManager()} disabled={sessionBusy}>{t("Открыть сессию")}</Button></TooltipTrigger><TooltipContent>{t("Открыть, переименовать или удалить ранее сохранённый снимок AM-Stage.")}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="sm" variant="ghost" onClick={requestNewSession} disabled={Boolean(busy)}>{t("Новая сессия AM-Stage")}</Button></TooltipTrigger><TooltipContent>{t("Сбросить рабочее состояние и начать новый анализ.")}</TooltipContent></Tooltip>
            <Button data-am-stage-action="test-preset" size="sm" variant="outline" onClick={() => void applyTestPreset()} disabled={Boolean(busy)}>{t("Проверочный preset")}</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="flex w-full min-w-0 flex-col gap-3">
          <section data-am-stage-zone="top-row" className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="min-w-0 space-y-3">
              <SemanticSearch primaryLabel="Brief" secondaryLabel="Transition" collapsible dataScope="am-stage" selectedDomainLayers={selectedLayers} />
              <GemmaMultimodalParameterSearch selectedLayers={selectedLayers} spectrogramFrame={activeSiglipSegment?.siglipPreview ? { dataUrl: activeSiglipSegment.siglipPreview.dataUrl, offset: activeSiglipSegment.offset } : undefined} />
          <details data-am-stage-disclosure="analysis-controls" className="rounded-lg border border-white/10 bg-black/30 p-3">
            <summary className="flex list-none cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-300 [&::-webkit-details-marker]:hidden"><AMIcon name="settings" size="sm" bright />Analysis controls · sampling, time gate, CLAP / SigLIP2, Continue<ChevronDown className="am-stage-disclosure-chevron size-3.5" /></summary>
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
                    <span className="flex items-center gap-1 text-[11px] text-zinc-300">Analysis time gate · timestamps relative to original file<V3InfoTip content="Auto-split and both model runs stay inside this range. Export times remain relative to the original file." /></span>
                    <button type="button" className="text-[10px] text-cyan-300 hover:underline" onClick={() => { setAnalysisStart(regionOffset); setAnalysisEnd(Math.min(audioDuration, regionOffset + regionDuration)); }}>Use waveform selection</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-zinc-500">Start (s)<Input type="number" min={0} max={audioDuration} step={0.1} value={analysisStart} onChange={(event) => setAnalysisStart(Math.max(0, Math.min(audioDuration, Number(event.target.value) || 0)))} /></label>
                    <label className="text-[10px] text-zinc-500">End (s)<Input type="number" min={0} max={audioDuration} step={0.1} value={analysisEnd || audioDuration} onChange={(event) => setAnalysisEnd(Math.max(0, Math.min(audioDuration, Number(event.target.value) || 0)))} /></label>
                  </div>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => splitTrack()}
                    disabled={!audioDuration || Boolean(busy)}
                  >
                    <Scissors className="size-4" />
                    {t("Авто-разбивка")}
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
                    label={t("Шкала")}
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
                    label={t("Рендер")}
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
              {blendMode || showGlobalConsensus ? <div className="grid grid-cols-2 gap-2 rounded border border-white/10 bg-black/20 p-2 text-[9px] text-muted-foreground">
                <span>{t("TEXT trust")} · {textTrust.sampleCount ? `${Math.round(textTrust.trust * 100)}%` : "—"}</span><span>{t("CLAP trust")} · {clapTrust.sampleCount ? `${Math.round(clapTrust.trust * 100)}%` : "—"}</span><span>{t("SigLIP2 trust")} · {siglipTrust.sampleCount ? `${Math.round(siglipTrust.trust * 100)}%` : "—"}</span>
                <label className="space-y-1">{t("Low-trust threshold")} · {Math.round(trustThreshold * 100)}%<input aria-label="Modality low-trust threshold" className="w-full accent-cyan-400" type="range" min="0" max="1" step="0.05" value={trustThreshold} onChange={(event) => setTrustThreshold(Number(event.target.value))} /></label>
                <label className="space-y-1">{t("Minimum modality weight")} · {Math.round(trustFloor * 100)}%<input aria-label="Modality trust floor weight" className="w-full accent-cyan-400" type="range" min="0" max="0.5" step="0.05" value={trustFloor} onChange={(event) => setTrustFloor(Number(event.target.value))} /></label>
              </div> : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5 rounded border border-cyan-400/20 p-2">
                  <Button data-am-stage-action="clap-start" className="w-full bg-cyan-700 hover:bg-cyan-600" disabled={!file || !segments.length || Boolean(busy)} title="Новая обработка CLAP с начала; только CLAP результаты будут заменены." onClick={() => void analyze("clap")}>
                    {busy === "clap" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                    CLAP · с начала
                  </Button>
                  <Button data-am-stage-action="clap-continue" title={t("Обработать CLAP только для сегментов без готового результата и продолжить сохранённый прогон.")} className="w-full" variant="outline" disabled={!file || Boolean(busy) || !canContinueClap} onClick={() => void analyze("clap", true)}>
                    {t("Continue CLAP")} ({clapCompleted}/{segments.length})
                  </Button>
                </div>
                <div className="space-y-1.5 rounded border border-fuchsia-400/20 p-2">
                  <Button data-am-stage-action="siglip2-start" className="w-full bg-fuchsia-700 hover:bg-fuchsia-600" disabled={!file || !segments.length || Boolean(busy) || !morphoStatus?.ready} title="Новая обработка SigLIP2 с начала; только SigLIP2 результаты будут заменены." onClick={() => void analyze("siglip")}>
                    {busy === "siglip" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                    SigLIP2 · с начала
                  </Button>
                  <Button data-am-stage-action="siglip2-continue" title={t("Обработать SigLIP2 только для сегментов без готового результата и продолжить сохранённый прогон.")} className="w-full" variant="outline" disabled={!file || Boolean(busy) || !morphoStatus?.ready || !canContinueSiglip} onClick={() => void analyze("siglip", true)}>
                    {t("Continue SigLIP2")} ({siglipCompleted}/{segments.length})
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
                <Button data-am-stage-action="analysis-stop" title="Остановить пакетный анализ после текущего активного запроса."
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
            <aside data-am-stage-zone="macro-exports" className="flex min-w-0 flex-col gap-2 rounded-lg border border-cyan-400/20 bg-black/30 p-3">
              <MacroGenerator parameters={textStageParameters} collapsible dataScope="am-stage" collapseLabel={`TEXT · Semantic V3 · ${textStageParameters.length}`} />
              <MacroGenerator parameters={macroParameters} collapsible dataScope="am-stage" collapseLabel={`CLAP + SigLIP2 · ${macroParameters.length}`} />
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Button data-am-stage-action="export-priority-timeline" title="Экспортировать текущие сегментные результаты и выбранные параметры в Priority Timeline JSON." variant="outline" disabled={!segments.some((segment) => segment.clap.length || segment.siglip.length)} onClick={exportTimeline}><Download className="size-4" />Экспорт Priority Timeline</Button>
                <Button data-am-stage-action="export-legacy-timeline" title="Скачать совместимый legacy-формат временной шкалы." variant="ghost" disabled={!segments.some((segment) => segment.clap.length || segment.siglip.length)} onClick={exportLegacyTimeline}><Download className="size-4" />Экспорт legacy timeline</Button>
                <JournalDraftButton modality="audio" engine="clap" actionLabel="Сохранить CLAP в Journal" parameters={clapFrame} model={{ id: "laion/clap-htsat-fused" }} settings={{ interval_seconds: segmentInterval, timeline_points: segments.length }} asset={file} label={`Segmented CLAP · ${file?.name ?? "track"}`} />
                <JournalDraftButton modality="audio" engine="siglip2" actionLabel="Сохранить SigLIP2 в Journal" parameters={siglipFrame} model={{ id: "google/siglip2-base-patch16-224" }} settings={{ interval_seconds: segmentInterval, timeline_points: segments.length, spectrogram_detail: spectrogramDetail }} asset={file} label={`Segmented SigLIP2 · ${file?.name ?? "track"}`} />
              </div>
              <ParamToTextWorkbench key={workbenchSessionKey} audioName={file?.name ?? audioReferenceName} audioDuration={audioDuration} currentTime={currentTime} segments={segments} selectedLayers={selectedLayers} brief={v3Query} topK={v3Session.topK} defaultClap={showClap} defaultSiglip={showSiglip} matchesLayer={matchesSelectedLayer} initialState={paramTextSessionState} onStateChange={onParamTextStateChange} onSearchReverse={searchReverseBrief} />
            </aside>
          </section>

          <section data-am-stage-zone="node-seek" className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-2" aria-label="Parameter timeline node seek">
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400"><AMIcon name="audioToParameter" size="sm" bright />Node seek · Parameter Timeline</div>
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

          <section data-am-stage-zone="media" className="min-w-0 rounded-lg border border-cyan-400/20 bg-black/30 p-4">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400"><AMIcon name="audioToParameter" size="sm" bright />Waveform · Spectrogram</div>
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

          </section>

          <div data-am-stage-zone="timeline" className="grid min-w-0 gap-3 xl:grid-cols-[minmax(170px,1fr)_minmax(0,9fr)]">
            <aside aria-label="Domain layer timeline visibility filters" className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background/85 p-3 xl:max-h-[min(70vh,720px)]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-wider"><AMIcon name="settings" size="sm" bright />Layer matrix</h2><select title={t("Изменить порядок английского и русского названий параметров")} aria-label="Parameter title order" value={titleOrder} onChange={(event) => void saveTitleOrder(event.target.value as "en-ru" | "ru-en")} className="max-w-32 rounded border border-white/15 bg-black/50 px-1.5 py-1 text-[9px]"><option value="en-ru">Title EN → RU</option><option value="ru-en">Title RU → EN</option></select></div>
              <div className="mb-2 flex justify-end"><V3InfoTip content="Фильтр показывает девять акустических слоёв. Stage-2 ниже — отдельная постобработка уже найденных кадров, не слой и не новый индекс." /></div>
              <div className="mb-2 flex flex-wrap gap-1"><button type="button" title="Включить все девять акустических слоёв" className="rounded border border-white/15 px-2 py-1 text-[9px]" onClick={() => setSelectedLayers(ACOUSTIC_DOMAIN_LAYERS.map((layer) => layer.id))}>All 9</button><button type="button" title="Снять выбор со всех акустических слоёв" className="rounded border border-white/15 px-2 py-1 text-[9px]" onClick={() => setSelectedLayers([])}>Clear</button></div>
              <div className="flex flex-col gap-1.5">
                {ACOUSTIC_DOMAIN_LAYERS.map((layer) => {
                  const checked = selectedLayers.includes(layer.id);
                  const count = layerCounts.get(layer.id)?.size ?? 0;
                  const countsAvailable = v3Parameters.length > 0 || segments.some((segment) => segment.clap.length > 0 || segment.siglip.length > 0);
                  return <label key={layer.id} data-am-stage-layer={layer.id} title={`${t(layer.label)} · ${count} ${t("параметров")}`} className="flex min-h-9 cursor-pointer items-center gap-2 rounded border px-2 py-1 text-[10px] transition-colors hover:bg-white/5" style={{ borderColor: `${layer.color}70`, color: layer.color }}><input className="peer sr-only" data-am-stage-action={`toggle-layer-${layer.id.toLowerCase()}`} type="checkbox" checked={checked} onChange={() => setSelectedLayers((current) => checked ? current.filter((id) => id !== layer.id) : [...current, layer.id])} /><AMIcon name={layer.icon} size="sm" className={`h-7 w-7 ${checked ? "opacity-100" : "opacity-60"}`} /><span>{t(layer.label)}</span><span className="ml-auto tabular-nums text-muted-foreground">{countsAvailable ? count : "—"}</span></label>;
                })}
              </div>
              <section data-am-stage-zone="stage-2-postprocess" className="mt-2 space-y-2 rounded border p-2" style={{ borderColor: `${GLOBAL_CONSENSUS_LAYER.color}70` }} aria-label="Stage-2 client post-processing">
                <label title="Включает клиентское сглаживание уже загруженных параметров; новые retrieval не выполняются." className="flex cursor-pointer items-center gap-2 text-[10px] font-medium" style={{ color: GLOBAL_CONSENSUS_LAYER.color }}><input data-am-stage-action="toggle-consensus-visibility" type="checkbox" checked={showGlobalConsensus} onChange={(event) => setShowGlobalConsensus(event.target.checked)} /><AMIcon name="layerVector" size="sm" />Global Consensus · Stage-2</label>
                <div className="flex justify-end"><V3InfoTip content="Клиентски сглаживает параметры из текущего результата и CLAP/SigLIP кадров. Новые параметры из индекса не добавляются." /></div>
                {showGlobalConsensus ? <><div className="flex items-center justify-between text-[9px]"><span>Query {100 - consensusCentroidPercent}%</span><span>Centroid {consensusCentroidPercent}%</span></div><input aria-label="Consensus centroid weight" className="w-full accent-violet-400" type="range" min="0" max="100" value={consensusCentroidPercent} onChange={(event) => setConsensusCentroidPercent(Number(event.target.value))} /><label className="flex items-center justify-between gap-2 text-[9px]">Centroid pool k<input aria-label="Consensus centroid top k" className="w-16 rounded border border-white/15 bg-black/50 px-1.5 py-1 text-right" type="number" min="1" max="500" value={consensusTopK} onChange={(event) => setConsensusTopK(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /></label></> : null}
              </section>
            </aside>
          <section data-am-stage-zone="timeline-chart" className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-400">
              <span>Parameter Timeline · {formatTime(currentTime)}</span>
              <V3InfoTip content={t("Нажмите точку для перемотки")} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1"><h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">Parameter timeline</h3><V3InfoTip content={t("До {limit} наиболее изменяющихся серий на слой; C = CLAP, S = SigLIP2, T = TEXT brief. GLOBAL_CONSENSUS исключён. Пустая шкала появится после анализа.").replace("{limit}", String(LAYER_TIMELINE_SERIES_LIMIT))} /></div>
              <div className="flex gap-1 text-xs" role="group" aria-label="Timeline view">
                {([ ["modality", "By modality"], ["layer", "By layer"] ] as const).map(([view, label]) => (
                  <button key={view} data-am-stage-action={`timeline-view-${view}`} type="button" onClick={() => setTimelineView(view)} aria-pressed={timelineView === view} className={`rounded border px-2 py-1 ${timelineView === view ? "border-violet-400 bg-violet-950/40 text-violet-200" : "border-white/15 text-zinc-400 hover:text-white"}`}>{label}</button>
                ))}
              </div>
            </div>
            <ParameterTimelineGraph
              segments={nodeSegments}
              textParameters={v3Parameters}
              selectedLayers={selectedLayers}
              currentTime={currentTime}
              duration={audioDuration}
              showClap={showClap}
              showSiglip={showSiglip}
              view={timelineView}
            />
          </section>

          </div>

          <section data-am-stage-zone="cross-modal-interpolation" className="space-y-2 rounded-lg border border-violet-400/25 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-1 font-mono text-xs font-semibold uppercase tracking-wider text-violet-200">Cross-Modal Interpolation Bridge<V3InfoTip content="Числовые параметры смешиваются по техническому имени; дискретные переключаются на ближайший источник. Учитывается выбранная маска слоёв." /></h2><Badge variant="outline">client preview · no model rerun</Badge></div>
              <div className="grid gap-3 md:grid-cols-[minmax(140px,1fr)_minmax(180px,2fr)_minmax(150px,1fr)]">
              <label title="Выбирает источники данных для клиентской интерполяции." className="space-y-1 text-[10px] text-muted-foreground">Source pair<select aria-label="Cross-modal source pair" value={blendPair} onChange={(event) => setBlendPair(event.target.value)} className="h-8 w-full rounded border border-white/15 bg-black/50 px-2 text-foreground"><option value="text-clap">Text ↔ CLAP</option><option value="clap-siglip">CLAP ↔ SigLIP2</option><option value="text-siglip">Text ↔ SigLIP2</option><option value="tri-modal">Tri-Modal Blend</option></select></label>
              <label title="Определяет долю второго источника при интерполяции." className="space-y-1 text-[10px] text-muted-foreground">Blend · {blendPercent}%<input aria-label="Cross-modal blend percentage" className="mt-2 w-full accent-violet-400" type="range" min="0" max="100" value={blendPercent} onChange={(event) => setBlendPercent(Number(event.target.value))} /><span className="block text-[9px]">0% = first source · 100% = second source</span></label>
              <label title="Форма перехода между числовыми значениями источников." className="space-y-1 text-[10px] text-muted-foreground">Curve<select aria-label="Cross-modal blend curve" value={blendCurve} onChange={(event) => setBlendCurve(event.target.value as BlendCurve)} className="h-8 w-full rounded border border-white/15 bg-black/50 px-2 text-foreground"><option value="linear">Linear (Lerp)</option><option value="cosine">S-Sigmoid (Cosine)</option><option value="cubic">Cubic-Bezier Spline</option><option value="exponential">Exponential Growth</option></select></label>
            </div>
            <div className="max-h-40 overflow-auto rounded border border-white/10"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 p-2 font-mono text-[10px]">{bridgeFrames.slice(0, 64).map((parameter) => <div key={parameter.technical_name} className="contents"><span className="truncate text-zinc-400">{parameter.technical_name}</span><span className="text-violet-200">{String(parameter.current_value)}</span></div>)}{bridgeFrames.length === 0 ? <span className="col-span-2 py-2 text-center text-muted-foreground">Нет пересекающихся параметров в загруженных результатах.</span> : null}</div></div>
          </section>

          <section data-am-stage-zone="modality-banks" className="grid min-h-[560px] min-w-0 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ParameterBank dataScope="am-stage" title="CLAP Parameters" icon="clap" bankId="clap" accent="cyan" parameters={visibleClap} viewMode={clapBankViewMode} titleOrder={titleOrder} onViewModeChange={setClapBankViewMode} useDomainLayerColors onChange={(name, value) => updateValue("clap", name, value)} onRemove={(name) => removeValue("clap", name)} />
            <ParameterBank dataScope="am-stage" title="SigLIP2 Spectrogram Parameters" icon="morpho" bankId="siglip2" accent="fuchsia" parameters={visibleSiglip} viewMode={siglipBankViewMode} titleOrder={titleOrder} onViewModeChange={setSiglipBankViewMode} useDomainLayerColors onChange={(name, value) => updateValue("siglip", name, value)} onRemove={(name) => removeValue("siglip", name)} />
          </section>
          <ParameterBank dataScope="am-stage" title={`TEXT · Semantic V3 · ${textStageParameters.length}/${v3Parameters.length}`} icon="search" bankId="text" accent="cyan" parameters={textStageParameters} viewMode={textBankViewMode} titleOrder={titleOrder} onViewModeChange={setTextBankViewMode} useDomainLayerColors onChange={updateV3ParameterValue} onRemove={removeV3Parameter} />
        </div>
        {sessionModalOpen ? <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="am-stage-sessions-title" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-violet-400/40 bg-zinc-950 p-4 shadow-xl"><div className="mb-3 flex items-center justify-between gap-2"><h2 id="am-stage-sessions-title" className="font-mono text-sm font-semibold">Сессии AM-Stage</h2><Button size="sm" variant="ghost" onClick={() => { setSessionModalOpen(false); setPendingSessionAction(null); }}>Закрыть</Button></div>
          {pendingSessionAction ? <div className="mb-3 rounded border border-amber-400/30 bg-amber-950/20 p-3"><p className="text-sm">Есть несохранённые изменения. Сохранить их перед {pendingSessionAction.type === "open" ? "открытием другой сессии" : "созданием новой сессии"}?</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => void saveForPendingAction()} disabled={sessionBusy}>Сохранить и продолжить</Button><Button size="sm" variant="outline" onClick={() => pendingSessionAction.type === "open" ? void openSession(pendingSessionAction.id) : clearSessionState()}>Продолжить без сохранения</Button><Button size="sm" variant="ghost" onClick={() => setPendingSessionAction(null)}>Отмена</Button></div></div> : null}
          {sessionRows.length ? <ul className="space-y-2">{sessionRows.map((row) => <li key={row.id} className="rounded border border-white/10 p-2"><div className="flex flex-wrap items-center justify-between gap-2">{renamingSessionId === row.id ? <div className="flex min-w-0 flex-1 gap-1"><Input aria-label="Название сессии" value={sessionTitleDraft} onChange={(event) => setSessionTitleDraft(event.target.value)} /><Button size="sm" onClick={() => void renameSession(row.id)}>Сохранить имя</Button></div> : <div className="min-w-0"><p className="truncate text-sm font-medium">{row.title}{activeSession?.id === row.id ? <span className="ml-2 text-[10px] text-cyan-300">текущая{sessionDirty ? " · изменена" : ""}</span> : null}</p><p className="text-[10px] text-muted-foreground">{row.audio_name ?? "без аудио"} · {row.segment_count} точек · {row.parameter_count} параметров · обновлена {new Date(row.updated_at).toLocaleString()}</p></div>}<div className="flex flex-wrap gap-1">{renamingSessionId !== row.id ? <><Button size="sm" onClick={() => requestOpenSession(row.id)} disabled={sessionBusy}>Открыть</Button><Button size="sm" variant="outline" onClick={() => { setRenamingSessionId(row.id); setSessionTitleDraft(row.title); }}>Переименовать</Button><Button size="sm" variant="ghost" onClick={() => void deleteSession(row.id)}>Удалить</Button></> : <Button size="sm" variant="ghost" onClick={() => setRenamingSessionId(null)}>Отмена</Button>}</div></div></li>)}</ul> : <p className="rounded border border-white/10 p-4 text-sm text-muted-foreground">Сохранённых сессий пока нет.</p>}
          {sessionError ? <p role="alert" className="mt-3 text-xs text-rose-300">{sessionError}</p> : null}</section></div> : null}
        {sessionSaveChoiceOpen ? <div className="fixed inset-0 z-[95] grid place-items-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-labelledby="am-stage-save-title" className="w-full max-w-md space-y-3 rounded-lg border border-violet-400/40 bg-zinc-950 p-4"><h2 id="am-stage-save-title" className="font-mono text-sm font-semibold">{activeSession ? "Сохранить изменения сессии" : "Новая сессия"}</h2>{!activeSession ? <label className="block text-xs">Название<Input className="mt-1" value={sessionTitleDraft} onChange={(event) => setSessionTitleDraft(event.target.value)} /></label> : <><p className="text-xs text-muted-foreground">Сохранить изменения в «{activeSession.title}» или создать отдельный снимок.</p>{sessionDirty ? <label className="block text-xs">Название нового снимка<Input className="mt-1" value={sessionTitleDraft} onChange={(event) => setSessionTitleDraft(event.target.value)} /></label> : null}</>}<div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setSessionSaveChoiceOpen(false)}>Отмена</Button>{activeSession && sessionDirty ? <Button size="sm" variant="outline" onClick={() => void saveSession(true)} disabled={sessionBusy}>Сохранить как новую</Button> : null}<Button size="sm" onClick={() => void saveSession(!activeSession)} disabled={sessionBusy}>{sessionBusy ? "Сохраняю…" : activeSession ? "Сохранить текущую" : "Создать снимок"}</Button></div>{sessionError ? <p role="alert" className="text-xs text-rose-300">{sessionError}</p> : null}</section></div> : null}
        {sessionResetConfirmOpen ? <div className="fixed inset-0 z-[95] grid place-items-center bg-black/75 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="am-stage-new-title" className="w-full max-w-md space-y-3 rounded-lg border border-amber-400/40 bg-zinc-950 p-4"><h2 id="am-stage-new-title" className="font-mono text-sm font-semibold">Начать новую сессию?</h2><p className="text-xs text-muted-foreground">Несохранённые изменения будут удалены из текущего рабочего состояния. Файлы сохранённых снимков останутся на месте.</p><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setSessionResetConfirmOpen(false)}>Отмена</Button><Button size="sm" variant="outline" onClick={() => { void (async () => { const id = await saveSession(false); if (id) clearSessionState(); })(); }} disabled={sessionBusy}>Сохранить и начать новую</Button><Button size="sm" onClick={clearSessionState}>Начать без сохранения</Button></div>{sessionError ? <p role="alert" className="text-xs text-rose-300">{sessionError}</p> : null}</section></div> : null}
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
  icon,
  bankId,
  accent,
  parameters,
  onChange,
  onRemove,
  viewMode,
  onViewModeChange,
  titleOrder,
  useDomainLayerColors = false,
  dataScope,
}: {
  title: string;
  icon: "clap" | "morpho" | "search";
  bankId: "clap" | "siglip2" | "text";
  accent: "cyan" | "fuchsia";
  parameters: ActiveParameter[];
  onChange: (name: string, value: number | string) => void;
  onRemove: (name: string) => void;
  viewMode: "compact" | "standard" | "expanded";
  titleOrder: "en-ru" | "ru-en";
  onViewModeChange: (mode: "compact" | "standard" | "expanded") => void;
  useDomainLayerColors?: boolean;
  dataScope?: "am-stage";
}) {
  return (
    <details open data-am-stage-disclosure={dataScope ? `bank-${bankId}` : undefined} className={`min-w-0 rounded-lg border bg-black/30 p-3 ${accent === "cyan" ? "border-cyan-400/25" : "border-fuchsia-400/25"}`}>
      <summary className="mb-2 flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <h2 className={`flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] ${accent === "cyan" ? "text-cyan-300" : "text-fuchsia-300"}`}>
          <AMIcon name={icon} size="sm" bright />
          {title}
          <ChevronDown className="am-stage-disclosure-chevron size-3.5" />
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
        titleOrder={titleOrder}
        useDomainLayerColors={useDomainLayerColors}
        dataScope={dataScope}
        onChange={onChange}
        onRemove={onRemove}
      />
    </details>
  );
}

function ParameterTimelineGraph({
  segments,
  textParameters,
  selectedLayers,
  currentTime,
  duration,
  showClap,
  showSiglip,
  view,
}: {
  segments: Array<{ time: number; clap: ActiveParameter[]; siglip: ActiveParameter[] }>;
  textParameters: ActiveParameter[];
  selectedLayers: string[];
  currentTime: number;
  duration: number;
  showClap: boolean;
  showSiglip: boolean;
  view: "modality" | "layer";
}) {
  const t = useUiText();
  const lanes = useMemo(() => buildLayerTimelineLanes(segments, textParameters, duration, showClap, showSiglip).filter((lane) => lane.id === UNCLASSIFIED_TIMELINE_LAYER.id || selectedLayers.includes(lane.id)), [duration, segments, selectedLayers, showClap, showSiglip, textParameters]);
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
      <div className="mt-3 h-44 rounded border border-white/10 bg-black" aria-label={t("Пустая временная шкала параметров")} />
    );
  if (view === "layer") return (
    <div className="mt-3 space-y-2 rounded border border-white/10 bg-black p-2">
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
