export interface GwGhostContinueRequest {
  crystalId: string;
  startFrame: number;
  steps: number;
}

export interface GwGhostPoint {
  x: number;
  y: number;
}

export interface GwGhostContinueResult {
  crystalId: string;
  crystalCode: string;
  startFrame: number;
  steps: number;
  oscillationFrame: number | null;
  baseHistory: GwGhostPoint[];
  ghostHistory: GwGhostPoint[];
  finalPoint: GwGhostPoint | null;
  parameters: {
    dt: number;
    friction: number;
    epsilon: number;
    geometry_R: number;
    geometry_r: number;
    max_steps: number;
    tol_speed: number;
    n_clusters: number;
    embedding_model?: string;
  };
}
