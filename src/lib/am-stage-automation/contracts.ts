import type { ActiveParameter } from "@/lib/rag-v3/types";
import type { AmStageMacroStep } from "@/lib/am-stage-macros";

export const AUTOMATION_ACTION_IDS = [
  "brief.from_crystal", "brief.from_template", "audio.analyze", "audio.segment",
  "text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved",
  "audio.clap.resolved", "spec.siglip.resolved", "audio.gemma.awtd", "audio.gemma.resolved",
  "stage2.client", "stage2.server", "audio.describe.lfm3", "audio.describe_gaps.lfm3", "audio.transcribe.lfm3",
  "audio.extract_acoustics", "audio.detect_indic_language", "audio.assess_vocal_timbre", "audio.analyze_helm",
  "text_features.build", "text_features.compare_rankings", "text_features.describe_llm", "text_features.reverse_query", "brief.combine_segment_texts",
  "vocal_allocation.search", "result.bundle",
] as const;

export type AutomationActionId = (typeof AUTOMATION_ACTION_IDS)[number];
export type RunStatus = "preparing" | "running" | "stopping" | "stopped" | "failed" | "interrupted" | "finished";
export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted" | "skipped";
export type AttemptStatus = "running" | "succeeded" | "failed" | "cancelled" | "interrupted";

export interface AutomationAudioRange {
  assetId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface AutomationExternalInputs {
  assetId?: string;
  audioName?: string;
  audioDurationSeconds?: number;
  audioRange?: AutomationAudioRange;
  brief?: string;
  briefSource?: "manual" | "workbench" | "crystal" | "artifact";
  briefArtifactId?: string;
  briefAssembly?: {
    sources: { reverseQuery: boolean; interpretations: boolean; textFeatures: boolean; trackDraft: boolean; gapDescriptions?: boolean };
    executor: "freellmapi" | "ollama_settings" | "ollama_model";
    model?: string;
    trackDraft?: { sessionId: string; language: "en" | "ru"; text: string; snapshotUpdatedAt: string };
  };
  crystalId?: string;
  workspaceSnapshot?: {
    brief?: string;
    templateBrief?: string;
    templateVariables?: Record<string, string>;
    templateVariablesText?: string;
    textIndex?: "qwen3" | "embeddinggemma2";
    sources?: Record<string, boolean>;
    scopes?: Record<string, boolean>;
    domainLayers?: string[];
    topK?: number;
    autoTopK?: boolean;
    instructionContext?: Array<{ id: string; title: string; content: string; influence: number }>;
    parameters?: ActiveParameter[];
    vocalMatrixMode?: boolean;
    searchMode?: "single" | "transition";
    queryB?: string;
    transitionRatio?: number;
  };
  selectedArtifactIds?: string[];
}

export interface AutomationStageDefinition {
  stageId: string;
  actionId: AutomationActionId;
  title: string;
  role: string;
  inputBindings: Array<{ name: string; from: string; port?: string }>;
  outputDefinitions: Array<{ port: string; kind: string; required: boolean }>;
  settings: { requested: Record<string, unknown>; effective: Record<string, unknown>; origin: "scenario_default" | "automatic" | "manual" };
  requiredForGoal: boolean;
  failurePolicy: "fail_run" | "continue";
  allowedFallbacks: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface AutomationScenarioDefinition {
  id: string;
  version: number;
  title: string;
  description: string;
  goal: string;
  acceptedInputs: string[];
  preparationPolicies: Record<string, unknown>;
  stages: AutomationStageDefinition[];
  defaultSettings: Record<string, unknown>;
  requiredResults: string[];
  optionalResults: string[];
  resultDestinations: string[];
  sourceLegacyPresetId?: string;
}

export interface AutomationPlanDocument {
  schemaVersion: number;
  id: string;
  scenarioRef: { id: string; version: number };
  goal: string;
  externalInputs: AutomationExternalInputs;
  searchContext: Record<string, unknown>;
  modelBindings: Record<string, unknown>;
  preparationPolicies: Record<string, unknown>;
  stages: AutomationStageDefinition[];
  dependencies: Array<{ from: string; to: string; kind: "data" | "order"; port?: string }>;
  resourcePolicies: Record<string, unknown>;
  budgetPolicies: Record<string, unknown>;
  resultRequirements: string[];
  previewEstimates: Record<string, unknown>;
  fingerprint: string;
  createdAt: string;
}

export interface AutomationArtifactPayload {
  schemaVersion: number;
  kind: string;
  actionId: AutomationActionId;
  bankId?: string;
  modality?: string;
  pass?: string;
  modelBinding?: Record<string, unknown>;
  effectiveSettings: Record<string, unknown>;
  inputRefs: string[];
  sourceAssetRefs: string[];
  audioRange?: AutomationAudioRange;
  segmentRefs: Array<{ id: string; startSeconds: number; endSeconds: number }>;
  validity: "valid" | "partial" | "invalid" | "negative";
  warnings: string[];
  data: unknown;
}

export interface AutomationAdapterContext {
  runId: string;
  stageId: string;
  attemptId: string;
  signal: AbortSignal;
  inputs: AutomationExternalInputs;
  settings: Record<string, unknown>;
  resolvedInputs: Record<string, unknown>;
  priorNodeCheckpoints: Array<Record<string, unknown>>;
  persistNodeCheckpoint: (checkpoint: Record<string, unknown>) => Promise<void>;
  onProgress: (progress: Record<string, unknown>) => Promise<void>;
}

export interface AutomationAdapterResult {
  artifacts: Array<{ kind: string; bankId?: string; modality?: string; pass?: string; modelBinding?: Record<string, unknown>; effectiveSettings?: Record<string, unknown>; segmentRefs?: Array<{ id: string; startSeconds: number; endSeconds: number }>; validity?: AutomationArtifactPayload["validity"]; warnings?: string[]; data: unknown }>;
  metrics?: Record<string, unknown>;
  warnings?: string[];
  assessment?: string;
  completionSource?: "computed" | "reused";
}

export const LEGACY_ACTION_IDS: Record<AmStageMacroStep, AutomationActionId> = {
  "text.qwen.resolved": "text.qwen.resolved",
  "text.gemma.awtd": "text.gemma.awtd",
  "text.gemma.resolved": "text.gemma.resolved",
  "audio.clap.resolved": "audio.clap.resolved",
  "spec.siglip.resolved": "spec.siglip.resolved",
  "audio.gemma.awtd": "audio.gemma.awtd",
  "audio.gemma.resolved": "audio.gemma.resolved",
  "stage2.client": "stage2.client",
  "stage2.server": "stage2.server",
};
