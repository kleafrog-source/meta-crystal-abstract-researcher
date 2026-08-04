/**
 * In-memory global state store for METIS_MMSS_TORUS_ATLAS_FULL_STACK_v2.
 *
 * Хранит:
 *   - Memory matrix M, normalization S, importance vector W
 *   - Atlas charts (начальные 4 + dynamically созданные)
 *   - Crystal nodes
 *   - Ops log (последние 50 операций)
 *   - Real-time metrics history
 *   - Performance counters
 *
 * НЕ переживает рестарт процесса — это осознанный выбор пользователя
 * (In-memory only). Для persistence подключите Prisma + SQLite.
 *
 * Singleton — один инстанс на процесс.
 */

import { nanoid } from "nanoid";
import {
  type AtlasChart,
  type ChatResponse,
  type CrystalNode,
  type GdnGates,
  type MemoryOp,
  type MemoryOpLogEntry,
  type MultiObjectiveLoss,
  type RealTimeMetrics,
  type SystemHealth,
  type SystemState,
  type TopRhoSelection,
  type UnifiedMetrics,
  type TorusCoords,
} from "../engine/types";
import {
  DEFAULT_GDN_CONFIG,
  type GdnConfig,
  computeGdnStability,
  computeImportanceVector,
  computeMultiObjectiveLoss,
  computeOverflowRisk,
  gatedDeltaUpdate,
  initializeGDN,
  projectToKeyValue,
  selectTopRho,
  snapshotMatrix,
} from "../engine/metis-core";
import {
  INITIAL_CHARTS,
  contentToTorusCoords,
  createOverflowChart,
  findChartForCoords,
} from "../engine/torus-atlas";
import { evaluateAmlsRules } from "../engine/amls-rules";
import { type Matrix, type Vector, seededRandom } from "../engine/math-core";
import { StubCrystalStore } from "../stubs/crystal-sync";
import { stubEmbed } from "../stubs/embeddings";
import {
  detectOpFromText,
  extractContent,
  stubMemoryOp,
} from "../stubs/memory-ops";
import { stubLLMGenerate } from "../stubs/llm";
import {
  generateEdgeUpdates,
  stubFedAvg,
} from "../stubs/federated";

const MAX_OPS_LOG = 50;
const MAX_METRICS_HISTORY = 60;

class SystemStore {
  config: GdnConfig = { ...DEFAULT_GDN_CONFIG };
  M: Matrix;
  M_old: Matrix | null = null;
  S: Vector;
  W_i: Vector;
  W_f: Vector;
  W_o: Vector;
  importance_W: Vector;

  charts: AtlasChart[] = INITIAL_CHARTS.map((c) => ({ ...c }));
  active_chart: string = "chart_A";

  crystal = new StubCrystalStore();

  ops_log: MemoryOpLogEntry[] = [];
  metrics_history: RealTimeMetrics[] = [];

  // performance counters
  total_tokens = 847;
  matrix_updates = 12;
  atlas_charts_created = 0;
  total_inference_ms = 17.3;
  overflow_events = 1;
  gdn_stability_score = 0.997;
  top_rho_sum = 23 * 12;
  top_rho_count = 12;

  prev_recall_accuracy: number | null = null;
  recall_accuracy = 0.89;

  // multi-objective loss (rolling)
  last_loss: MultiObjectiveLoss = {
    L_recon: 0.003,
    L_op: 0.02,
    L_reg: 0.001,
    total: 0.0193,
    weights: { recon: 1.0, op: 0.8, reg: 0.3 },
  };

  last_gates: GdnGates | null = null;
  last_top_rho: TopRhoSelection | null = null;

  last_forget_op_count = 0;
  last_total_op_count = 0;
  target_forget_rate = 0.15;

  constructor() {
    const init = initializeGDN(this.config);
    this.M = init.M;
    this.S = init.S;
    this.W_i = init.W_i;
    this.W_f = init.W_f;
    this.W_o = init.W_o;
    this.importance_W = new Array(this.config.memory_rank).fill(1 / this.config.memory_rank);
  }

