import type { ActiveParameter } from "@/lib/rag-v3/types";

export type CrossModalModality = "audio" | "image" | "text" | "transition";
export type CrossModalEngine =
  | "clap"
  | "siglip2"
  | "semantic-v3"
  | "consensus"
  | "transition";

export interface ConsensusParameter {
  technical_name: string;
  rank: number;
  retrieval_score: number | null;
  normalized_score: number;
  default_value: number | string;
  selected_value: number | string;
  ui_element: string;
  min_value?: number;
  max_value?: number;
  value_source: string;
  retrieval_scope?: string;
}

export interface JournalReverseQuery {
  query_en: string;
  query_ru: string;
  key_concepts: string[];
  uncertainties: string[];
}

export interface CycleMetrics {
  weighted_overlap: number;
  jaccard_at_k: number;
  value_agreement: number;
  scope_agreement: number;
  verification_score: number;
}

export interface JournalVerification {
  schema_version: 1;
  id: string;
  source_record_id: string;
  content_sha256: string;
  created_at: string;
  status: "verified" | "review" | "rejected" | "error" | "cancelled";
  reverse_query: JournalReverseQuery | null;
  raw_response: string;
  error: string | null;
  replay_query: string | null;
  replay_parameters: ConsensusParameter[];
  metrics: CycleMetrics | null;
  chat: { provider: string; model: string };
  replay: {
    dataset_version: string;
    dataset_sha256: string;
    embedding_model: string;
    top_k: number;
  } | null;
  config: {
    version: "cycle-v1" | "cycle-v2";
    weights: CycleMetrics;
    thresholds: { verified: number; review: number };
  };
}

export interface JournalVerdict {
  schema_version: 1;
  id: string;
  source_record_id: string;
  verification_id: string | null;
  created_at: string;
  decision: "approved" | "rejected";
  note: string | null;
}

export interface ConsensusSourceSnapshot {
  modality: CrossModalModality;
  engine: CrossModalEngine;
  top_k: number;
  parameters: ConsensusParameter[];
  dataset_version: string;
  dataset_sha256: string;
  model: { id: string; revision?: string; dimensions?: number };
  settings: Record<string, string | number | boolean>;
}

export interface JournalAsset {
  sha256: string;
  relative_path: string;
  mime_type: string;
  size: number;
  original_name: string;
}

export interface JournalRecord {
  schema_version: 1;
  id: string;
  content_sha256: string;
  created_at: string;
  label: string;
  query: string | null;
  snapshot: ConsensusSourceSnapshot;
  asset: JournalAsset | null;
  reverse_query: null;
  verification: { status: "unverified"; score: null };
  user_verdict: null;
  latest_verification?: JournalVerification | null;
  latest_user_verdict?: JournalVerdict | null;
}

export interface JournalCreateMetadata {
  modality: CrossModalModality;
  engine: CrossModalEngine;
  label?: string;
  query?: string;
  model: { id: string; revision?: string; dimensions?: number };
  settings?: Record<string, string | number | boolean>;
  parameters: ActiveParameter[];
}

export interface JournalIndex {
  schema_version: 1;
  updated_at: string;
  count: number;
  record_ids: string[];
}

export interface JournalManifest {
  schema_version: 1;
  updated_at: string;
  count: number;
  journal_sha256: string;
}

export interface BridgeIndexRow {
  record_id: string;
  verification_id: string;
  modality: CrossModalModality;
  asset_sha256: string | null;
  text_sha256: string;
  verification_status: "verified" | "review" | "approved";
  verification_score: number;
  label: string;
}

export interface BridgeManifest {
  schema_version: 1;
  created_at: string;
  model: string;
  dimensions: number;
  count: number;
  journal_sha256: string;
  files: { rows: "rows.json"; embeddings: "embeddings.f32" };
}

export interface BridgeMatch {
  record_id: string;
  label: string;
  modality: CrossModalModality;
  similarity: number;
  verification_score: number;
  common_parameters: string[];
  asset_sha256: string | null;
}

export interface ConsensusContribution {
  record_id: string;
  modality: CrossModalModality;
  source_weight: number;
  normalized_score: number;
  vote: number;
  selected_value: number | string;
}

export interface ConsensusResultRow {
  technical_name: string;
  consensus_score: number;
  direct_source_count: number;
  graph_only: boolean;
  conflict: boolean;
  contributions: ConsensusContribution[];
}

export interface TransitionPreparedRow {
  parameter: ActiveParameter;
  score_a: number;
  score_b: number;
  value_a: number | string;
  value_b: number | string;
  present_a: boolean;
  present_b: boolean;
}
