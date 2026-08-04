/**
 * METIS_MMSS_TORUS_ATLAS_FULL_STACK_v2 — Type Definitions
 * Shared types for the engine, store, and API layers.
 *
 * Bilingual:
 *   - Comments: Russian (matches source spec)
 *   - Identifiers: English (matches F_101/F_502 op codes)
 */

export type MemoryOp = "REMEMBER" | "FORGET" | "UPDATE" | "REFLECT";

/** Координаты на торе (u, v) ∈ [0, 1] × [0, 1] */
export interface TorusCoords {
  torus_u: number;
  torus_v: number;
  atlas_chart: string;
}

/** Crystal API node — атомарная единица памяти в распределённом sync-слое */
export interface CrystalNode {
  node_id: string;
  crystal_id: string;
  content: string;
  importance: number; // W[i] ∈ [0, 1]
  coords: TorusCoords;
  created_at: number;
  updated_at: number;
  svd_rank: number;
  overflow_flag: boolean;
  embedding_preview: number[]; // первые 8 компонент z_q ∈ R^384
}

/** GDN gate values для одного обновления памяти */
export interface GdnGates {
  input_gate: number; // σ(W_i · [H_t, M_t])
  forget_gate: number; // σ(W_f · [H_t, M_t])
  output_gate: number; // σ(W_o · [H_t, M_t])
  lambda: number; // λ — retention coefficient (= input_gate)
  L_prime: number; // L'_t — adaptive token count from top-ρ selection
}

/** Снимок memory matrix M (сжатая, для визуализации) */
export interface MemoryMatrixSnapshot {
  rank: number; // R (e.g. 32 для визуализации)
  dim: number; // D
  /** R×D flattened row-major; визуализируется как heatmap */
  flat: number[];
  /** S — нормализующий вектор */
  S: number[];
  /** Trace Tr(M·M^T) для overflow detection */
  trace: number;
  /** matrix_capacity для нормировки overflow_risk */
  capacity: number;
  /** overflow_risk = Tr(M·M^T) / matrix_capacity */
  overflow_risk: number;
}

/** Top-ρ selection результат */
export interface TopRhoSelection {
  L_prime: number; // выбранное L'_t
  K_min: number; // 16
  rho_threshold: number; // 0.8
  temperature_tau: number; // 0.7
  probabilities: number[]; // sorted desc p_(1) >= p_(2) >= ...
  cumulative: number[]; // кумулятивные суммы
  selected_indices: number[];
}

/** Real-time monitoring metrics V/N/S/D_f/G_S/R_T */
export interface RealTimeMetrics {
  V: number; // target 0.996 — memory variance
  N: number; // target 0.997 — node coherence
  S: number; // target 0.005 — entropy / stabilization
  D_f: number; // target 9.008 — fractal dimension
  G_S: number; // target 145.32 — global stability
  R_T: number; // target 2.61803 — golden ratio marker
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

/** Unified Metrics Framework (из SYNTHESIZED_MMSS_SYSTEM) */
export interface UnifiedMetrics {
  M_S: number; // Memory Savings Ratio — 10000
  D_G: number; // Distillation Coverage — 0.6
  F_E: number; // Federated Edge Contribution — 0.1
  ITR_QF: number; // Quantum-Fractal Isomorphism Rate — 0.92
  QCI: number; // Quantum Coherence Index — 0.987
  FED: number; // Federated Efficiency Delta — 0.94
  SCQ: number; // Self-Containment Quotient — 1.0
  M_R: number; // Memory Retention Rate — 0.89
  M_F: number; // Memory Forgetting Control — 0.91
  latency_p95_ms: number;
  memory_usage_mb_core: number;
}

/** Atlas chart — покрытие 2D-тора */
export interface AtlasChart {
  chart_id: string; // "chart_A" | "chart_B" | ...
  u_range: [number, number];
  v_range: [number, number];
  resolution: number; // 256
  node_count: number;
  created_at: number;
  created_due_to_overflow: boolean;
}

/** Multi-objective loss breakdown */
export interface MultiObjectiveLoss {
  L_recon: number; // MSE(M_reconstructed, M_target)
  L_op: number; // CrossEntropy(forget_command, "I don't know")
  L_reg: number; // L2 + KL(p || uniform)
  total: number;
  weights: { recon: number; op: number; reg: number };
}

/** Запись в логе операций памяти */
export interface MemoryOpLogEntry {
  id: string;
  op: MemoryOp;
  content: string;
  timestamp: number;
  gates: GdnGates;
  top_rho: TopRhoSelection;
  loss: MultiObjectiveLoss;
  crystal_node_id?: string;
  trace_before: number;
  trace_after: number;
  overflow_triggered: boolean;
  gdn_stability: number;
}

/** Полное состояние системы — отдается через /api/system/state */
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
  readiness: string;
  energy_state: string;
}

/** Сценарий ответа чат-агента */
export interface ChatResponse {
  user_message: string;
  detected_op: MemoryOp | "QUERY" | "CHAT";
  response_text: string;
  internal_trace: {
    hypermemory_importance: number[];
    top_rho_selection: TopRhoSelection;
    gdn_update: GdnGates;
    stabilization_formula: string;
    crystal_api_call: string;
    multi_objective_loss: MultiObjectiveLoss;
    overflow_check: { risk: number; threshold: number; triggered: boolean };
    gdn_stability: number;
  };
  timestamp: number;
}