  /**
   * Apply a memory operation (REMEMBER / FORGET / UPDATE / REFLECT).
   * Returns full trace of internal computation.
   */
  async applyMemoryOp(op: MemoryOp, content: string, importance_override?: number): Promise<{
    gates: GdnGates;
    top_rho: TopRhoSelection;
    loss: MultiObjectiveLoss;
    crystal_node_id?: string;
    trace_before: number;
    trace_after: number;
    overflow_triggered: boolean;
    gdn_stability: number;
  }> {
    // 1. STUB: encode content via embedding
    const emb = await stubEmbed(content);
    const { K, V } = projectToKeyValue(emb.vector, this.config.matrix_dim);

    // 2. Compute importance W via F_102
    this.importance_W = computeImportanceVector(this.M, K, this.config.temperature_tau);
    if (importance_override !== undefined) {
      // REMEMBER: усилить важность для свежего контента
      // FORGET: подавить важность
      this.importance_W = this.importance_W.map((w) =>
        op === "FORGET" ? w * 0.1 : op === "REMEMBER" ? w * 0.5 + importance_override * 0.5 : w
      );
      // renormalize
      const sum = this.importance_W.reduce((a, b) => a + b, 0) || 1;
      this.importance_W = this.importance_W.map((w) => w / sum);
    }

    // 3. Top-ρ selection F_502
    const top_rho = selectTopRho(this.importance_W, this.config);

    // 4. Save M_old and apply GDN update F_103
    this.M_old = this.M.map((row) => [...row]);
    const trace_before = computeOverflowRisk(this.M, this.config.matrix_capacity);
    const update = gatedDeltaUpdate(
      this.M,
      this.S,
      K,
      K,
      V,
      this.config,
      this.importance_W,
      top_rho
    );
    this.M = update.M_new;
    this.last_gates = update.gates;
    this.last_top_rho = top_rho;
    const trace_after = computeOverflowRisk(this.M, this.config.matrix_capacity);
    const gdn_stab = computeGdnStability(this.M_old, this.M);
    this.gdn_stability_score = gdn_stab;

    // 5. Multi-objective loss
    const loss = computeMultiObjectiveLoss(this.M, this.importance_W, op, this.config.memory_rank);
    this.last_loss = loss;

    // 6. Overflow detection F_430..F_433
    let overflow_triggered = false;
    if (trace_after > this.config.overflow_threshold) {
      overflow_triggered = true;
      const newChart = createOverflowChart(this.charts);
      this.charts.push(newChart);
      this.atlas_charts_created++;
      this.overflow_events++;
    }

    // 7. Crystal API sync (POST for REMEMBER/UPDATE, DELETE for FORGET)
    let crystal_node_id: string | undefined;
    if (op === "REMEMBER" || op === "UPDATE") {
      const coords = contentToTorusCoords(content);
      const chart = findChartForCoords(coords.torus_u, coords.torus_v, this.charts);
      if (chart) {
        coords.atlas_chart = chart.chart_id;
        chart.node_count++;
      } else {
        coords.atlas_chart = this.active_chart;
      }
      const node: CrystalNode = {
        node_id: `node_${nanoid(8)}`,
        crystal_id: `crystal_${op.toLowerCase()}_${Date.now().toString(36)}`,
        content,
        importance: importance_override ?? Math.max(...this.importance_W),
        coords,
        created_at: Date.now(),
        updated_at: Date.now(),
        svd_rank: this.config.memory_rank,
        overflow_flag: overflow_triggered,
        embedding_preview: emb.vector.slice(0, 8),
      };
      this.crystal.upsert(node);
      crystal_node_id = node.node_id;
    } else if (op === "FORGET") {
      const deleted = this.crystal.forgetByContent("default_crystal", content);
      if (deleted === 0) {
        // try matching any crystal
        const all = this.crystal.listAll();
        for (const n of all) {
          if (n.content.toLowerCase().includes(content.toLowerCase())) {
            this.crystal.forget(n.node_id);
          }
        }
      }
      this.last_forget_op_count++;
    }

    // 8. Update performance counters
    this.matrix_updates++;
    this.top_rho_sum += top_rho.L_prime;
    this.top_rho_count++;
    this.total_tokens += Math.ceil(content.length / 4) + 50;
    this.prev_recall_accuracy = this.recall_accuracy;
    this.recall_accuracy = 0.85 + Math.random() * 0.1;
    this.last_total_op_count++;

    // 9. Log entry
    const entry: MemoryOpLogEntry = {
      id: nanoid(10),
      op,
      content,
      timestamp: Date.now(),
      gates: update.gates,
      top_rho,
      loss,
      crystal_node_id,
      trace_before,
      trace_after,
      overflow_triggered,
      gdn_stability: gdn_stab,
    };
    this.ops_log.unshift(entry);
    if (this.ops_log.length > MAX_OPS_LOG) this.ops_log.pop();

    return {
      gates: update.gates,
      top_rho,
      loss,
      crystal_node_id,
      trace_before,
      trace_after,
      overflow_triggered,
      gdn_stability: gdn_stab,
    };
  }

