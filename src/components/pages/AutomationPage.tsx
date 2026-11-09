"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUiText } from "@/lib/ui-i18n";
import { AUTOMATION_ACTION_IDS, type AutomationActionId, type AutomationScenarioDefinition, type AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";
import { useRagV3Store } from "@/store/rag-v3-store";
import { ACOUSTIC_DOMAIN_LAYERS } from "@/lib/domain-layers";
import { DEFAULT_INSTRUCTION_SLOTS, toInstructionContext, type InstructionSlot } from "@/lib/rag-v3/instruction-support";
import { AUTOMATION_POLICY } from "@/lib/am-stage-automation/policies";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { selectTextLlmSegments } from "@/lib/am-stage-automation/segment-sampling";
import { extractStageBankParameters } from "@/lib/am-stage-automation/historical-segment-results";

type ScenarioRow = { id: string; origin: string; title: string; description: string; version: number; archived: boolean; definition: AutomationScenarioDefinition | null };
type Preview = { scenario: { title: string; description: string }; route: Array<{ stageId: string; actionId: string; title: string; role: string; requiredForGoal: boolean; outputDefinitions: Array<{ kind: string; required: boolean }>; settings: { requested: Record<string, unknown>; effective: Record<string, unknown>; origin: string }; readiness: string; readinessReason?: string }>; blockers: Array<{ code: string; message: string }>; warnings: string[]; estimates: { stageCount: number; segmentCount: number | null; durationSeconds: number | null; eta: number | null; confidence: "unknown" | "low" | "medium" | "high"; unknownStageCount?: number; forecasts?: Array<{ stageId: string; seconds: number | null; lowSeconds: number | null; highSeconds: number | null; sampleCount: number; workUnits: number; basis: string }> } };
type Run = { id: string; title: string; status: string; scenarioId: string | null; plan?: { scenarioRef: { id: string; version: number }; externalInputs: { brief?: string; assetId?: string; audioName?: string; audioDurationSeconds?: number; audioRange?: { startSeconds: number; endSeconds: number; durationSeconds: number; assetId: string }; briefAssembly?: { sources: { reverseQuery: boolean; interpretations: boolean; textFeatures: boolean; trackDraft: boolean; gapDescriptions?: boolean }; executor: "freellmapi" | "ollama_settings" | "ollama_model"; model?: string; trackDraft?: StageTrackDraft } }; budgetPolicies?: { topK?: number } }; stages: Array<{ id: string; stageId: string; actionId: string; status: string; attempts: Array<{ attemptNumber: number; status: string; error: { message?: string } | null }>; nodeCheckpoints?: Array<{ id: string; payload: { data?: Record<string, unknown> } }>; artifacts: Array<{ id: string; kind: string; bankId: string | null; payload: { data?: unknown; warnings?: string[]; segmentRefs?: unknown[] } }> }>; events: Array<{ sequence: number; type: string; stageId: string | null; payload: unknown }>; lastErrorSummary: string | null };
type Audio = { id: string; filename: string | null; mimeType?: string | null; durationSeconds: number | null; sizeBytes: number; contentHash?: string; availabilityStatus?: string };
type AudioSource = Audio & { createdAt: string; references: number };
type ImportSource = { name: string; sizeBytes: number; mimeType: string; modifiedAt: string };
type StageSessionSummary = { id: string; title: string; updated_at: string };
type StageTrackDraft = { sessionId: string; language: "en" | "ru"; text: string; snapshotUpdatedAt: string };
type Crystal = { id: string; code: string; combination: string; combinationShort?: string };
const ACTION_LABELS: Record<AutomationActionId, string> = {
  "brief.from_crystal": "Brief from selected crystal", "brief.from_template": "Brief from template", "audio.analyze": "Analyze audio", "audio.segment": "Prepare audio windows",
  "text.qwen.resolved": "Qwen text search", "text.gemma.awtd": "Gemma text identity search", "text.gemma.resolved": "Gemma text values", "audio.clap.resolved": "CLAP audio search", "spec.siglip.resolved": "SigLIP spectrogram search", "audio.gemma.awtd": "Gemma audio identity search", "audio.gemma.resolved": "Gemma audio values",
  "stage2.client": "Client Stage-2 smoothing", "stage2.server": "Server Stage-2 retrieval", "audio.describe.lfm3": "LFM3 sound description", "audio.describe_gaps.lfm3": "LFM3 center samples between described nodes", "audio.transcribe.lfm3": "LFM3 speech transcription", "audio.extract_acoustics": "Librosa acoustic features", "audio.detect_indic_language": "Indic language detection", "audio.assess_vocal_timbre": "Vocal timbre assessment", "audio.analyze_helm": "Helm voice analysis (disabled)", "text_features.build": "Build text features", "text_features.compare_rankings": "Compare feature rankings", "text_features.describe_llm": "Describe features", "text_features.reverse_query": "Reverse query", "brief.combine_segment_texts": "Combine fragment evidence into Brief", "vocal_allocation.search": "Vocal Allocation search", "result.bundle": "Export result bundle",
};
const ACTIVE = new Set(["preparing", "running", "stopping"]);
const LEGACY_KEY = "am-stage-automation-library-v1";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function makeDraftStage(actionId: AutomationActionId, index: number): AutomationStageDefinition {
  const stageId = `draft:${index + 1}:${actionId.replaceAll(".", "-")}:${crypto.randomUUID()}`;
  const outputKind: Record<AutomationActionId, string> = {
    "brief.from_crystal": "brief", "brief.from_template": "brief", "audio.analyze": "audio-analysis", "audio.segment": "segment-plan",
    "text.qwen.resolved": "parameter-bank", "text.gemma.awtd": "parameter-bank", "text.gemma.resolved": "parameter-bank", "audio.clap.resolved": "parameter-bank", "spec.siglip.resolved": "parameter-bank", "audio.gemma.awtd": "parameter-bank", "audio.gemma.resolved": "parameter-bank", "stage2.client": "parameter-bank", "stage2.server": "parameter-bank",
    "audio.describe.lfm3": "description", "audio.describe_gaps.lfm3": "gap-descriptions", "audio.transcribe.lfm3": "transcription", "audio.extract_acoustics": "acoustic-analysis", "audio.detect_indic_language": "language-analysis", "audio.assess_vocal_timbre": "voice-analysis", "audio.analyze_helm": "helm-analysis",
    "text_features.build": "text-feature-snapshot", "text_features.compare_rankings": "ranking-variants", "text_features.describe_llm": "natural-description", "text_features.reverse_query": "reverse-query", "brief.combine_segment_texts": "brief", "vocal_allocation.search": "vocal-allocation", "result.bundle": "run-bundle",
  };
  return {
    stageId, actionId, title: ACTION_LABELS[actionId], role: actionId.split(".")[0], inputBindings: [],
    outputDefinitions: [{ port: "result", kind: outputKind[actionId], required: true }],
    settings: { requested: {}, effective: {}, origin: "manual" }, requiredForGoal: true,
    failurePolicy: "fail_run", allowedFallbacks: [], available: true,
  };
}

function materializeDraftStages(stages: AutomationStageDefinition[], scenarioId: string) {
  const ids = new Map(stages.map((stage, index) => [stage.stageId, `${scenarioId}:${String(index + 1).padStart(2, "0")}:${stage.actionId.replaceAll(".", "-")}`]));
  return stages.map((stage, index) => {
    const inputs = stage.inputBindings.filter((binding) => binding.port !== "order" && (binding.from.startsWith("external:") || (binding.from.startsWith("stage:") && ids.has(binding.from.slice(6)))))
      .map((binding) => binding.from.startsWith("external:") ? binding : ({ ...binding, from: `stage:${ids.get(binding.from.slice(6))!}` }));
    if (index > 0) inputs.push({ name: "previousStage", from: `stage:${ids.get(stages[index - 1].stageId)!}`, port: "order" });
    return { ...structuredClone(stage), stageId: ids.get(stage.stageId)!, inputBindings: inputs };
  });
}

export function AutomationPage() {
  const t = useUiText(); const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]); const [scenarioId, setScenarioId] = useState("");
  const [draftStages, setDraftStages] = useState<AutomationStageDefinition[]>([makeDraftStage("text.qwen.resolved", 0)]);
  const [title, setTitle] = useState(""); const [brief, setBrief] = useState(""); const [audio, setAudio] = useState<Audio | null>(null); const [duration, setDuration] = useState(0);
  const [templateBrief, setTemplateBrief] = useState("");
  const [briefAssemblySources, setBriefAssemblySources] = useState({ reverseQuery: true, interpretations: true, textFeatures: false, trackDraft: false, gapDescriptions: false });
  const [briefExecutor, setBriefExecutor] = useState<"freellmapi" | "ollama_settings" | "ollama_model">("freellmapi");
  const [briefExecutorModel, setBriefExecutorModel] = useState("");
  const [stageSessions, setStageSessions] = useState<StageSessionSummary[]>([]);
  const [trackDraftSessionId, setTrackDraftSessionId] = useState("");
  const [trackDraftLanguage, setTrackDraftLanguage] = useState<"en" | "ru">("en");
  const [trackDraft, setTrackDraft] = useState<StageTrackDraft | null>(null);
  const restoredTrackDraftRef = useRef<StageTrackDraft | null>(null);
  const [templateVariablesText, setTemplateVariablesText] = useState("");
  const [rangeStart, setRangeStart] = useState(0); const [rangeEnd, setRangeEnd] = useState(0); const [topK, setTopK] = useState(50); const [textLlmSampleLimit, setTextLlmSampleLimit] = useState(5);
  const [segmentMode, setSegmentMode] = useState<"uniform" | "beat" | "transient">("uniform"); const [segmentCountMode, setSegmentCountMode] = useState<"automatic" | "at_most" | "exact">("at_most"); const [segmentLimit, setSegmentLimit] = useState(15); const [segmentInterval, setSegmentInterval] = useState(5);
  const [textIndex, setTextIndex] = useState<"qwen3" | "embeddinggemma2">("qwen3");
  const [autoTopK, setAutoTopK] = useState(true);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [sources, setSources] = useState({ library: true, frozen: false, atoms: true, generated: true });
  const [scopes, setScopes] = useState({ sound: true, structure: true, metadata: false, provenance: false, administrative: false });
  const [domainLayers, setDomainLayers] = useState<string[]>(ACOUSTIC_DOMAIN_LAYERS.map((layer) => layer.id));
  const [vocalMatrixMode, setVocalMatrixMode] = useState(false); const [searchMode, setSearchMode] = useState<"single" | "transition">("single"); const [queryB, setQueryB] = useState(""); const [transitionRatio, setTransitionRatio] = useState(50);
  const [instructionSlots, setInstructionSlots] = useState<InstructionSlot[]>(DEFAULT_INSTRUCTION_SLOTS); const [crystals, setCrystals] = useState<Crystal[]>([]); const [crystalId, setCrystalId] = useState("");
  const [instructionContextOverride, setInstructionContextOverride] = useState<Array<{ id: string; title: string; content: string; influence: number }> | null>(null);
  const [legacyImportIssues, setLegacyImportIssues] = useState<Array<{ id: string; reason?: string }>>([]);
  const [workbenchHydrated, setWorkbenchHydrated] = useState(false);
  const [assetRestoreFailed, setAssetRestoreFailed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null); const [previewSignature, setPreviewSignature] = useState(""); const [run, setRun] = useState<Run | null>(null); const [history, setHistory] = useState<Array<Pick<Run, "id" | "title" | "status" | "scenarioId" | "lastErrorSummary"> & { createdAt: string }>>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [filter, setFilter] = useState("all"); const [historyScenario, setHistoryScenario] = useState("all"); const [historyQuery, setHistoryQuery] = useState(""); const [historyAfter, setHistoryAfter] = useState(""); const [historyBefore, setHistoryBefore] = useState(""); const [basedOnRunId, setBasedOnRunId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeRecoveryDialog, setNodeRecoveryDialog] = useState<{ kind: "reuse_saved_response" | "retry_failed_node"; nodeId: string } | null>(null);
  const [retryReason, setRetryReason] = useState("");
  const [audioSources, setAudioSources] = useState<AudioSource[]>([]);
  const [importSources, setImportSources] = useState<ImportSource[]>([]);
  const [importConfigured, setImportConfigured] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamProgress, setStreamProgress] = useState<Record<string, { current?: number; total?: number; phase?: string; source?: string; nodeId?: string; attempt?: number; retryLimit?: number; waitMs?: number; lastError?: string }>>({});
  const uppyRef = useRef<Uppy<Record<string, string>, Record<string, unknown>> | null>(null);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const currentScenario = scenarios.find((row) => row.id === scenarioId);
  const failedReverseCheckpoint = run?.stages.find((stage) => stage.actionId === "text_features.reverse_query" && stage.status === "failed")?.nodeCheckpoints?.map((item) => item.payload.data ?? {}).filter((data) => data.status === "failed").slice(-1)[0];
  const failedReverseNodeId = typeof failedReverseCheckpoint?.segmentId === "string" ? failedReverseCheckpoint.segmentId : null;
  const failedReverseAttempts = Number(failedReverseCheckpoint?.attemptsUsed ?? 0);
  const failedReverseCycleAttempts = Number(failedReverseCheckpoint?.cycleAttemptsUsed ?? failedReverseAttempts);
  const reverseRetryBudgetExhausted = Boolean(failedReverseNodeId && failedReverseCycleAttempts >= 4);
  const hasSavedReverseResponse = typeof (failedReverseCheckpoint?.lastErrorDetails as Record<string, unknown> | undefined)?.rawResponse === "string";
  const definition = currentScenario?.definition;
  const selectedParameters = useMemo<ActiveParameter[]>(() => run?.stages.flatMap((stage) => stage.artifacts.filter((artifact) => selectedArtifactIds.includes(artifact.id)).flatMap((artifact) => Array.isArray(artifact.payload.data) ? artifact.payload.data as ActiveParameter[] : [])) ?? [], [run, selectedArtifactIds]);
  const scenarioGroups = useMemo(() => {
    const groups: Record<"ready" | "setup" | "unavailable", Array<{ scenario: ScenarioRow; reason: string; preparation: string[] }>> = { ready: [], setup: [], unavailable: [] };
    for (const scenario of scenarios) {
      const stages = scenario.definition?.stages ?? [];
      const actionIds = stages.map((stage) => stage.actionId);
      const unavailable = !scenario.definition || stages.some((stage) => !stage.available);
      const preparation: string[] = [];
      if (actionIds.some((id) => id.startsWith("audio.") || id.startsWith("spec.")) && !audio) preparation.push(t("Saved audio asset required"));
      const needsText = actionIds.some((id) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.gemma.resolved", "stage2.server", "vocal_allocation.search"].includes(id));
      const hasBriefProducer = actionIds.some((id) => ["brief.from_crystal", "brief.from_template", "audio.describe.lfm3", "audio.transcribe.lfm3", "brief.combine_segment_texts"].includes(id));
      if (needsText && !brief.trim() && !hasBriefProducer) preparation.push(t("Brief or explicit preparation required"));
      if (actionIds.includes("brief.from_crystal") && !crystalId) preparation.push(t("Select a crystal"));
      if (actionIds.includes("brief.from_template") && !templateBrief.trim()) preparation.push(t("Enter a template Brief"));
      if (actionIds.includes("text_features.build") && !selectedParameters.length && !actionIds.some((id) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved"].includes(id))) preparation.push(t("Select parameter results or add a search stage"));
      if (actionIds.includes("stage2.client") && !actionIds.slice(0, actionIds.indexOf("stage2.client")).some((id) => ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved"].includes(id))) preparation.push(t("Add a compatible Stage-2 source"));
      const group = unavailable ? "unavailable" : preparation.length ? "setup" : "ready";
      const reason = unavailable ? (stages.find((stage) => !stage.available)?.unavailableReason ?? t("No supported route definition is available.")) : preparation.join(" · ");
      groups[group].push({ scenario, reason, preparation });
    }
    return groups;
  }, [scenarios, audio, brief, crystalId, templateBrief, selectedParameters, t]);
  const chosenActions = definition?.stages.map((stage) => stage.actionId) ?? draftStages.map((stage) => stage.actionId);
  const updateDraftStage = (index: number, update: (stage: AutomationStageDefinition) => AutomationStageDefinition) => setDraftStages((stages) => stages.map((stage, item) => item === index ? update(stage) : stage));
  const setDraftSource = (stageIndex: number, sourceId: string, checked: boolean) => updateDraftStage(stageIndex, (stage) => {
    const selected = stage.inputBindings.filter((binding) => binding.port !== "order" && binding.from.startsWith("stage:") && binding.from.slice(6) !== sourceId);
    const existing = stage.inputBindings.find((binding) => binding.port !== "order" && binding.from === `stage:${sourceId}`);
    const sources = [...selected, ...(checked ? [{ name: existing?.name ?? `source${selected.length + 1}`, from: `stage:${sourceId}`, port: "result" }] : [])];
    const named = sources.flatMap((binding, index) => {
      const sourceAction = draftStages.find((candidate) => candidate.stageId === binding.from.slice(6))?.actionId;
      if (stage.actionId === "text.gemma.resolved" && sourceAction === "text.gemma.awtd") return [{ ...binding, name: "identityBank" }, { ...binding, name: "identityBankB" }];
      const name = stage.actionId === "audio.describe_gaps.lfm3" ? (sourceAction === "audio.segment" ? "segmentPlan" : sourceAction === "text_features.describe_llm" ? "anchors" : binding.name)
        : stage.actionId === "stage2.client" ? `source${index + 1}`
        : stage.actionId === "stage2.server" ? "stage1"
          : stage.actionId === "text_features.build" ? `parameterBank${index + 1}`
          : ["text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query"].includes(stage.actionId) ? "snapshot"
      : ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved"].includes(stage.actionId) && ["audio.describe.lfm3", "audio.describe_gaps.lfm3", "audio.transcribe.lfm3", "text_features.reverse_query", "brief.combine_segment_texts"].includes(sourceAction ?? "") ? "brief"
                : ["text.gemma.resolved", "audio.gemma.resolved"].includes(stage.actionId) && sourceAction === "audio.gemma.awtd" ? "identityBank" : binding.name;
      return [{ ...binding, name }];
    });
    return { ...stage, inputBindings: [...stage.inputBindings.filter((binding) => binding.port === "order" || binding.from.startsWith("external:")), ...named] };
  });
  const buildDraftDefinition = (id: string, version: number, base?: AutomationScenarioDefinition): AutomationScenarioDefinition => {
    const stages = materializeDraftStages(draftStages, id);
    const requiredResults = stages.flatMap((stage) => stage.outputDefinitions.filter((output) => output.required).map((output) => output.kind));
    const optionalResults = stages.flatMap((stage) => stage.outputDefinitions.filter((output) => !output.required).map((output) => output.kind));
    const configuredStages = stages.map((stage) => stage.actionId === "text_features.reverse_query" || stage.actionId === "text_features.describe_llm" ? { ...stage, settings: { ...stage.settings, requested: { ...stage.settings.requested, textLlmSampleLimit }, effective: { ...stage.settings.effective, textLlmSampleLimit } } } : stage);
    return { ...(base ?? { acceptedInputs: ["empty", "brief_only", "audio_only", "audio_and_brief"], preparationPolicies: { audio: "existing-asset", brief: "existing-or-explicit" }, resultDestinations: ["automation-history", "tri-modal-stage"], goal: "user_chain", description: "User-configured Automation route." }), id, version, title: title.trim(), stages: configuredStages, defaultSettings: { ...(base?.defaultSettings ?? {}), topK, textLlmSampleLimit, briefAssembly: { sources: briefAssemblySources, executor: briefExecutor, model: briefExecutorModel, trackDraft: briefAssemblySources.trackDraft && trackDraftSessionId ? { sessionId: trackDraftSessionId, language: trackDraftLanguage } : undefined } }, requiredResults, optionalResults };
  };
  const hasAudio = chosenActions.some((id) => id.startsWith("audio.") || id.startsWith("spec.") || id === "vocal_allocation.search");
  const hasBrief = chosenActions.some((id) => id.startsWith("text.") || id === "stage2.server");
  const hasBriefAssemblyStage = chosenActions.includes("brief.combine_segment_texts") || draftStages.some((stage) => stage.actionId === "brief.combine_segment_texts");
  const hasTextLlmStages = chosenActions.some((id) => id === "text_features.reverse_query" || id === "text_features.describe_llm") || draftStages.some((stage) => stage.actionId === "text_features.reverse_query" || stage.actionId === "text_features.describe_llm");
  const canControl = Boolean(run && ACTIVE.has(run.status));

  useEffect(() => {
    const uppy = new Uppy<Record<string, string>, Record<string, unknown>>({
      id: "am-stage-automation-audio", autoProceed: false,
      restrictions: { maxNumberOfFiles: 1, maxFileSize: 150 * 1024 * 1024, allowedFileTypes: ["audio/*"] },
    }).use(XHRUpload, { endpoint: "/api/am-stage/automation/assets", method: "POST", formData: true, fieldName: "audio", bundle: false, allowedMetaFields: ["durationSeconds", "ownerType", "ownerId"] });
    uppyRef.current = uppy;
    uppy.on("upload-progress", (_file, progress) => setUploadProgress(progress.bytesTotal ? Math.min(100, Math.round(progress.bytesUploaded / progress.bytesTotal * 100)) : null));
    return () => { uppy.destroy(); uppyRef.current = null; };
  }, []);

  useEffect(() => {
    if (currentScenario?.origin !== "user" || !currentScenario.definition) return;
    setTitle(currentScenario.title);
    setDraftStages(currentScenario.definition.stages.map((stage) => structuredClone(stage)));
    if (basedOnRunId) return;
    const savedSettings = currentScenario.definition.defaultSettings as Record<string, unknown>;
    if (savedSettings.textLlmSampleLimit) setTextLlmSampleLimit(Number(savedSettings.textLlmSampleLimit));
    const assembly = savedSettings.briefAssembly as { sources?: typeof briefAssemblySources; executor?: typeof briefExecutor; model?: string; trackDraft?: { sessionId?: string; language?: "en" | "ru" } } | undefined;
    setBriefAssemblySources({ reverseQuery: true, interpretations: true, textFeatures: false, trackDraft: false, gapDescriptions: false, ...assembly?.sources });
    setBriefExecutor(assembly?.executor ?? "freellmapi");
    setBriefExecutorModel(assembly?.model ?? "");
    setTrackDraftSessionId(assembly?.trackDraft?.sessionId ?? "");
    setTrackDraftLanguage(assembly?.trackDraft?.language === "ru" ? "ru" : "en");
  }, [currentScenario?.id, currentScenario?.version, basedOnRunId]);

  const loadScenarios = useCallback(async () => {
    const result = await requestJson<{ scenarios: ScenarioRow[] }>("/api/am-stage/automation/scenarios");
    setScenarios(result.scenarios);
    if (!scenarioId && result.scenarios.length) setScenarioId(result.scenarios[0].id);
  }, [scenarioId]);
  const refreshHistory = useCallback(async () => {
    const parameters = new URLSearchParams({ limit: "100" });
    if (filter !== "all") parameters.set("status", filter); if (historyScenario !== "all") parameters.set("scenarioId", historyScenario);
    if (historyQuery.trim()) parameters.set("q", historyQuery.trim()); if (historyAfter) parameters.set("after", new Date(`${historyAfter}T00:00:00`).toISOString()); if (historyBefore) parameters.set("before", new Date(`${historyBefore}T23:59:59.999`).toISOString());
    const result = await requestJson<{ runs: typeof history }>(`/api/am-stage/automation/runs?${parameters}`);
    setHistory(result.runs);
  }, [filter, historyScenario, historyQuery, historyAfter, historyBefore]);
  const refreshRun = useCallback(async (id: string) => { const result = await requestJson<{ run: Run }>(`/api/am-stage/automation/runs/${id}`); setRun(result.run); setHistory((current) => current.map((item) => item.id === id ? { ...item, status: result.run.status, lastErrorSummary: result.run.lastErrorSummary } : item)); window.dispatchEvent(new Event("automation:changed")); return result.run; }, []);
  const syncRunUrl = useCallback((id?: string) => {
    const href = id ? `/automation?run=${encodeURIComponent(id)}` : "/automation";
    window.history.replaceState(null, "", href);
  }, []);
  const openRun = useCallback(async (id: string) => { await refreshRun(id); syncRunUrl(id); }, [refreshRun, syncRunUrl]);
  useEffect(() => { void loadScenarios().catch((cause) => setError(cause.message)); }, [loadScenarios]);
  useEffect(() => { void requestJson<{ sessions: StageSessionSummary[] }>("/api/am-stage/sessions").then((result) => setStageSessions(result.sessions)).catch(() => setStageSessions([])); }, []);
  useEffect(() => {
    if (!trackDraftSessionId) { setTrackDraft(null); return; }
    if (restoredTrackDraftRef.current?.sessionId === trackDraftSessionId && restoredTrackDraftRef.current.language === trackDraftLanguage) {
      setTrackDraft(restoredTrackDraftRef.current);
      restoredTrackDraftRef.current = null;
      return;
    }
    let cancelled = false;
    void requestJson<{ snapshot: { meta: { updated_at: string }; data?: { param_to_text?: { snapshot?: { natural_descriptions?: { en?: string; ru?: string } } | null } } } }>(`/api/am-stage/sessions/${encodeURIComponent(trackDraftSessionId)}`)
      .then(({ snapshot }) => { const description = snapshot.data?.param_to_text?.snapshot?.natural_descriptions; const text = description?.[trackDraftLanguage]?.trim(); if (!cancelled) setTrackDraft(text ? { sessionId: trackDraftSessionId, language: trackDraftLanguage, text, snapshotUpdatedAt: snapshot.meta.updated_at } : null); })
      .catch(() => { if (!cancelled) setTrackDraft(null); });
    return () => { cancelled = true; };
  }, [trackDraftSessionId, trackDraftLanguage]);
  useEffect(() => { void refreshHistory().catch((cause) => setError(cause.message)); }, [refreshHistory]);
  useEffect(() => { const runId = new URLSearchParams(window.location.search).get("run"); if (runId) void refreshRun(runId).catch((cause) => setError(cause.message)); }, [refreshRun]);
  const activeRunId = run?.id;
  useEffect(() => {
    if (!activeRunId) { setStreamConnected(false); return; }
    const runId = activeRunId;
    const savedCursor = Number(sessionStorage.getItem(`am-automation-last-sequence:${runId}`) ?? 0);
    const visibleCursor = run?.id === runId ? Math.max(0, ...run.events.map((event) => event.sequence)) : 0;
    let cursor = Math.max(Number.isSafeInteger(savedCursor) ? savedCursor : 0, visibleCursor);
    let refreshTimer: number | undefined;
    const source = new EventSource(`/api/am-stage/automation/runs/${encodeURIComponent(runId)}/events?after=${cursor}`);
    const scheduleRunRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => { void refreshRun(runId).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))); }, 180);
    };
    const onSnapshot = (message: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(message.data) as { cursor: number; run: Run };
        if (snapshot.run.id !== runId) return;
        cursor = snapshot.cursor;
        sessionStorage.setItem(`am-automation-last-sequence:${runId}`, String(cursor));
        setRun(snapshot.run); setStreamProgress({});
      } catch { setError(tRef.current("Could not restore the Automation event snapshot.")); }
    };
    const onAutomationEvent = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as Run["events"][number];
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor) return;
        cursor = event.sequence;
        sessionStorage.setItem(`am-automation-last-sequence:${runId}`, String(cursor));
        setRun((current) => current?.id === runId ? { ...current, events: [...current.events.filter((item) => item.sequence !== event.sequence), event].sort((a, b) => a.sequence - b.sequence) } : current);
        if (event.type === "stage.progress" && event.stageId) setStreamProgress((current) => ({ ...current, [event.stageId!]: (event.payload ?? {}) as { current?: number; total?: number; phase?: string; source?: string; nodeId?: string; attempt?: number; retryLimit?: number; waitMs?: number; lastError?: string } }));
        else scheduleRunRefresh();
        if (["run.finished", "run.failed", "run.stopped", "run.interrupted"].includes(event.type)) void refreshHistory().catch(() => undefined);
      } catch { setError(tRef.current("An Automation event could not be read.")); }
    };
    const onTerminal = () => { source.close(); setStreamConnected(false); setStreamProgress({}); scheduleRunRefresh(); };
    source.addEventListener("snapshot", onSnapshot as EventListener);
    source.addEventListener("automation", onAutomationEvent as EventListener);
    source.addEventListener("terminal", onTerminal as EventListener);
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    return () => { source.close(); setStreamConnected(false); if (refreshTimer !== undefined) window.clearTimeout(refreshTimer); };
  }, [activeRunId, refreshHistory, refreshRun, run?.id]);
  useEffect(() => {
    const raw = sessionStorage.getItem("am-automation-workbench-inputs");
    if (!raw) return;
    try {
      const item = JSON.parse(raw) as { assetId?: string; audioName?: string; durationSeconds?: number; rangeStart?: number; rangeEnd?: number; brief?: string; textIndex?: "qwen3" | "embeddinggemma2"; topK?: number; sources?: typeof sources; scopes?: typeof scopes; domainLayers?: string[]; vocalMatrixMode?: boolean; searchMode?: "single" | "transition"; queryB?: string; transitionRatio?: number; instructionContext?: Array<{ id: string; title: string; content: string; influence: number }> };
      if (item.brief !== undefined) setBrief(item.brief); if (item.textIndex) setTextIndex(item.textIndex); if (typeof item.topK === "number") setTopK(item.topK); if (item.sources) setSources(item.sources); if (item.scopes) setScopes(item.scopes); if (item.domainLayers) setDomainLayers(item.domainLayers); if (typeof item.vocalMatrixMode === "boolean") setVocalMatrixMode(item.vocalMatrixMode); if (item.searchMode) setSearchMode(item.searchMode); if (item.queryB) setQueryB(item.queryB); if (typeof item.transitionRatio === "number") setTransitionRatio(item.transitionRatio); if (item.instructionContext) { setInstructionContextOverride(null); setInstructionSlots((slots) => slots.map((slot, index) => { const incoming = item.instructionContext?.find((entry) => entry.id === slot.id) ?? item.instructionContext?.[index]; return incoming ? { ...slot, title: incoming.title, content: incoming.content, influence: incoming.influence, enabled: true } : { ...slot, enabled: false }; })); }
      const restore = (meta?: Audio) => { if (meta) { setAudio(meta); setAssetRestoreFailed(false); } else setAudio(null); const length = item.durationSeconds || meta?.durationSeconds || 0; setDuration(length); setRangeStart(item.rangeStart ?? 0); setRangeEnd(item.rangeEnd || length); if (meta) setNotice(`${t("Work Axis inputs restored")}: ${meta.filename ?? item.audioName ?? "audio"}.`); sessionStorage.removeItem("am-automation-workbench-inputs"); setWorkbenchHydrated(true); };
      if (item.assetId) void requestJson<{ asset: Audio }>(`/api/am-stage/automation/assets/${encodeURIComponent(item.assetId)}?meta=1`).then(({ asset: meta }) => restore(meta)).catch((cause) => { setAssetRestoreFailed(true); setError(cause.message); setWorkbenchHydrated(true); }); else restore();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); sessionStorage.removeItem("am-automation-workbench-inputs"); setWorkbenchHydrated(true); }
  }, [t]);

  useEffect(() => {
    const hasHandoff = Boolean(sessionStorage.getItem("am-automation-workbench-inputs"));
    const saved = useRagV3Store.getState();
    if (!hasHandoff) { setTextIndex(saved.textIndex); setSources(saved.sources); setScopes(saved.scopes); setInstructionSlots(saved.instructionSlots); setVocalMatrixMode(saved.vocalMatrixMode); }
    void requestJson<{ items: Crystal[] }>("/api/crystals?page=1&pageSize=50").then((result) => setCrystals(result.items ?? [])).catch(() => setCrystals([]));
    try {
      const raw = localStorage.getItem("am-automation-workbench-v1");
      if (hasHandoff) return;
      if (!raw) { setWorkbenchHydrated(true); return; }
      const value = JSON.parse(raw) as { assetId?: string; brief?: string; templateBrief?: string; templateVariablesText?: string; rangeStart?: number; rangeEnd?: number; duration?: number; segmentMode?: "uniform" | "beat" | "transient"; segmentCountMode?: "automatic" | "at_most" | "exact"; segmentLimit?: number; segmentInterval?: number; domainLayers?: string[]; searchMode?: "single" | "transition"; queryB?: string; transitionRatio?: number };
      setBrief(value.brief ?? ""); setTemplateBrief(value.templateBrief ?? ""); setTemplateVariablesText(value.templateVariablesText ?? ""); setRangeStart(value.rangeStart ?? 0); setRangeEnd(value.rangeEnd ?? 0); setDuration(value.duration ?? 0);
      if (value.segmentMode) setSegmentMode(value.segmentMode); if (value.segmentCountMode) setSegmentCountMode(value.segmentCountMode); if (value.segmentLimit) setSegmentLimit(value.segmentLimit); if (value.segmentInterval) setSegmentInterval(value.segmentInterval);
      if (value.domainLayers) setDomainLayers(value.domainLayers); if (value.searchMode) setSearchMode(value.searchMode); setQueryB(value.queryB ?? ""); setTransitionRatio(value.transitionRatio ?? 50);
      if (value.assetId) void requestJson<{ asset: Audio }>(`/api/am-stage/automation/assets/${encodeURIComponent(value.assetId)}?meta=1`).then(({ asset: meta }) => { setAudio(meta); setAssetRestoreFailed(false); setDuration(value.duration || meta.durationSeconds || 0); setWorkbenchHydrated(true); }).catch((cause) => { setAssetRestoreFailed(true); setError(cause.message); setWorkbenchHydrated(true); }); else setWorkbenchHydrated(true);
    } catch { localStorage.removeItem("am-automation-workbench-v1"); setWorkbenchHydrated(true); }
  }, []);

  useEffect(() => {
    if (!workbenchHydrated) return;
    try { const prior = JSON.parse(localStorage.getItem("am-automation-workbench-v1") ?? "{}") as { assetId?: string }; localStorage.setItem("am-automation-workbench-v1", JSON.stringify({ assetId: audio?.id ?? (assetRestoreFailed ? prior.assetId : undefined), brief, templateBrief, templateVariablesText, rangeStart, rangeEnd, duration, segmentMode, segmentCountMode, segmentLimit, segmentInterval, domainLayers, searchMode, queryB, transitionRatio })); } catch { /* persistent audio remains on the server; local snapshot is optional */ }
  }, [workbenchHydrated, audio?.id, assetRestoreFailed, brief, templateBrief, templateVariablesText, rangeStart, rangeEnd, duration, segmentMode, segmentCountMode, segmentLimit, segmentInterval, domainLayers, searchMode, queryB, transitionRatio]);

  const refreshAudioSources = useCallback(async () => {
    const [saved, imports] = await Promise.all([
      requestJson<{ assets: AudioSource[] }>("/api/am-stage/automation/assets"),
      requestJson<{ configured: boolean; files: ImportSource[] }>("/api/am-stage/automation/audio-import"),
    ]);
    setAudioSources(saved.assets);
    setImportConfigured(imports.configured);
    setImportSources(imports.files);
  }, []);
  useEffect(() => { void refreshAudioSources().catch((cause) => setError(cause.message)); }, [refreshAudioSources]);

  const uploadThroughUppy = async (file: File, seconds: number) => {
    const uppy = uppyRef.current;
    if (!uppy) throw new Error(t("The audio uploader is still starting. Try again."));
    const extension = file.name.split(".").pop()?.toLowerCase();
    const inferredMime = extension === "mp3" ? "audio/mpeg" : extension === "m4a" ? "audio/mp4" : extension === "wav" ? "audio/wav" : extension === "flac" ? "audio/flac" : extension === "ogg" || extension === "opus" ? "audio/ogg" : "audio/aac";
    const fileId = uppy.addFile({ name: file.name, type: file.type || inferredMime, data: file });
    uppy.setFileMeta(fileId, { durationSeconds: String(seconds), ownerType: "automation-workbench", ownerId: "current" });
    setUploadProgress(0);
    try {
      const result = await uppy.upload();
      const uploaded = result?.successful?.find((item) => item.id === fileId);
      const body = uploaded?.response?.body as { asset?: Audio } | undefined;
      if (!uploaded || !body?.asset) throw new Error(result?.failed?.find((item) => item.id === fileId)?.error ?? t("The audio server did not return an asset."));
      return body.asset;
    } finally {
      uppy.removeFile(fileId);
      setUploadProgress(null);
    }
  };

  const measureAssetDuration = (assetId: string) => new Promise<number>((resolve) => {
    const player = new window.Audio(); player.preload = "metadata";
    const finish = (durationSeconds: number) => { player.removeAttribute("src"); player.load(); resolve(Number.isFinite(durationSeconds) ? durationSeconds : 0); };
    player.onloadedmetadata = () => finish(player.duration);
    player.onerror = () => finish(0);
    player.src = `/api/am-stage/automation/assets/${encodeURIComponent(assetId)}`;
  });

  const selectSavedAudio = async (assetId: string) => {
    setBusy(true); setError("");
    try {
      const { asset: metadata } = await requestJson<{ asset: Audio }>(`/api/am-stage/automation/assets/${encodeURIComponent(assetId)}?meta=1`);
      const detectedDuration = metadata.durationSeconds ?? await measureAssetDuration(assetId);
      const { asset: selected } = await requestJson<{ asset: Audio }>(`/api/am-stage/automation/assets/${encodeURIComponent(assetId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSeconds: detectedDuration }) });
      if (audio && audio.id !== selected.id) await requestJson(`/api/am-stage/automation/assets/${encodeURIComponent(audio.id)}`, { method: "DELETE" });
      setAudio(selected); setDuration(selected.durationSeconds ?? 0); setRangeStart(0); setRangeEnd(selected.durationSeconds ?? 0); setPreview(null);
      setNotice(`${t("Saved audio selected")}: ${selected.filename ?? "audio"}. ${t("Brief and prior runs are preserved.")}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const importAudio = async (name: string) => {
    setBusy(true); setError("");
    try {
      const { asset: importedAsset } = await requestJson<{ asset: Audio }>("/api/am-stage/automation/audio-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const detectedDuration = importedAsset.durationSeconds ?? await measureAssetDuration(importedAsset.id);
      const { asset: imported } = await requestJson<{ asset: Audio }>(`/api/am-stage/automation/assets/${encodeURIComponent(importedAsset.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSeconds: detectedDuration }) });
      if (audio && audio.id !== imported.id) await requestJson(`/api/am-stage/automation/assets/${encodeURIComponent(audio.id)}`, { method: "DELETE" });
      setAudio(imported); setDuration(imported.durationSeconds ?? 0); setRangeStart(0); setRangeEnd(imported.durationSeconds ?? 0); setPreview(null);
      setNotice(`${t("Audio imported")}: ${imported.filename ?? name} · ${imported.sizeBytes.toLocaleString()} bytes. ${t("Source file was left unchanged.")}`);
      await refreshAudioSources();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const selectedInputs = useMemo(() => ({
    ...(audio ? { assetId: audio.id, audioName: audio.filename ?? "audio", audioDurationSeconds: duration, audioRange: { assetId: audio.id, startSeconds: rangeStart, endSeconds: rangeEnd || duration, durationSeconds: Math.max(0, (rangeEnd || duration) - rangeStart) } } : {}),
    ...(brief.trim() ? { brief: brief.trim(), briefSource: "manual" as const } : {}),
    ...(selectedArtifactIds.length ? { selectedArtifactIds } : {}),
    briefAssembly: { sources: briefAssemblySources, executor: briefExecutor, ...(briefExecutorModel.trim() ? { model: briefExecutorModel.trim() } : {}), ...(trackDraft ? { trackDraft } : {}) },
    workspaceSnapshot: { textIndex, topK, autoTopK, sources, scopes, domainLayers, vocalMatrixMode, searchMode, queryB, transitionRatio, templateBrief, templateVariablesText, instructionContext: instructionContextOverride ?? toInstructionContext(instructionSlots), parameters: selectedParameters },
  }), [audio, brief, duration, rangeEnd, rangeStart, topK, autoTopK, textIndex, sources, scopes, domainLayers, vocalMatrixMode, searchMode, queryB, transitionRatio, templateBrief, templateVariablesText, instructionSlots, instructionContextOverride, selectedArtifactIds, selectedParameters, briefAssemblySources, briefExecutor, briefExecutorModel, trackDraft]);
  const scenarioLocksSegmentation = currentScenario?.definition?.preparationPolicies.segmentPlan && typeof currentScenario.definition.preparationPolicies.segmentPlan === "object" && (currentScenario.definition.preparationPolicies.segmentPlan as { locked?: unknown }).locked === true;
  const planOverrides = { topK, textLlmSampleLimit, ...(currentScenario?.origin === "user" || scenarioLocksSegmentation ? {} : { segment: { boundaryMode: segmentMode, countMode: segmentCountMode, requestedCount: segmentLimit, maximumCount: segmentLimit, intervalSeconds: segmentInterval } }) };
  const planInputs = { ...selectedInputs, crystalId };
  const requestSignature = JSON.stringify({ scenarioId, scenarioVersion: currentScenario?.version, inputs: planInputs, overrides: planOverrides });
  const sampledNodePreview = useMemo(() => {
    const total = preview?.estimates.segmentCount;
    if (!total || !hasTextLlmStages) return null;
    const span = (rangeEnd || duration) - rangeStart;
    const estimated = Array.from({ length: total }, (_, index) => ({ id: `segment-${index + 1}`, startSeconds: rangeStart + span * index / total, endSeconds: rangeStart + span * (index + 1) / total }));
    const selection = selectTextLlmSegments(estimated, textLlmSampleLimit);
    return { total, selected: selection.selected.map((item, index) => ({ number: selection.selectedIndexes[index] + 1, startSeconds: item.startSeconds, endSeconds: item.endSeconds })) };
  }, [preview?.estimates.segmentCount, hasTextLlmStages, rangeEnd, duration, rangeStart, textLlmSampleLimit]);

  const loadTestPreset = useCallback(async () => {
    setError(""); setNotice(t("Loading test audio…"));
    try {
      const response = await fetch("/test-fixtures/SPEZ.mp3"); if (!response.ok) throw new Error(`Test preset returned HTTP ${response.status}.`);
      const blob = await response.blob(); const file = new File([blob], "SPEZ.mp3", { type: "audio/mpeg" });
      const metadataUrl = URL.createObjectURL(file);
      let seconds = 0;
      try { seconds = await new Promise<number>((resolve, reject) => { const element = new Audio(); element.preload = "metadata"; element.onloadedmetadata = () => resolve(element.duration); element.onerror = () => reject(new Error("Test audio metadata could not be read.")); element.src = metadataUrl; }); } finally { URL.revokeObjectURL(metadataUrl); }
      const form = new FormData(); form.set("audio", file); form.set("durationSeconds", String(seconds)); form.set("ownerType", "automation-workbench"); form.set("ownerId", "current");
      const saved = await requestJson<{ asset: Audio }>("/api/am-stage/automation/assets", { method: "POST", body: form });
      if (audio && audio.id !== saved.asset.id) await requestJson(`/api/am-stage/automation/assets/${encodeURIComponent(audio.id)}`, { method: "DELETE" });
      setAssetRestoreFailed(false); setAudio(saved.asset); setDuration(seconds); setRangeStart(0); setRangeEnd(seconds); setBrief("Паттерн фрактального литургического хора. Темный ритуал. Плавление в адском котле"); setNotice(`${t("Test audio loaded")}: ${saved.asset.filename} · ${seconds.toFixed(1)} s. ${t("No model has been started.")}`); await refreshAudioSources();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setNotice(""); }
  }, [t, audio, refreshAudioSources]);

  const uploadAudio = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const url = URL.createObjectURL(file); let seconds = 0;
      try { seconds = await new Promise<number>((resolve, reject) => { const element = new Audio(); element.preload = "metadata"; element.onloadedmetadata = () => resolve(element.duration); element.onerror = () => reject(new Error("Audio metadata could not be read.")); element.src = url; }); } finally { URL.revokeObjectURL(url); }
      const saved = await uploadThroughUppy(file, seconds);
      if (audio && audio.id !== saved.id) await requestJson(`/api/am-stage/automation/assets/${encodeURIComponent(audio.id)}`, { method: "DELETE" });
      setAssetRestoreFailed(false); setAudio(saved); setDuration(seconds); setRangeStart(0); setRangeEnd(seconds); setPreview(null); setNotice(`${t("Audio asset saved")}: ${saved.filename ?? file.name}. ${t("Brief and prior runs are preserved.")}`);
      await refreshAudioSources();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };

  const removeAudioFromWorkbench = async () => {
    if (audio) await requestJson(`/api/am-stage/automation/assets/${encodeURIComponent(audio.id)}`, { method: "DELETE" });
    setAssetRestoreFailed(false); setAudio(null); setDuration(0); setRangeStart(0); setRangeEnd(0); setPreview(null); setNotice(t("Audio detached from this workbench. Prior runs and Brief are preserved."));
  };

  const chooseCrystal = (id: string) => {
    setCrystalId(id);
    const crystal = crystals.find((item) => item.id === id);
    if (crystal) { setBrief(crystal.combination); setScenarioId("crystal-to-text"); setBasedOnRunId(null); setPreview(null); }
  };

  const saveCustomScenario = async () => {
    if (!title.trim() || !draftStages.length) { setError(t("Enter a chain name and at least one step.")); return; }
    setBusy(true); setError("");
    try {
      const id = `user-${crypto.randomUUID()}`;
      const scenario = buildDraftDefinition(id, 1);
      await requestJson("/api/am-stage/automation/scenarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: { id, title: title.trim(), definition: scenario } }) });
      setTitle(""); await loadScenarios(); setScenarioId(id); setNotice(t("Saved as a new immutable scenario version."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };

  const updateCustomScenario = async () => {
    if (!currentScenario || currentScenario.origin !== "user" || !currentScenario.definition) return;
    if (!title.trim() || !draftStages.length) { setError(t("Enter a chain name and at least one step.")); return; }
    setBusy(true); setError("");
    try {
      const id = currentScenario.id;
      const definition = buildDraftDefinition(id, currentScenario.version + 1, currentScenario.definition);
      await requestJson(`/api/am-stage/automation/scenarios/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: currentScenario.version, definition, title: title.trim() }) });
      await loadScenarios(); setScenarioId(id); setNotice(t("Saved as a new immutable scenario version."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };

  const archiveCustomScenario = async () => {
    if (!currentScenario || currentScenario.origin !== "user" || !window.confirm(`${t("Archive scenario")}: ${currentScenario.title}?`)) return;
    setBusy(true); setError("");
    try { await requestJson(`/api/am-stage/automation/scenarios/${encodeURIComponent(currentScenario.id)}`, { method: "DELETE" }); await loadScenarios(); setScenarioId(AUTOMATION_ACTION_IDS.length ? "brief-to-parameters" : ""); setNotice(t("Scenario archived.")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };

  const copyScenarioToEditor = () => {
    if (!currentScenario?.definition) return;
    setTitle(`${currentScenario.title} (copy)`); setDraftStages(currentScenario.definition.stages.map((stage) => structuredClone(stage)));
    setNotice(t("Copied route to the user-chain editor. Save it as a new user scenario to edit it."));
  };

  const importLegacy = async () => {
    setBusy(true); setError("");
    try { const saved = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as unknown[]; const result = await requestJson<{ results: Array<{ id: string; status: string; reason?: string }> }>("/api/am-stage/automation/scenarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importLegacy: saved }) }); const issues = result.results.filter((item) => item.status === "incompatible"); setLegacyImportIssues(issues); setNotice(`${t("Legacy chains checked")}: ${result.results.filter((item) => item.status === "imported").length} ${t("imported")}, ${result.results.filter((item) => item.status === "exists").length} ${t("already present")}, ${issues.length} ${t("incompatible; source storage was preserved")}.`); await loadScenarios(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };

  const makePreview = async () => {
    if (!scenarioId) return; setBusy(true); setError("");
    try { const result = await requestJson<Preview>("/api/am-stage/automation/plans/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarioId, inputs: planInputs, overrides: planOverrides }) }); setPreview(result); setPreviewSignature(requestSignature); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const start = async () => {
    if (!scenarioId) return; if (previewSignature !== requestSignature || preview?.blockers.length) { setError(t("Inputs or settings changed; preview readiness again before starting.")); return; } setBusy(true); setError("");
    try { const result = await requestJson<{ run: Run }>("/api/am-stage/automation/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID(), scenarioId, inputs: planInputs, overrides: planOverrides, title: currentScenario?.title, ...(basedOnRunId ? { parentRunId: basedOnRunId } : {}) }) }); setRun(result.run); setBasedOnRunId(null); syncRunUrl(result.run.id); window.dispatchEvent(new Event("automation:changed")); await refreshHistory(); window.setTimeout(() => void refreshRun(result.run.id), 700); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const stop = async () => { if (!run) return; setBusy(true); try { const result = await requestJson<{ run: Run }>(`/api/am-stage/automation/runs/${run.id}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID() }) }); setRun(result.run); window.dispatchEvent(new Event("automation:changed")); window.setTimeout(() => void refreshRun(run.id), 500); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  const continueRun = async () => { if (!run) return; setBusy(true); setError(""); try { const result = await requestJson<{ run: Run }>(`/api/am-stage/automation/runs/${run.id}/continue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID() }) }); setRun(result.run); window.dispatchEvent(new Event("automation:changed")); await refreshHistory(); window.setTimeout(() => void refreshRun(run.id), 700); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  const runNodeRecovery = async () => {
    if (!run || !nodeRecoveryDialog) return;
    setBusy(true); setError("");
    try {
      const nodeAction = nodeRecoveryDialog.kind === "retry_failed_node"
        ? { ...nodeRecoveryDialog, reason: retryReason.trim() }
        : nodeRecoveryDialog;
      const result = await requestJson<{ run: Run }>(`/api/am-stage/automation/runs/${run.id}/continue`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandId: crypto.randomUUID(), nodeAction }),
      });
      setRun(result.run); setNodeRecoveryDialog(null); setRetryReason("");
      window.dispatchEvent(new Event("automation:changed")); await refreshHistory();
      window.setTimeout(() => void refreshRun(run.id), 700);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const exportRun = async () => { if (!run) return; try { const response = await fetch(`/api/am-stage/automation/runs/${encodeURIComponent(run.id)}/export`); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `automation-${run.id}.bundle.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  const exportArtifact = (artifact: Run["stages"][number]["artifacts"][number], format: "json" | "txt") => { const value = artifact.payload.data; const content = format === "json" || !Array.isArray(value) ? JSON.stringify(value, null, 2) : value.map((item) => { const row = item as { technical_name?: string; current_value?: unknown; suggested_value?: unknown; default?: unknown }; return `${row.technical_name ?? "item"}: ${JSON.stringify(row.current_value ?? row.suggested_value ?? row.default ?? null)}`; }).join("\n"); const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${artifact.bankId ?? artifact.kind}-${artifact.id}.${format}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const newFromRun = async () => {
    if (!run) return;
    const external = run.plan?.externalInputs;
    const scenario = run.plan?.scenarioRef.id ?? run.scenarioId;
    if (!scenario) return;
    syncRunUrl(); setScenarioId(scenario); setBrief(external?.brief ?? ""); setTopK(run.plan?.budgetPolicies?.topK ?? 50); setPreview(null); setRun(null); setBasedOnRunId(run.id);
    const assembly = external?.briefAssembly;
    if (assembly) {
      setBriefAssemblySources({ reverseQuery: assembly.sources.reverseQuery, interpretations: assembly.sources.interpretations, textFeatures: assembly.sources.textFeatures, trackDraft: assembly.sources.trackDraft, gapDescriptions: assembly.sources.gapDescriptions ?? false }); setBriefExecutor(assembly.executor); setBriefExecutorModel(assembly.model ?? "");
      setTrackDraftSessionId(assembly.trackDraft?.sessionId ?? ""); setTrackDraftLanguage(assembly.trackDraft?.language ?? "en");
      restoredTrackDraftRef.current = assembly.trackDraft ?? null;
      setTrackDraft(assembly.trackDraft ?? null);
    } else {
      setBriefAssemblySources({ reverseQuery: true, interpretations: true, textFeatures: false, trackDraft: false, gapDescriptions: false }); setBriefExecutor("freellmapi"); setBriefExecutorModel("");
      setTrackDraftSessionId(""); setTrackDraftLanguage("en"); setTrackDraft(null); restoredTrackDraftRef.current = null;
    }
    if (external?.assetId) { try { const { asset: meta } = await requestJson<{ asset: Audio }>(`/api/am-stage/automation/assets/${encodeURIComponent(external.assetId)}?meta=1`); setAudio(meta); const length = external.audioDurationSeconds ?? meta.durationSeconds ?? 0; setDuration(length); setRangeStart(external.audioRange?.startSeconds ?? 0); setRangeEnd(external.audioRange?.endSeconds ?? length); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } } else { setAudio(null); setDuration(0); setRangeStart(0); setRangeEnd(0); }
    setNotice(t("New run prepared from saved inputs. Review the route and start when ready."));
  };
  const deleteRun = async () => { if (!run) return; setBusy(true); setError(""); try { await requestJson(`/api/am-stage/automation/runs/${encodeURIComponent(run.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID() }) }); setDeleteDialogOpen(false); setRun(null); setPreview(null); syncRunUrl(); setNotice(t("Run deleted. Shared audio assets were kept.")); window.dispatchEvent(new Event("automation:changed")); await refreshHistory(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  const stageToStage = (stage: Run["stages"][number]) => { const mapping: Record<string, string> = { "text.qwen.resolved": "text.qwen.resolved", "text.gemma.awtd": "text.gemma.awtd", "text.gemma.resolved": "text.gemma.resolved", "audio.clap.resolved": "audio.clap.resolved", "spec.siglip.resolved": "spec.siglip.resolved", "audio.gemma.awtd": "audio.gemma.awtd", "audio.gemma.resolved": "audio.gemma.resolved", "stage2.server": "stage2.server" }; const artifact = stage.artifacts[0]; if (!artifact || !mapping[stage.actionId]) return; const parameters = extractStageBankParameters(artifact.payload.data); if (!parameters.length) return; const imported = { runId: run?.id, stageId: stage.stageId, actionId: mapping[stage.actionId], parameters }; sessionStorage.setItem("am-stage-automation-import", JSON.stringify(imported)); router.push(`/am-stage?automationRun=${encodeURIComponent(run?.id ?? "")}&stage=${encodeURIComponent(stage.stageId)}&automationApply=1`); };

  const viewInStage = (stage: Run["stages"][number]) => { if (!run) return; router.push(`/am-stage?automationRun=${encodeURIComponent(run.id)}&stage=${encodeURIComponent(stage.stageId)}&automationView=1`); };

  return <div className="min-h-screen p-3 sm:p-5 space-y-4" data-automation-page>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"><div><h1 className="text-lg font-semibold">{t("Automation")}</h1><p className="text-xs text-muted-foreground">{t("Reuse AM-Stage searches, model providers and saved audio assets in durable, inspectable runs.")}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void importLegacy()} disabled={busy}>{t("Import saved chains")}</Button><Button size="sm" variant="outline" onClick={() => void loadTestPreset()} disabled={busy}>{t("Test preset")}</Button><Button size="sm" variant="outline" onClick={() => void refreshHistory()}>{t("Refresh history")}</Button></div></header>
    {legacyImportIssues.length > 0 && <details className="rounded border border-amber-500/40 p-2 text-xs"><summary className="cursor-pointer">{t("Legacy chains that need review")} · {legacyImportIssues.length}</summary><ul className="mt-2 list-disc space-y-1 pl-5">{legacyImportIssues.map((item) => <li key={item.id}><strong>{item.id}</strong>{item.reason ? ` · ${item.reason}` : ""}</li>)}</ul></details>}
    {error && <div role="alert" className="rounded border border-red-500/40 bg-red-950/20 p-2 text-sm text-red-300">{error}</div>}{notice && <div role="status" className="rounded border border-emerald-500/30 p-2 text-sm text-emerald-300">{notice}</div>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
      <section className="space-y-3 rounded-md border border-border bg-card/60 p-3">
        <h2 className="text-sm font-semibold">{t("Workbench")}</h2>
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={autoTopK} onChange={(event) => setAutoTopK(event.target.checked)} /> {t("Automatically allocate Top-K to the action and request budget")}</label>
        <label className="block text-xs text-muted-foreground">{t("Scenario / chain")}<select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" value={scenarioId} onChange={(e) => { setScenarioId(e.target.value); setBasedOnRunId(null); setPreview(null); }}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}{item.origin === "user" ? ` · ${t("Custom")}` : ""}</option>)}</select></label>
          {currentScenario && <div className="rounded border border-border/70 p-2 text-xs"><div className="font-medium">{currentScenario.description}</div><div className="mt-1 text-muted-foreground">{t("Version")} {currentScenario.version} · {currentScenario.origin}</div>{definition?.stages.length === 0 && <p className="mt-1 text-amber-300">{t("This preset is preserved but unavailable in the current runner.")}</p>}</div>}
          <details className="rounded border border-border/70 p-2"><summary className="cursor-pointer text-xs font-medium">{t("Route catalog")} · {scenarios.length}</summary><div className="mt-2 space-y-2">{(["ready", "setup", "unavailable"] as const).map((group) => <section key={group} className="space-y-1"><h3 className="text-[11px] font-semibold uppercase text-muted-foreground">{t(group === "ready" ? "Ready" : group === "setup" ? "Needs setup" : "Unavailable")} · {scenarioGroups[group].length}</h3>{scenarioGroups[group].map(({ scenario, reason }) => { const preparationStages = scenario.definition?.stages.filter((stage) => ["brief.from_crystal", "brief.from_template", "audio.segment"].includes(stage.actionId)).map((stage) => stage.title) ?? []; return <article key={scenario.id} className="flex flex-col gap-1 rounded border border-border/60 p-2 text-[11px] sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="font-medium">{scenario.title}</div><div className="text-muted-foreground">{t("Goal")}: {scenario.definition?.goal ?? "—"} · {scenario.definition?.stages.length ?? 0} {t("stages")}</div><div className="text-muted-foreground">{t("Outputs")}: {[...new Set(scenario.definition?.stages.flatMap((stage) => stage.outputDefinitions.map((output) => output.kind)) ?? [])].join(", ") || "—"}</div>{preparationStages.length > 0 && <div className="text-muted-foreground">{t("Preparation stages")}: {preparationStages.join(", ")}</div>}{reason && <div className={group === "unavailable" ? "text-red-300" : "text-amber-300"}>{t("Setup needed")}: {reason}</div>}</div><Button size="sm" variant={scenario.id === scenarioId ? "default" : "outline"} disabled={group === "unavailable"} onClick={() => { setScenarioId(scenario.id); setBasedOnRunId(null); setPreview(null); }}>{t("Choose")}</Button></article>; })}</section>)}</div></details>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">{t("Brief / query")}<Textarea className="mt-1 min-h-20" value={brief} onChange={(e) => { setBrief(e.target.value); setPreview(null); }} placeholder={t("Enter a Brief, or choose an explicit preparation source below.")} /></label>
          <div className="space-y-2 rounded border border-border/70 p-2"><div className="text-xs font-medium">{t("Session audio")}</div><div className="text-xs text-muted-foreground">{audio ? `${audio.filename} · ${duration.toFixed(1)} s · ${Math.ceil(audio.sizeBytes / 1024)} KB` : t("No saved audio asset")}</div><div className="flex flex-wrap gap-2"><label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input px-3 text-xs hover:bg-accent">{audio ? t("Replace audio") : t("Choose audio")}<input className="sr-only" type="file" accept="audio/*" disabled={busy} onChange={(event) => { void uploadAudio(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label><Button size="sm" variant="outline" onClick={() => void loadTestPreset()} disabled={busy}>{t("Test preset")}</Button>{audio && <Button size="sm" variant="ghost" onClick={() => void removeAudioFromWorkbench()}>{t("Remove audio")}</Button>}</div>{uploadProgress !== null && <div className="text-[11px] text-cyan-300" role="status">{t("Uploading audio")} · {uploadProgress}%</div>}{audio && <div className="grid grid-cols-2 gap-2"><label className="text-[11px]">{t("Range start (s)")}<Input type="number" min={0} max={duration} step="0.1" value={rangeStart} onChange={(e) => { setRangeStart(Number(e.target.value)); setPreview(null); }} /></label><label className="text-[11px]">{t("Range end (s)")}<Input type="number" min={rangeStart + 0.1} max={duration} step="0.1" value={rangeEnd} onChange={(e) => { setRangeEnd(Number(e.target.value)); setPreview(null); }} /></label></div>}
            <div className="border-t border-border/60 pt-2"><div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-medium">{t("Saved audio assets")}</span><Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => void refreshAudioSources()}>{t("Refresh list")}</Button></div><ul className="max-h-24 space-y-1 overflow-y-auto">{audioSources.filter((item) => item.availabilityStatus !== "missing").map((item) => <li key={item.id}><button type="button" disabled={busy} onClick={() => void selectSavedAudio(item.id)} className={`w-full rounded px-1.5 py-1 text-left text-[10px] hover:bg-accent disabled:opacity-50 ${audio?.id === item.id ? "bg-accent/70" : ""}`} title={`${item.id} · sha256 ${item.contentHash ?? "unknown"}`}><span className="block truncate">{item.filename ?? item.id}</span><span className="text-muted-foreground">{Math.ceil(item.sizeBytes / 1024)} KB · {item.references} {t("references")} · {item.contentHash?.slice(0, 12)}</span></button></li>)}</ul>{audioSources.filter((item) => item.availabilityStatus !== "missing").length === 0 && <p className="text-[10px] text-muted-foreground">{t("No saved audio assets")}</p>}</div>
            <div className="border-t border-border/60 pt-2"><div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-medium">{t("Import folder")}</span><span className="text-[10px] text-muted-foreground">{importSources.length}</span></div>{importConfigured ? <ul className="max-h-28 space-y-1 overflow-y-auto">{importSources.map((item) => <li key={item.name}><button type="button" disabled={busy} onClick={() => void importAudio(item.name)} className="w-full rounded px-1.5 py-1 text-left text-[10px] hover:bg-accent disabled:opacity-50" title={`${item.name} · ${item.sizeBytes} bytes`}><span className="block truncate">{item.name}</span><span className="text-muted-foreground">{Math.ceil(item.sizeBytes / 1024)} KB · {item.mimeType}</span></button></li>)}</ul> : <p className="text-[10px] text-amber-300">{t("Import folder is not configured")}</p>}</div>
          </div>
        </div>
        <details className="rounded border border-border/70 p-2"><summary className="cursor-pointer text-xs font-medium">{t("Brief preparation")}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-xs">{t("Crystal source")}<select className="mt-1 h-8 w-full rounded border border-input bg-background px-2" value={crystalId} onChange={(event) => chooseCrystal(event.target.value)}><option value="">{t("Select an existing crystal")}</option>{crystals.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.combinationShort ?? item.combination.slice(0, 80)}</option>)}</select></label><label className="text-xs">{t("Explicit template Brief")}<Textarea className="mt-1 min-h-16" value={templateBrief} onChange={(event) => setTemplateBrief(event.target.value)} placeholder={t("Enter the saved template text to use for Template Brief → Qwen")}/></label><label className="text-xs sm:col-span-2">{t("Template substitutions (one key=value per line)")}<Textarea className="mt-1 min-h-14" value={templateVariablesText} onChange={(event) => setTemplateVariablesText(event.target.value)} placeholder={t("style=dark\nscene=cathedral")}/></label><p className="text-[11px] text-muted-foreground sm:col-span-2">{t("Use {{key}} placeholders; every value must be explicit. Selecting a crystal copies its stored combination into Brief and adds the existing Crystal → Brief route. No new draw happens on refresh.")}</p></div></details>
        <details className="rounded border border-border/70 p-2"><summary className="cursor-pointer text-xs font-medium">{t("Search context")}</summary><div className="mt-2 space-y-3"><div className="flex flex-wrap items-center gap-3"><label className="text-xs">{t("Text index")}<select className="ml-2 h-8 rounded border border-input bg-background px-2" value={textIndex} onChange={(event) => setTextIndex(event.target.value as "qwen3" | "embeddinggemma2")}><option value="qwen3">Qwen3</option><option value="embeddinggemma2">EmbeddingGemma 2</option></select></label><label className="text-xs">Top-K <Input className="ml-2 inline-flex h-8 w-20" type="number" min={1} max={100} value={topK} onChange={(e) => setTopK(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label><label className="text-xs">{t("Search mode")}<select className="ml-2 h-8 rounded border border-input bg-background px-2" value={searchMode} onChange={(event) => setSearchMode(event.target.value as "single" | "transition")}><option value="single">Single query</option><option value="transition">Transition mode</option></select></label>{searchMode === "transition" && <><Input className="h-8 min-w-40 flex-1" aria-label={t("Query B")} placeholder={t("Query B")} value={queryB} onChange={(event) => setQueryB(event.target.value)} /><label className="text-xs">{transitionRatio}%<input className="ml-2 align-middle" type="range" min={0} max={100} value={transitionRatio} onChange={(event) => setTransitionRatio(Number(event.target.value))} /></label></>}</div><fieldset><legend className="text-[11px] font-medium">{t("Sources")}</legend><div className="flex flex-wrap gap-3">{Object.entries(sources).map(([key, enabled]) => <label key={key} className="text-xs"><input type="checkbox" checked={enabled} onChange={() => setSources((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} /> {key}</label>)}</div></fieldset><fieldset><legend className="text-[11px] font-medium">{t("Retrieval scope")}</legend><div className="flex flex-wrap gap-3">{Object.entries(scopes).map(([key, enabled]) => <label key={key} className="text-xs"><input type="checkbox" checked={enabled} onChange={() => setScopes((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} /> {key}</label>)}</div></fieldset><fieldset><legend className="text-[11px] font-medium">{t("Domain layers")}: {domainLayers.length}/{ACOUSTIC_DOMAIN_LAYERS.length}</legend><div className="grid gap-1 sm:grid-cols-3">{ACOUSTIC_DOMAIN_LAYERS.map((layer) => <label key={layer.id} className="text-xs"><input type="checkbox" checked={domainLayers.includes(layer.id)} onChange={() => setDomainLayers((current) => current.includes(layer.id) ? current.filter((id) => id !== layer.id) : [...current, layer.id])} /> {layer.label}</label>)}</div></fieldset><label className="text-xs"><input type="checkbox" checked={vocalMatrixMode} onChange={(event) => setVocalMatrixMode(event.target.checked)} /> {t("Vocal Matrix scoped search")}</label><details><summary className="cursor-pointer text-xs">{t("Instruction slots")} · {instructionSlots.filter((slot) => slot.enabled && slot.content.trim()).length}/10 {t("enabled")}</summary><div className="mt-2 max-h-80 space-y-2 overflow-auto">{instructionSlots.map((slot, index) => <div key={slot.id} className="grid gap-1 rounded border border-border/60 p-2 sm:grid-cols-[auto_1fr_auto]"><label className="text-xs"><input type="checkbox" checked={slot.enabled} onChange={(event) => setInstructionSlots((items) => items.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))} /> {index + 1}</label><div><Input className="h-7" value={slot.title} aria-label={`${t("Instruction title")} ${index + 1}`} onChange={(event) => setInstructionSlots((items) => items.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /><Textarea className="mt-1 min-h-14" value={slot.content} aria-label={`${t("Instruction text")} ${index + 1}`} onChange={(event) => setInstructionSlots((items) => items.map((item, i) => i === index ? { ...item, content: event.target.value } : item))} /></div><label className="text-xs">{t("Influence")}<Input className="h-7 w-20" type="number" min={0} max={100} value={slot.influence} onChange={(event) => setInstructionSlots((items) => items.map((item, i) => i === index ? { ...item, influence: Number(event.target.value) } : item))} /></label></div>)}</div></details></div></details>
        <details className="rounded border border-border/70 p-2"><summary className="cursor-pointer text-xs font-medium">{t("Audio segmentation")}</summary><div className="mt-2 flex flex-wrap items-end gap-3"><label className="text-xs">{t("Window alignment")}<select className="mt-1 h-8 rounded border border-input bg-background px-2" value={segmentMode} onChange={(event) => setSegmentMode(event.target.value as typeof segmentMode)}><option value="uniform">{t("Uniform")}</option><option value="beat">{t("By beats")}</option><option value="transient">{t("By transients")}</option></select></label><label className="text-xs">{t("Count policy")}<select className="mt-1 h-8 rounded border border-input bg-background px-2" value={segmentCountMode} onChange={(event) => setSegmentCountMode(event.target.value as typeof segmentCountMode)}><option value="automatic">{t("Automatic")}</option><option value="at_most">{t("At most N")}</option><option value="exact">{t("Exactly N")}</option></select></label><label className="text-xs">{segmentCountMode === "exact" ? t("Requested windows") : t("Maximum windows")}<Input className="mt-1 h-8 w-24" type="number" min={1} max={500} value={segmentLimit} onChange={(event) => setSegmentLimit(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /></label>{segmentMode === "uniform" && <label className="text-xs">{t("Target interval (s)")}<Input className="mt-1 h-8 w-24" type="number" min={0.1} step="0.1" value={segmentInterval} onChange={(event) => setSegmentInterval(Math.max(0.1, Number(event.target.value) || 0.1))} /></label>}<p className="text-[11px] text-muted-foreground">{t("The selected audio range is retained; generated windows never exceed the configured maximum.")}</p></div></details>
        {hasTextLlmStages && <details className="rounded border border-border/70 p-2" open><summary className="cursor-pointer text-xs font-medium">{t("Text LLM node sampling")}</summary><div className="mt-2 flex flex-wrap items-center gap-2"><label className="text-xs">{t("Maximum selected fragments per Reverse Query / interpretation stage")}<Input className="ml-2 inline-flex h-8 w-20" type="number" min={1} max={500} value={textLlmSampleLimit} onChange={(event) => setTextLlmSampleLimit(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /></label><span className="text-[10px] text-muted-foreground">{t("Default: 5. K=1 selects the first fragment. Audio and Gemma/CLAP/SigLIP banks still analyze every segment.")}</span></div></details>}
        {hasBriefAssemblyStage && <details className="rounded border border-border/70 p-2" open><summary className="cursor-pointer text-xs font-medium">{t("Brief assembly · sources and executor")}</summary><div className="mt-2 space-y-2"><fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><legend className="text-[10px] text-muted-foreground">{t("Explicit text sources")}</legend>{([["reverseQuery", "Reverse Query"], ["interpretations", "Per-fragment interpretations"], ["textFeatures", "Text features and tags"], ["gapDescriptions", "LFM3 center descriptions for missing interior nodes"], ["trackDraft", "Saved track description draft"]] as const).map(([key, label]) => <label key={key} className="inline-flex items-center gap-1"><input type="checkbox" checked={briefAssemblySources[key]} onChange={(event) => setBriefAssemblySources((value) => ({ ...value, [key]: event.target.checked }))} />{t(label)}</label>)}</fieldset>{briefAssemblySources.trackDraft && <div className="flex flex-wrap items-center gap-2"><label className="text-[11px]">{t("Saved AM-Stage session")}<select className="ml-1 h-8 max-w-64 rounded border border-input bg-background px-2" value={trackDraftSessionId} onChange={(event) => setTrackDraftSessionId(event.target.value)}><option value="">{t("Choose a saved session")}</option>{stageSessions.map((item) => <option key={item.id} value={item.id}>{item.title} · {new Date(item.updated_at).toLocaleString()}</option>)}</select></label><label className="text-[11px]">{t("Description language")}<select className="ml-1 h-8 rounded border border-input bg-background px-2" value={trackDraftLanguage} onChange={(event) => setTrackDraftLanguage(event.target.value as "en" | "ru")}><option value="en">EN</option><option value="ru">RU</option></select></label>{trackDraft ? <span className="text-[10px] text-emerald-300">{t("Snapshot loaded")} · {trackDraft.text.length} {t("characters")}</span> : <span role="status" className="text-[10px] text-amber-300">{t("Selected session has no saved natural description in this language, or it is still loading.")}</span>}{trackDraft && <details className="basis-full text-[10px]"><summary className="cursor-pointer">{t("Preview selected saved text")}</summary><p className="mt-1 whitespace-pre-wrap">{trackDraft.text}</p></details>}</div>}<div className="flex flex-wrap items-center gap-2"><label className="text-[11px]">{t("Brief executor")}<select className="ml-1 h-8 rounded border border-input bg-background px-2" value={briefExecutor} onChange={(event) => setBriefExecutor(event.target.value as typeof briefExecutor)}><option value="freellmapi">FreeLLMAPI</option><option value="ollama_settings">{t("Ollama chat model from Settings")}</option><option value="ollama_model">{t("Specific Ollama model")}</option></select></label>{briefExecutor === "ollama_model" && <label className="text-[11px]">{t("Installed Ollama model ID")}<Input className="ml-1 inline-flex h-8 w-56" value={briefExecutorModel} onChange={(event) => setBriefExecutorModel(event.target.value)} placeholder="lfm3-audio:latest" /></label>}</div><p className="text-[10px] text-muted-foreground">{t("Sources are sent only when checked. Selected nodes, source text and actual provider/model are saved with the Run; there is no hidden provider fallback.")}</p></div></details>}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || !scenarioId} onClick={() => void makePreview()}>{t("Preview readiness")}</Button><Button size="sm" disabled={busy || !preview || previewSignature !== requestSignature || Boolean(preview.blockers.length) || canControl} onClick={() => void start()}>{t("Start automation")}</Button>{canControl && <Button size="sm" variant="destructive" disabled={busy || run?.status === "stopping"} onClick={() => void stop()}>{t("Stop")}</Button>}{run && ["failed", "stopped", "interrupted"].includes(run.status) && <Button size="sm" onClick={() => void continueRun()} disabled={busy || reverseRetryBudgetExhausted}>{t("Continue")}</Button>}{run && failedReverseNodeId && ["failed", "stopped", "interrupted"].includes(run.status) && <><Button size="sm" variant="outline" disabled={busy || !hasSavedReverseResponse} onClick={() => setNodeRecoveryDialog({ kind: "reuse_saved_response", nodeId: failedReverseNodeId })}>{t("Use saved response")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setRetryReason(""); setNodeRecoveryDialog({ kind: "retry_failed_node", nodeId: failedReverseNodeId }); }}>{t("Retry failed node")}</Button></>}{run && <Button size="sm" variant="outline" onClick={exportRun}>{t("Export JSON")}</Button>}</div>
        {reverseRetryBudgetExhausted && failedReverseNodeId && <p role="status" className="text-xs text-amber-200">{t("Continue reuses saved nodes; this node exhausted its finite retry cycle.")} {failedReverseNodeId} · {t("attempts used")} {failedReverseAttempts} · {t("current cycle")} {failedReverseCycleAttempts}/4. {hasSavedReverseResponse ? t("Use the saved response without a model call, or explicitly confirm a new four-attempt cycle.") : t("Explicitly confirm a new four-attempt cycle to retry this node only.")}</p>}
        {preview && <div className="space-y-2 rounded border border-border bg-background/60 p-2"><div className="text-xs font-medium">{t("Plan preview")} · {preview.estimates.stageCount} {t("stages")}{preview.estimates.segmentCount ? ` · ≤${preview.estimates.segmentCount} ${t("windows")}` : ""}{preview.estimates.eta !== null ? ` · ${t("Estimated time")}: ~${Math.ceil(preview.estimates.eta)} s (${t(preview.estimates.confidence)}; ${preview.estimates.unknownStageCount ?? 0} ${t("stages unknown")})` : ` · ${t("Time estimate unavailable until comparable successful attempts exist")}`}</div>{sampledNodePreview && <p className="text-[10px] text-muted-foreground">{t("Text LLM sampling")}: {sampledNodePreview.selected.length}/{sampledNodePreview.total} · {sampledNodePreview.selected.map((item) => `#${item.number} ${item.startSeconds.toFixed(1)}–${item.endSeconds.toFixed(1)}s`).join(" · ")} · {t("estimated equal-width ranges; final node ranges are saved from the actual SegmentPlan")}</p>}{preview.blockers.map((item, i) => <div key={`${item.code}-${i}`} className="text-xs text-red-300">{item.code}: {item.message}</div>)}{preview.warnings.map((item, i) => <div key={i} className="text-xs text-amber-300">{item}</div>)}<ol className="grid gap-1 sm:grid-cols-2">{preview.route.map((stage, i) => <li key={stage.stageId} className="rounded border border-border/70 px-2 py-1 text-xs"><div className="flex items-center gap-2"><span className="text-muted-foreground">{i + 1}.</span><span className="min-w-0 flex-1 truncate">{t(ACTION_LABELS[stage.actionId])}</span><span className={stage.readiness === "ready" ? "text-emerald-300" : "text-amber-300"}>{t(stage.readiness)}</span>{stage.readinessReason && <span title={stage.readinessReason}>ⓘ</span>}</div><details className="mt-1"><summary className="cursor-pointer text-[10px] text-muted-foreground">{t("Stage details")} · {stage.requiredForGoal ? t("required") : t("optional")}</summary><div className="mt-1 space-y-1 text-[10px] text-muted-foreground"><div>{t("Purpose")}: {stage.title}</div><div>{t("Expected result")}: {stage.outputDefinitions.map((output) => output.kind).join(", ") || t("none")}</div><div>{t("Method / settings")}: {JSON.stringify(stage.settings.effective)}</div></div></details></li>)}</ol>{preview.estimates.forecasts?.length ? <details><summary className="cursor-pointer text-[10px] text-muted-foreground">{t("Estimate basis")}</summary><ul className="mt-1 space-y-1 text-[10px]">{preview.estimates.forecasts.map((item) => <li key={item.stageId}>{item.stageId}: {item.seconds === null ? t("No comparable successful history") : `~${Math.ceil(item.seconds)} s · ${item.sampleCount} ${t("matching successful attempts")}`}{item.lowSeconds !== null && item.highSeconds !== null ? ` · ${Math.floor(item.lowSeconds)}–${Math.ceil(item.highSeconds)} s ${t("historical range")}` : ""}</li>)}</ul></details> : null}</div>}
        <details className="rounded border border-border/70 p-2"><summary className="cursor-pointer text-xs font-medium">{t("Create a user chain")}</summary><div className="mt-2 space-y-2">{currentScenario?.definition && <Button size="sm" variant="outline" onClick={copyScenarioToEditor}>{t("Copy selected scenario to editor")}</Button>}<Input placeholder={t("Chain name")} value={title} onChange={(e) => setTitle(e.target.value)} /><ol className="space-y-2">{draftStages.map((stage, index) => <li key={stage.stageId} className="rounded border border-border/70 p-2"><div className="flex items-center gap-2"><strong className="flex-1 text-xs">{index + 1}. {t(ACTION_LABELS[stage.actionId])}</strong><button type="button" className="px-1" disabled={index === 0} onClick={() => setDraftStages((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} aria-label={t("Move step up")}>↑</button><button type="button" className="px-1" disabled={index === draftStages.length - 1} onClick={() => setDraftStages((items) => { const next = [...items]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} aria-label={t("Move step down")}>↓</button><button type="button" className="px-1 text-red-300" onClick={() => setDraftStages((items) => items.filter((_, item) => item !== index))} aria-label={t("Remove step")}>×</button></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-[11px]">{t("Stage title")}<Input className="mt-1 h-8" value={stage.title} onChange={(event) => updateDraftStage(index, (item) => ({ ...item, title: event.target.value }))} /></label><label className="text-[11px]">{t("Stage role")}<Input className="mt-1 h-8" value={stage.role} onChange={(event) => updateDraftStage(index, (item) => ({ ...item, role: event.target.value }))} /></label><label className="inline-flex items-center gap-2 text-[11px]"><input type="checkbox" checked={stage.requiredForGoal} onChange={(event) => updateDraftStage(index, (item) => ({ ...item, requiredForGoal: event.target.checked, outputDefinitions: item.outputDefinitions.map((output) => ({ ...output, required: event.target.checked })), failurePolicy: event.target.checked ? "fail_run" : "continue" }))} />{t("Required for goal")}</label><label className="text-[11px]">{t("On failure")}<select className="ml-2 h-8 rounded border border-input bg-background px-2" value={stage.failurePolicy} onChange={(event) => updateDraftStage(index, (item) => ({ ...item, failurePolicy: event.target.value as "fail_run" | "continue" }))}><option value="fail_run">{t("Fail the run")}</option><option value="continue">{t("Continue with a visible partial result")}</option></select></label><label className="text-[11px]">Top-K override<Input className="mt-1 h-8" type="number" min={1} max={500} value={String(stage.settings.requested.topK ?? topK)} onChange={(event) => updateDraftStage(index, (item) => ({ ...item, settings: { ...item.settings, requested: { ...item.settings.requested, topK: Number(event.target.value) }, effective: { ...item.settings.effective, topK: Number(event.target.value) } } }))} /></label>{stage.actionId === "audio.describe_gaps.lfm3" && <label className="text-[11px]">{t("Central LFM3 clip seconds")}<Input className="mt-1 h-8 w-24" type="number" min={0.25} max={30} step={0.25} value={String(stage.settings.requested.gapClipSeconds ?? 8)} onChange={(event) => { const value = Math.max(0.25, Math.min(30, Number(event.target.value) || 0.25)); updateDraftStage(index, (item) => ({ ...item, settings: { ...item.settings, requested: { ...item.settings.requested, gapClipSeconds: value }, effective: { ...item.settings.effective, gapClipSeconds: value } } })); }} /><span className="block max-w-56 text-[10px] text-muted-foreground">{t("Centered inside the target node; LFM3 hears only this clip, not the full node.")}</span></label>}{stage.actionId === "audio.segment" && <><label className="text-[11px]">{t("Window boundary")}<select className="ml-2 h-8 rounded border border-input bg-background px-2" value={String(stage.settings.requested.boundaryMode ?? "uniform")} onChange={(event) => updateDraftStage(index, (item) => ({ ...item, settings: { ...item.settings, requested: { ...item.settings.requested, boundaryMode: event.target.value }, effective: { ...item.settings.effective, boundaryMode: event.target.value } } }))}><option value="uniform">Uniform</option><option value="beat">By beats</option><option value="transient">By transients</option></select></label><label className="text-[11px]">{t("Maximum windows")}<Input className="mt-1 h-8" type="number" min={1} max={240} value={String(stage.settings.requested.maximumCount ?? segmentLimit)} onChange={(event) => updateDraftStage(index, (item) => ({ ...item, settings: { ...item.settings, requested: { ...item.settings.requested, maximumCount: Number(event.target.value) }, effective: { ...item.settings.effective, maximumCount: Number(event.target.value) } } }))} /></label></>}</div><fieldset className="mt-2 rounded border border-border/60 p-2"><legend className="px-1 text-[10px] text-muted-foreground">{t("Data inputs · order is separate")}</legend>{index === 0 ? <p className="text-[10px] text-muted-foreground">{t("This step uses external inputs or preparation settings.")}</p> : <div className="flex flex-wrap gap-x-3 gap-y-1">{draftStages.slice(0, index).map((source) => <label key={source.stageId} className="inline-flex items-center gap-1 text-[10px]"><input type="checkbox" checked={stage.inputBindings.some((binding) => binding.port !== "order" && binding.from === `stage:${source.stageId}`)} onChange={(event) => setDraftSource(index, source.stageId, event.target.checked)} />{source.title}</label>)}</div>}</fieldset></li>)}</ol><div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{AUTOMATION_ACTION_IDS.map((action, index) => <button key={`${action}-${index}`} type="button" className="rounded border border-border px-2 py-1 text-left text-[11px] hover:bg-accent" onClick={() => setDraftStages((items) => [...items, makeDraftStage(action, items.length)])}>{t("Add")}: {t(ACTION_LABELS[action])}</button>)}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void saveCustomScenario()} disabled={busy}>{t("Save chain")}</Button>{currentScenario?.origin === "user" && <><Button size="sm" variant="outline" onClick={() => void updateCustomScenario()} disabled={busy}>{t("Save new version")}</Button><Button size="sm" variant="destructive" onClick={() => void archiveCustomScenario()} disabled={busy}>{t("Archive scenario")}</Button></>}</div></div></details>
      </section>
      <section className="space-y-3 rounded-md border border-border bg-card/60 p-3"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t("Run results")}</h2>{run && <div className="flex items-center gap-2"><span className="rounded border border-border px-2 py-1 text-xs">{run.status}</span>{ACTIVE.has(run.status) && <span className={`text-[10px] ${streamConnected ? "text-emerald-400" : "text-amber-300"}`} role="status">{streamConnected ? t("Live updates") : t("Reconnecting")}</span>}</div>}</div>{run ? <><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void refreshRun(run.id)}>{t("Refresh run")}</Button><Button size="sm" variant="outline" onClick={exportRun}>{t("Export JSON")}</Button><Button size="sm" variant="outline" disabled={ACTIVE.has(run.status)} onClick={() => void newFromRun()}>{t("New run based on this")}</Button><Button size="sm" variant="destructive" disabled={busy || ACTIVE.has(run.status)} onClick={() => setDeleteDialogOpen(true)}>{t("Delete run")}</Button><Button size="sm" variant="outline" onClick={() => { const candidate = run.stages.find((stage) => stage.artifacts.length && ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved", "stage2.server"].includes(stage.actionId)); if (candidate) viewInStage(candidate); else router.push(`/am-stage?automationRun=${encodeURIComponent(run.id)}&automationView=1`); }}>{t("Open in Tri-Modal Stage")}</Button></div>{run.lastErrorSummary && <p role="alert" className="text-xs text-red-300">{run.lastErrorSummary}</p>}<ol className="space-y-2">{run.stages.map((stage) => { const progress = streamProgress[stage.stageId]; return <li key={stage.id} className="rounded border border-border/70 p-2"><div className="flex flex-wrap items-center justify-between gap-1"><strong className="text-xs">{stage.actionId}</strong><span className="text-xs text-muted-foreground">{stage.status}</span></div>{progress && <div className="text-[10px] text-cyan-300">{progress.phase ?? progress.source ?? t("In progress")}{typeof progress.current === "number" && typeof progress.total === "number" ? ` · ${progress.current}/${progress.total}` : ""}{progress.nodeId ? ` · ${t("Node")} ${progress.nodeId}` : ""}{typeof progress.attempt === "number" ? ` · ${t("Attempt")} ${progress.attempt}/${progress.retryLimit ?? 4}` : ""}{typeof progress.waitMs === "number" ? ` · ${t("Retry wait")} ${(progress.waitMs / 1000).toFixed(1)} s` : ""}{progress.lastError ? ` · ${progress.lastError}` : ""}</div>}{stage.nodeCheckpoints?.length ? <details className="mt-1 text-[10px]"><summary className="cursor-pointer text-cyan-200">{t("Saved node progress")} · {stage.nodeCheckpoints.length}</summary><ul className="mt-1 space-y-1">{stage.nodeCheckpoints.map((item) => { const checkpoint = item.payload.data ?? {}; return <li key={item.id} className="rounded border border-border/50 p-1">{String(checkpoint.segmentId ?? "node")} · {String(checkpoint.status ?? "pending")} · {t("attempts used")} {String(checkpoint.attemptsUsed ?? 0)}{checkpoint.lastError ? ` · ${String(checkpoint.lastError)}` : ""}{checkpoint.status === "succeeded" && <details><summary className="cursor-pointer">{t("Saved node result")}</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(checkpoint.result, null, 2)}</pre></details>}</li>; })}</ul></details> : null}{stage.attempts.map((attempt) => <div key={attempt.attemptNumber} className="text-[11px] text-muted-foreground">{t("Attempt")} {attempt.attemptNumber}: {attempt.status}{attempt.error?.message ? ` · ${attempt.error.message}` : ""}</div>)}{stage.artifacts.map((artifact) => <div key={artifact.id} className="mt-2 rounded bg-background/70 p-2"><div className="flex flex-wrap justify-between gap-2 text-[11px]"><span className="flex items-center gap-2">{artifact.kind} · {artifact.bankId ?? t("result")}<label className="inline-flex items-center gap-1"><input type="checkbox" checked={selectedArtifactIds.includes(artifact.id)} onChange={(event) => setSelectedArtifactIds((ids) => event.target.checked ? [...new Set([...ids, artifact.id])] : ids.filter((id) => id !== artifact.id))} />{t("Use as text-feature source")}</label></span><span className="flex gap-2">{stage.status === "succeeded" && <><button type="button" className="text-primary underline" onClick={() => viewInStage(stage)}>{t("View in Tri-Modal Stage")}</button><button type="button" className="text-primary underline" onClick={() => stageToStage(stage)}>{t("Apply to workbench")}</button></>}<button type="button" className="text-primary underline" onClick={() => exportArtifact(artifact, "txt")}>TXT</button><button type="button" className="text-primary underline" onClick={() => exportArtifact(artifact, "json")}>JSON</button></span></div><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">{JSON.stringify(artifact.payload.data, null, 2)}</pre></div>)}</li>; })}</ol></> : <div className="rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{t("Select a scenario, preview readiness, then start to see durable stage results here.")}</div>}
        <div className="border-t border-border pt-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">{t("Run history")}</h3><select aria-label={t("Filter run history")} className="h-7 rounded border border-input bg-background px-2 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">{t("All statuses")}</option>{["running", "finished", "failed", "stopped", "interrupted"].map((value) => <option key={value}>{value}</option>)}</select></div><div className="mb-2 grid grid-cols-1 gap-1 sm:grid-cols-2"><Input aria-label={t("Search history")} placeholder={t("Search history")} value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /><select aria-label={t("Filter by scenario")} className="h-8 rounded border border-input bg-background px-2 text-xs" value={historyScenario} onChange={(event) => setHistoryScenario(event.target.value)}><option value="all">{t("All scenarios")}</option>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Input aria-label={t("Created after")} type="date" value={historyAfter} onChange={(event) => setHistoryAfter(event.target.value)} /><Input aria-label={t("Created before")} type="date" value={historyBefore} onChange={(event) => setHistoryBefore(event.target.value)} /><Button className="sm:col-span-2" size="sm" variant="outline" onClick={() => void refreshHistory()}>{t("Apply history filters")}</Button></div><ul className="max-h-64 space-y-1 overflow-auto">{history.map((item) => <li key={item.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-xs"><button type="button" className="min-w-0 flex-1 truncate text-left hover:text-primary" onClick={() => void openRun(item.id)}>{item.title} · {item.status}</button><span className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></li>)}{history.length === 0 && <li className="text-xs text-muted-foreground">{t("No saved runs yet.")}</li>}</ul></div>
      </section>
    </div>
    <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { if (!busy) setDeleteDialogOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("Delete run")}</AlertDialogTitle><AlertDialogDescription>{run ? `${run.title}. ${t("Saved shared audio assets are kept.")}` : t("This run will be removed from history.")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("Cancel")}</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void deleteRun()}>{busy ? t("Deleting…") : t("Delete run")}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={Boolean(nodeRecoveryDialog)} onOpenChange={(open) => { if (!busy && !open) setNodeRecoveryDialog(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{nodeRecoveryDialog?.kind === "reuse_saved_response" ? t("Reuse saved Reverse Query response") : t("Retry failed node")}</AlertDialogTitle>
          <AlertDialogDescription>
            {nodeRecoveryDialog?.kind === "reuse_saved_response"
              ? `${nodeRecoveryDialog.nodeId}: ${t("Re-parse the saved model text with the current normalizer; this makes no model request and preserves failed attempts.")}`
              : `${nodeRecoveryDialog?.nodeId ?? ""}: ${t("Start one new finite cycle of up to four requests for this node only. Successful nodes and upstream audio stages are reused.")}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {nodeRecoveryDialog?.kind === "retry_failed_node" && <label className="grid gap-1 text-xs"><span>{t("Retry reason")}</span><Textarea value={retryReason} maxLength={500} onChange={(event) => setRetryReason(event.target.value)} placeholder={t("Explain what was corrected before retrying this node.")} /></label>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("Cancel")}</AlertDialogCancel>
          <Button type="button" disabled={busy || (nodeRecoveryDialog?.kind === "retry_failed_node" && retryReason.trim().length < 10)} onClick={() => void runNodeRecovery()}>{busy ? t("Continuing…") : nodeRecoveryDialog?.kind === "reuse_saved_response" ? t("Use saved response") : t("Start new retry cycle")}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
