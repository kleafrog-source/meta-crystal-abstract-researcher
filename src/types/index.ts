/**
 * Shared domain types for the Мета-Кристалл web app.
 */

export type CrystalType =
  | "ИЗУМРУД"
  | "АЛМАЗ"
  | "ПРИНЦИП"
  | "ГИБРИД"
  | "СЫРОЙ"
  | "ПАРАДОКС"
  | "КВАНТОВЫЙ"
  | "ФРАКТАЛЬНЫЙ"
  | "ЛИНГВИСТИЧЕСКИЙ"
  | "СИСТЕМНЫЙ"
  | "JSON_PROMPT"
  | "QGEOM"
  | "RESEARCH"
  | "FAIR_DIVISION"
  | string;

export interface CrystalIndexEntry {
  code: string;
  type: string;
  category?: string;
  focus?: string;
  pattern?: string;
  combination: string;
  filepath: string;
  counter: number;
  step?: number;
  qualityScore?: number;
  complexity?: number;
  datetime?: string;
}

export interface CrystalFull extends CrystalIndexEntry {
  elements?: string[];
  operators?: string[];
  metrics?: Record<string, number>;
  reasons?: string[];
  metadata?: Record<string, unknown>;
}

export interface Profile {
  version: string;
  name: string;
  params: {
    generations: number;
    batch: number;
    top: number;
    max_depth: number;
    max_elements: number;
    use_irrational: boolean;
    use_imaginary: boolean;
    use_infinity: boolean;
    invert_probability: number;
    psychology_probability: number;
  };
  flags: Record<string, boolean>;
  metrics: {
    enabled: boolean;
    influencing: string[];
    observational: string[];
  };
  custom_patterns?: unknown[];
  disabled_patterns?: string[];
  favourites?: unknown[];
  flag_groups?: Record<string, string[]>;
  created?: string;
  modified?: string;
}

export interface PipelineStep {
  name: string;
  action:
    | "generate"
    | "filter"
    | "catalog"
    | "save"
    | "evolve"
    | "transform"
    | "manifest_micro_notes"
    | "manifest_manifest"
    | "manifest_palette_query"
    | "manifest_diffuse"
    | "manifest_embeddings_index"
    | "manifest_isomorphisms_scan"
    | string;
  params: Record<string, unknown>;
  laws?: unknown[];
  conditions?: unknown[];
}

export interface Pipeline {
  id?: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  profile?: Partial<Profile>;
  flags?: Record<string, boolean>;
  params?: Record<string, unknown>;
  createdAt?: string;
  modifiedAt?: string;
}

export interface DashboardStats {
  totalCrystals: number;
  totalEmeralds: number;
  totalDiamonds: number;
  totalPipelines: number;
  activeRuns: number;
  recentCrystals: CrystalIndexEntry[];
  typeBreakdown: Record<string, number>;
}

export interface EngineInfo {
  engineOk: boolean;
  version: string;
  flagsCount: number;
  flags: string[];
  patterns?: string[];
  lexiconCount: number;
  operatorsCount: number;
  patternsCount: number;
  focusCount: number;
  crystalTypes: string[];
  focusTypes: string[];
  dataDir: string;
}
