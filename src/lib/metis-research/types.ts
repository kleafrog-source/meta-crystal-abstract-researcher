import type { AtlasChart, CrystalNode } from "@/lib/metis/types";

export interface LibraryCrystal extends CrystalNode {
  code: string;
  type: string;
  focus: string;
  domain: string;
  combination: string;
  rawEmbeddingScore?: number;
}

export interface LibrarySummary {
  totalCrystals: number;
  byType: Record<string, number>;
  byDomain: Record<string, number>;
  byFocus: Record<string, number>;
  avgImportance: number;
  generatedAt: number;
  corpusVersion: string;
}

export type ResearchMode = "single_run" | "candidate_pool_comparison";

export interface RunConfig {
  candidatePoolSize: number;
  topK: number;
  mode: ResearchMode;
  seed: number | null;
  embeddingModel: string | null;
  pipelineVersion: string;
}

export type TraceStageName =
  | "query_input"
  | "query_preparation"
  | "embedding_or_initial_retrieval"
  | "candidate_pool_selection"
  | "existing_scoring"
  | "existing_update_if_triggered"
  | "existing_forget_if_triggered"
  | "visualization_preparation"
  | "result_render";

export interface TraceStage {
  name: TraceStageName;
  durationMs: number;
  inputCount: number;
  outputCount: number;
  status: "success" | "error" | "skipped";
  metadata: Record<string, unknown>;
}

export interface ScoreDecomposition {
  rawScore: number;
  finalScore: number;
  embeddingScore: number;
  importance: number;
  metadataScore?: number;
  diversityPenalty?: number;
  reasonCodes: string[];
}

export interface RunMetrics {
  meanFinalScore: number;
  minFinalScore: number;
  maxFinalScore: number;
  scoreGapAtK: number;
  typeDiversity: number;
  focusDiversity: number;
  domainCoverage: number;
  runtimeMs: number;
  memoryUsageMB: number | null;
}

export interface RetrievalResult {
  crystal: LibraryCrystal;
  rank: number;
  score: ScoreDecomposition;
  hitHistory: string[];
}

export interface RetrievalRun {
  runId: string;
  query: string;
  startedAt: number;
  finishedAt: number;
  config: RunConfig;
  stages: TraceStage[];
  results: RetrievalResult[];
  resultIds: string[];
  metrics: RunMetrics;
  corpusSize: number;
  embeddingModelVersion: string;
  pipelineVersion: string;
  warnings: string[];
  errors: string[];
}

export interface CrossRunMetrics {
  overlapAt5: number;
  overlapAt16: number;
  jaccardAtK: number;
  rankChanges: number;
  stableObservedSet: string[];
  candidateDependentSet: string[];
  newDiscoveryCount: number;
  removedFromPreviousCount: number;
  meanScoreDelta: number;
  scoreGapComparison: { baseline: number; comparison: number; delta: number };
  runtimeComparison: { baseline: number; comparison: number; delta: number };
}

export interface ComparisonResult {
  baselineRunId: string;
  comparisons: Array<{
    baselineId: string;
    comparisonId: string;
    metrics: CrossRunMetrics;
  }>;
  multiRun: {
    stableObservedSet: string[];
    candidateDependentSet: string[];
    newDiscoverySets: Record<string, string[]>;
  };
}

export interface ResearchInitState {
  ready: boolean;
  progress: { done: number; total: number; phase: string };
  summary: LibrarySummary | null;
  corpusNodes: CrystalNode[];
  charts: AtlasChart[];
}

export const DEFAULT_PIPELINE_VERSION = "metis-inspired-retrieval-v2.1";
