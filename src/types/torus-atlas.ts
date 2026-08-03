export interface TorusAtlasMetrics {
  V?: number;
  S?: number;
  N?: number;
  D_f?: number;
  G_S?: number;
  QEC?: number;
  CHSH?: number;
  C_val?: number;
  Q?: number;
}

export interface TorusAtlasCrystal {
  id: string;
  code: string;
  name: string;
  formula: string;
  category: string;
  type: string;
  clusterLabel: number;
  semanticClusterLabel: number;
  torusClusterLabel: number;
  formulaCluster: number;
  torusX: number;
  torusY: number;
  torusZ: number;
  torusU: number;
  torusV: number;
  layoutKey: string;
  layoutScope: "all" | "selected" | "";
  layoutSize: number;
  atlasStoredAt: string;
  torusGeometryR: number;
  torusGeometryr: number;
  metrics: TorusAtlasMetrics;
  microNotes: string;
  manifestDonors: unknown[];
  translation: string;
  autoAnnotation: string;
  evolutionHistory: unknown[];
  tags: string[];
  pattern: string;
  complexity: number;
  qualityScore: number;
  isEmerald: boolean;
  createdAt: string;
}

export interface TorusAtlasListResponse {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: TorusAtlasCrystal[];
}

export interface TorusAtlasSelectionResponse {
  ok: boolean;
  total: number;
  selectedCount: number;
  ids: string[];
  truncated: boolean;
}

export interface TorusAtlasWorkingSet {
  id: string;
  name: string;
  ids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TorusAtlasAppendResult {
  ok: true;
  baseLayoutKey: string;
  appended: number;
  totalLayoutSize: number;
}

export interface TorusAtlasFullRebuildJob {
  id: string;
  status: "idle" | "preparing" | "analyzing" | "analysis_ready" | "persisting" | "paused" | "completed" | "failed";
  total: number;
  processed: number;
  analysisProcessed: number;
  analysisPercent: number;
  analysisStep: string;
  batchSize: number;
  currentBatch: number;
  totalBatches: number;
  layoutKey: string;
  clusters: number;
  nextOffset: number;
  snapshotReady: boolean;
  paramsJson: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string;
  error: string;
  phaseMessage: string;
}

export interface TorusAtlasDiagnosticResult {
  ok: true;
  total: number;
  uniqueCombinations: number;
  duplicateCombinations: number;
  clustersRequested: number;
  uniqueLabels: number;
  uniqueTorusLabels: number;
  labelHistogram: Array<{
    label: number;
    count: number;
  }>;
  torusLabelHistogram: Array<{
    label: number;
    count: number;
  }>;
  docsWithCoords: number;
  docsWithoutCoords: number;
  layoutPreview: Array<{
    id: string;
    code: string;
    formula: string;
    clusterLabel: number;
    torusClusterLabel: number;
    torusU: number;
    torusV: number;
  }>;
  rawShape: {
    hasDocs: boolean;
    hasDocCoords: boolean;
    hasLabels: boolean;
    docsLength: number;
    docCoordsLength: number;
    labelsLength: number;
  };
}
