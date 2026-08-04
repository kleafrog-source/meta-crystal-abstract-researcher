export type MemoryOp = "REMEMBER" | "FORGET" | "UPDATE" | "REFLECT";
export type DetectedOp = MemoryOp | "QUERY" | "CHAT";
export type ProviderMode = "stub" | "vllm" | "ollama";

export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface TorusCoords {
  torus_u: number;
  torus_v: number;
  atlas_chart: string;
}

export interface CrystalNode {
  node_id: string;
  crystal_id: string;
  content: string;
  importance: number;
  coords: TorusCoords;
  created_at: number;
  updated_at: number;
  svd_rank: number;
  overflow_flag: boolean;
  embedding_preview: number[];
}

export interface GdnGates {
  input_gate: number;
  forget_gate: number;
  output_gate: number;
  lambda: number;
  L_prime: number;
}

export interface MemoryMatrixSnapshot {
  rank: number;
  dim: number;
  flat: number[];
  S: number[];
  trace: number;
  capacity: number;
  overflow_risk: number;
}

export interface TopRhoSelection {
  L_prime: number;
  K_min: number;
  rho_threshold: number;
  temperature_tau: number;
  probabilities: number[];
  cumulative: number[];
  selected_indices: number[];
}

export interface RealTimeMetrics {
  V: number;
  N: number;
  S: number;
  D_f: number;
  G_S: number;
  R_T: number;
  timestamp: number;
}

export interface SystemHealth {
  quantum_coherence: number;
  fractal_integrity: number;
  temporal_stability: number;
  adaptive_resilience: number;
  torus_coherence: number;
  atlas_chart_coverage: number;
  gdn_stability: number;
}

export interface UnifiedMetrics {
  M_S: number;
  D_G: number;
  F_E: number;
  ITR_QF: number;
  QCI: number;
  FED: number;
  SCQ: number;
  M_R: number;
  M_F: number;
  latency_p95_ms: number;
  memory_usage_mb_core: number;
}

export interface AtlasChart {
  chart_id: string;
  u_range: [number, number];
  v_range: [number, number];
  resolution: number;
  node_count: number;
  created_at: number;
  created_due_to_overflow: boolean;
}

export interface MultiObjectiveLoss {
  L_recon: number;
  L_op: number;
  L_reg: number;
  total: number;
  weights?: { recon: number; op: number; reg: number };
}

export interface MemoryOpLogEntry {
  id: string;
  op: MemoryOp;
  content: string;
  importance: number;
  timestamp: number;
  gates: GdnGates;
  top_rho: TopRhoSelection;
  loss: MultiObjectiveLoss;
  crystal_node_id?: string;
  trace_before: number;
  trace_after: number;
  overflow_triggered: boolean;
  gdn_stability: number;
  metrics: RealTimeMetrics;
}

export interface ChatResponse {
  user_message: string;
  detected_op: DetectedOp;
  response_text: string;
  model_id: string;
  internal_trace: {
    hypermemory_importance: number[];
    top_rho_selection: TopRhoSelection;
    gdn_update: GdnGates;
    crystal_api_call: string;
    multi_objective_loss: MultiObjectiveLoss;
    overflow_check: { risk: number; threshold: number; triggered: boolean };
    gdn_stability: number;
  };
  timestamp: number;
}

export interface MetisProviderConfig {
  llmProvider: ProviderMode;
  embeddingProvider: ProviderMode;
  vllmBaseUrl: string;
  vllmModel: string;
  vllmEmbeddingModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEmbeddingModel: string;
  temperature: number;
  maxTokens: number;
  requestTimeoutMs: number;
}

export interface SystemState {
  system_id: string;
  activation_status: string;
  metis: {
    config: {
      memory_rank: number;
      gamma_init: number;
      importance_threshold: number;
      matrix_size: string;
      decay_factor: number;
      overflow_threshold: number;
      gdn_enabled: boolean;
      identity_stabilization_epsilon: number;
    };
    matrix: MemoryMatrixSnapshot;
    importance_vector_W: number[];
    last_gates: GdnGates | null;
    last_top_rho: TopRhoSelection | null;
  };
  torus: {
    charts: AtlasChart[];
    active_chart: string;
  };
  crystal: {
    nodes: CrystalNode[];
    api_calls: number;
    sync_bandwidth_MB_s: number;
  };
  amls: {
    rules: Array<{
      id: string;
      name: string;
      formula: string;
      function_ru: string;
      value: number;
      threshold: number;
      triggered: boolean;
    }>;
  };
  metrics: {
    real_time: RealTimeMetrics;
    system_health: SystemHealth;
    unified: UnifiedMetrics;
    multi_objective_loss: MultiObjectiveLoss;
  };
  ops_log: MemoryOpLogEntry[];
  performance_log: {
    total_tokens_processed: number;
    memory_matrix_updates: number;
    crystal_api_calls: number;
    atlas_charts_created: number;
    avg_inference_latency_ms: number;
    forget_accuracy: number;
    overflow_events: number;
    gdn_stability_score: number;
    top_rho_avg_tokens: number;
  };
  providers: MetisProviderConfig;
  readiness: string;
  energy_state: string;
}
