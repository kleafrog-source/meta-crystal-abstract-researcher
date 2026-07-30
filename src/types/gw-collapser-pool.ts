export type GwCrystalPoolActionId =
  | "torus_flow"
  | "micro_notes"
  | "manifest_donors"
  | "diffuse_manual"
  | "fill_missing"
  | "detect_emeralds"
  | "refine_metrics"
  | "translation"
  | "mmss_real_data"
  | "evolve_trajectory"
  | "cluster_formulas"
  | "generate_report"
  | "compare_mmss"
  | "semantic_twins"
  | "auto_annotation";

export type GwCrystalPoolActionCategory =
  | "analysis"
  | "generation"
  | "manual"
  | "visualization";

export interface GwCrystalPoolListItem {
  id: string;
  code: string;
  type: string;
  category: string | null;
  pattern: string | null;
  combination: string;
  qualityScore: number | null;
  complexity: number | null;
  createdAt: string;
  llmMicroNote: string | null;
  vectorDirection: string | null;
  hasTorusAnalysis: boolean;
}

export interface GwCrystalPoolActionDefinition {
  id: GwCrystalPoolActionId;
  name: string;
  description: string;
  category: GwCrystalPoolActionCategory;
  availability: "ready" | "scaffold";
}

export interface GwCrystalPoolActionResultItem {
  id: string;
  code?: string;
  status: "updated" | "computed" | "skipped";
  summary: string;
  data?: Record<string, unknown> | null;
}

export interface GwCrystalPoolActionResponse {
  ok: boolean;
  action: GwCrystalPoolActionId;
  actionName: string;
  availability: "ready" | "scaffold";
  affectedCount: number;
  results: GwCrystalPoolActionResultItem[];
  extra?: Record<string, unknown> | null;
}

export interface GwCrystalPoolVisualizationPoint {
  crystalId: string;
  crystalCode: string;
  docId: string;
  mode: "combination_only" | "full";
  title: string;
  text: string;
  cluster: number;
  x: number;
  y: number;
  sourcePath?: string;
  sourceIndex?: number;
}

export interface GwCrystalPoolVisualizationModeSummary {
  mode: "combination_only" | "full";
  count: number;
  color: string;
}

export interface GwMmssComparisonRow {
  crystalId: string;
  crystalCode: string;
  V: number;
  S: number;
  N: number;
  D_f: number;
  QEC: number;
  CHSH: number;
  Q: number;
}