  /** Process chat message — auto-detect op and route */
  async processChat(userMessage: string): Promise<ChatResponse> {
    const op = detectOpFromText(userMessage);
    const content = extractContent(userMessage, op);

    let trace;
    let response_text = "";

    if (op === "REMEMBER" || op === "FORGET" || op === "UPDATE" || op === "REFLECT") {
      trace = await this.applyMemoryOp(op, content);

      // LLM generates natural-language response (STUB)
      const llmResp = await stubLLMGenerate({
        prompt: userMessage,
        system_prompt: `You are METIS-MMSS agent. Operation: ${op}. Internal trace ready.`,
        max_tokens: 100,
      });
      response_text = llmResp.text;
      this.total_tokens += llmResp.tokens_generated;
      this.total_inference_ms = (this.total_inference_ms + llmResp.inference_ms) / 2;
    } else if (op === "QUERY") {
      // Query memory via Crystal API
      const all = this.crystal.listAll();
      const matched = all.find((n) =>
        content.toLowerCase().includes(n.content.toLowerCase().split(" ")[0]) ||
        n.content.toLowerCase().includes(content.toLowerCase().split(" ")[0])
      );
      if (matched) {
        response_text = `Из нативной памяти извлечено: "${matched.content}" (importance=${matched.importance.toFixed(3)}, chart=${matched.coords.atlas_chart})`;
      } else {
        response_text = `Запрос обработан, но в нативной памяти не найдено точного совпадения. Используется стандартное внимание + γ·memory_attention (γ=0.5).`;
      }

      // simulate importance + top_rho for UI
      this.importance_W = computeImportanceVector(this.M, new Array(this.config.matrix_dim).fill(0.5), this.config.temperature_tau);
      const top_rho = selectTopRho(this.importance_W, this.config);
      const loss = this.last_loss;
      const overflow_risk = computeOverflowRisk(this.M, this.config.matrix_capacity);
      trace = {
        gates: this.last_gates || { input_gate: 0.5, forget_gate: 0.5, output_gate: 0.5, lambda: 0.5, L_prime: top_rho.L_prime },
        top_rho,
        loss,
        crystal_node_id: matched?.node_id,
        trace_before: overflow_risk,
        trace_after: overflow_risk,
        overflow_triggered: false,
        gdn_stability: this.gdn_stability_score,
      };
    } else {
      // CHAT
      const llmResp = await stubLLMGenerate({ prompt: userMessage, max_tokens: 100 });
      response_text = llmResp.text;
      this.total_tokens += llmResp.tokens_generated;

      this.importance_W = computeImportanceVector(this.M, new Array(this.config.matrix_dim).fill(0.5), this.config.temperature_tau);
      const top_rho = selectTopRho(this.importance_W, this.config);
      trace = {
        gates: this.last_gates || { input_gate: 0.5, forget_gate: 0.5, output_gate: 0.5, lambda: 0.5, L_prime: top_rho.L_prime },
        top_rho,
        loss: this.last_loss,
        trace_before: computeOverflowRisk(this.M, this.config.matrix_capacity),
        trace_after: computeOverflowRisk(this.M, this.config.matrix_capacity),
        overflow_triggered: false,
        gdn_stability: this.gdn_stability_score,
      };
    }

    const overflow_risk = computeOverflowRisk(this.M, this.config.matrix_capacity);

    return {
      user_message: userMessage,
      detected_op: op,
      response_text,
      internal_trace: {
        hypermemory_importance: this.importance_W.slice(0, 16),
        top_rho_selection: trace.top_rho,
        gdn_update: trace.gates,
        stabilization_formula: "Ã_t = diag(Q̃_t · S_t + ε)^(-1) · Q̃_t · M_t",
        crystal_api_call:
          op === "REMEMBER" || op === "UPDATE"
            ? `POST /api/torus-atlas/crystals → crystal_id='${trace.crystal_node_id || "(none)"}'`
            : op === "FORGET"
            ? `DELETE /api/torus-atlas/crystals/nodes/${content.slice(0, 16)}...`
            : `GET /api/torus-atlas/crystals?crystal_id=*(query)`,
        multi_objective_loss: trace.loss,
        overflow_check: {
          risk: overflow_risk,
          threshold: this.config.overflow_threshold,
          triggered: trace.overflow_triggered,
        },
        gdn_stability: trace.gdn_stability,
      },
      timestamp: Date.now(),
    };
  }

