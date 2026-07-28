export interface GwCrystalSourceRef {
  crystalId: string;
  crystalCode: string;
  crystalFilepath: string;
}

export type GwCrystalDocKind =
  | "searchText"
  | "combination"
  | "focus"
  | "pattern"
  | "category"
  | "type"
  | "element"
  | "operator"
  | "metrics"
  | "reason";

export interface GwCrystalDoc {
  id: string;
  title: string;
  text: string;
  kind: GwCrystalDocKind;
  sourcePath?: string;
  sourceIndex?: number;
}

export interface GwTorusDocPoint {
  id: string;
  title: string;
  text: string;
  cluster: number;
  torus: {
    x: number;
    y: number;
  };
  sourcePath?: string;
  sourceIndex?: number;
}

export interface GwTorusFlow {
  history: [number, number][];
  final: [number, number];
  start: [number, number];
  speeds: number[];
}

export interface GwMmssMetrics {
  V: number;
  S: number;
  N: number;
  D_f: number;
  QEC: number;
  CHSH: number;
  Q: number;
}

export interface GwTorusParameters {
  n_clusters: number;
  dt: number;
  friction: number;
  epsilon: number;
  max_steps: number;
  tol_speed: number;
  geometry_R: number;
  geometry_r: number;
  embedding_model?: string;
}

export interface GwTorusAnalysisResult {
  crystal_id: string;
  crystal_code: string;
  query: string;
  source: GwCrystalSourceRef;
  docs: GwTorusDocPoint[];
  torus: {
    R: number;
    r: number;
    epsilon?: number;
    clusters: number;
  };
  flow: GwTorusFlow;
  mmss: GwMmssMetrics;
  top_docs: Array<{
    rank: number;
    id: string;
    title: string;
    text: string;
    distance: number;
    cluster: number;
  }>;
  parameters: GwTorusParameters;
  stored_at?: string;
}

export interface GwPersistedTorusFile {
  version: 1;
  stored_at: string;
  analysis: GwTorusAnalysisResult;
}
