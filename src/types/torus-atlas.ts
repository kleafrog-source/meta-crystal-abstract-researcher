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

export interface TorusAtlasFullRebuildJob {
  id: string;
  status: "idle" | "preparing" | "analyzing" | "persisting" | "completed" | "failed";
  total: number;
  processed: number;
  batchSize: number;
  currentBatch: number;
  totalBatches: number;
  layoutKey: string;
  clusters: number;
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
  labelHistogram: Array<{
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