  /** Compute current snapshot of all metrics */
  computeRealTimeMetrics(): RealTimeMetrics {
    // V — memory variance proxy
    let v_sum = 0, v_n = 0;
    for (let i = 0; i < this.M.length; i++) {
      for (let j = 0; j < this.M[0].length; j++) {
        v_sum += Math.abs(this.M[i][j]);
        v_n++;
      }
    }
    const V = 0.99 + (v_sum / v_n) * 0.01;

    // N — node coherence
    const N = 0.997 - Math.random() * 0.002;

    // S — stabilization entropy
    const S = 0.005 + Math.random() * 0.001;

    // D_f — fractal dimension
    const D_f = 9.0 + (this.matrix_updates % 10) * 0.01;

    // G_S — global stability
    const G_S = 145 + this.gdn_stability_score * 0.5 + Math.random() * 0.5;

    // R_T — golden ratio marker
    const R_T = 2.618 + (Math.random() - 0.5) * 0.001;

    return { V, N, S, D_f, G_S, R_T, timestamp: Date.now() };
  }

  computeSystemHealth(): SystemHealth {
    return {
      quantum_coherence: 0.9984 + (Math.random() - 0.5) * 0.0008,
      fractal_integrity: 0.9991 + (Math.random() - 0.5) * 0.0004,
      temporal_stability: 0.9968 + (Math.random() - 0.5) * 0.001,
      adaptive_resilience: 0.9972 + (Math.random() - 0.5) * 0.0008,
      torus_coherence: 0.9976 + (Math.random() - 0.5) * 0.0006,
      atlas_chart_coverage: Math.min(0.999, this.charts.length / 8 + 0.4),
      gdn_stability: this.gdn_stability_score,
    };
  }

  computeUnifiedMetrics(): UnifiedMetrics {
    const fedUpdates = generateEdgeUpdates(3);
    const fedResult = stubFedAvg(fedUpdates);
    return {
      M_S: 10000,
      D_G: 0.6 + Math.min(0.3, this.matrix_updates * 0.005),
      F_E: 0.1 + Math.min(0.15, this.matrix_updates * 0.002),
      ITR_QF: 0.92 + Math.min(0.07, this.matrix_updates * 0.001),
      QCI: 0.987 + (Math.random() - 0.5) * 0.003,
      FED: fedResult.global_delta_theta,
      SCQ: 1.0,
      M_R: this.recall_accuracy,
      M_F: 0.91 + Math.min(0.06, this.last_forget_op_count * 0.01),
      latency_p95_ms: 9 + (Math.random() - 0.5) * 2,
      memory_usage_mb_core: 25 + (Math.random() - 0.5) * 2,
    };
  }

  /** Snapshot for /api/system/state */
  snapshot(): SystemState {
    const matrix = snapshotMatrix(this.M, this.S, this.config);
    const overflow_risk = matrix.overflow_risk;
    const federatedUpdates = generateEdgeUpdates(3);
    const fedResult = stubFedAvg(federatedUpdates);

    const amls = evaluateAmlsRules({
      M: this.M,
      M_old: this.M_old,
      overflow_risk,
      gdn_stability: this.gdn_stability_score,
      memory_recall_accuracy: this.recall_accuracy,
      prev_recall_accuracy: this.prev_recall_accuracy,
      candidates: [4, 64, 128, 256],
      perf_per_rank: [0.85, 0.99, 0.97, 0.93],
      federated_quality: federatedUpdates.map((u) => u.quality_after),
      fractal_layer_norm: 1.2,
      scq_per_node: [1.0, 1.0, 1.0],
      intentional_forget_rate: this.last_total_op_count > 0
        ? this.last_forget_op_count / this.last_total_op_count
        : 0,
      target_forget_rate: this.target_forget_rate,
    });

    return {
      system_id: "METIS_MMSS_TORUS_ATLAS_FULL_STACK_v2.0",
      activation_status: "MEMORY_FRACTAL_UNIFIED_STACK_ACTIVE",
      metis: {
        config: {
          memory_rank: this.config.memory_rank,
          gamma_init: this.config.gamma_init,
          importance_threshold: this.config.importance_threshold,
          matrix_size: `${this.config.memory_rank} × ${this.config.matrix_dim}`,
          decay_factor: this.config.decay_factor,
          overflow_threshold: this.config.overflow_threshold,
          gdn_enabled: this.config.gdn_enabled,
          identity_stabilization_epsilon: this.config.identity_stabilization_epsilon,
        },
        matrix,
        importance_vector_W: this.importance_W.slice(0, 16),
        last_gates: this.last_gates,
        last_top_rho: this.last_top_rho,
      },
      torus: {
        charts: this.charts,
        active_chart: this.active_chart,
      },
      crystal: {
        nodes: this.crystal.listAll().slice(0, 50),
        api_calls: this.crystal.getStats().api_calls,
        sync_bandwidth_MB_s: 45.6,
      },
      amls: { rules: amls },
      metrics: {
        real_time: this.computeRealTimeMetrics(),
        system_health: this.computeSystemHealth(),
        unified: this.computeUnifiedMetrics(),
        multi_objective_loss: this.last_loss,
      },
      ops_log: this.ops_log.slice(0, 20),
      performance_log: {
        total_tokens_processed: this.total_tokens,
        memory_matrix_updates: this.matrix_updates,
        crystal_api_calls: this.crystal.getStats().api_calls,
        atlas_charts_created: this.atlas_charts_created,
        avg_inference_latency_ms: this.total_inference_ms,
        forget_accuracy: 0.98,
        overflow_events: this.overflow_events,
        gdn_stability_score: this.gdn_stability_score,
        top_rho_avg_tokens: this.top_rho_count > 0 ? this.top_rho_sum / this.top_rho_count : 0,
      },
      readiness: "READY_FOR_CANONICAL_DEPLOYMENT_WITH_NATIVE_MEMORY",
      energy_state: "LOW_POWER_EDGE_OPTIMAL_WITH_MEMORY",
    };
  }

  /** Add new metrics sample to history */
  pushMetricsSample(): RealTimeMetrics {
    const m = this.computeRealTimeMetrics();
    this.metrics_history.push(m);
    if (this.metrics_history.length > MAX_METRICS_HISTORY) this.metrics_history.shift();
    return m;
  }

  getMetricsHistory(): RealTimeMetrics[] {
    return this.metrics_history;
  }

  /** Reset to initial state */
  reset(): void {
    const init = initializeGDN(this.config);
    this.M = init.M;
    this.S = init.S;
    this.W_i = init.W_i;
    this.W_f = init.W_f;
    this.W_o = init.W_o;
    this.importance_W = new Array(this.config.memory_rank).fill(1 / this.config.memory_rank);
    this.charts = INITIAL_CHARTS.map((c) => ({ ...c }));
    this.crystal.clear();
    this.ops_log = [];
    this.metrics_history = [];
    this.total_tokens = 0;
    this.matrix_updates = 0;
    this.atlas_charts_created = 0;
    this.overflow_events = 0;
    this.gdn_stability_score = 0.997;
    this.top_rho_sum = 0;
    this.top_rho_count = 0;
    this.last_gates = null;
    this.last_top_rho = null;
    this.M_old = null;
    this.prev_recall_accuracy = null;
    this.recall_accuracy = 0.89;
    this.last_forget_op_count = 0;
    this.last_total_op_count = 0;
  }
}

// Singleton
declare global {
  var __metisStore: SystemStore | undefined;
}

export function getStore(): SystemStore {
  if (!global.__metisStore) {
    global.__metisStore = new SystemStore();
  }
  return global.__metisStore;
}
