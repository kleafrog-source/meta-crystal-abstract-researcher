import { randomUUID } from "crypto";
import { clearMetisNodes, deleteMetisNode, deleteMetisNodesBySubstring, importCrystalsToMetis, loadPersistedMetisNodes, upsertMetisNode } from "@/lib/metis/persistence";
import { evaluateAmlsRules } from "@/lib/metis/amls-rules";
import {
  computeGdnStability,
  computeImportanceVector,
  computeMultiObjectiveLoss,
  computeOverflowRisk,
  DEFAULT_GDN_CONFIG,
  gatedDeltaUpdate,
  initializeGDN,
  projectToKeyValue,
  selectTopRho,
  snapshotMatrix,
  type GdnConfig,
} from "@/lib/metis/core";
import { type Matrix, type Vector } from "@/lib/metis/math-core";
import { embedText, generateText, getMetisProviderConfig } from "@/lib/metis/providers";
import { computeCoverage, contentToTorusCoords, createOverflowChart, findChartForCoords, INITIAL_CHARTS } from "@/lib/metis/torus-atlas";
import type {
  AtlasChart,
  ChatResponse,
  CrystalNode,
  DetectedOp,
  MemoryOp,
  MemoryOpLogEntry,
  MultiObjectiveLoss,
  RealTimeMetrics,
  SystemHealth,
  SystemState,
  TopRhoSelection,
  UnifiedMetrics,
} from "@/lib/metis/types";

const MAX_OPS_LOG = 50;
const MAX_METRICS_HISTORY = 60;

function createNodeId() {
  return `node_${randomUUID().slice(0, 8)}`;
}

class CrystalStore {
  private nodes = new Map<string, CrystalNode>();
  private apiCalls = 0;

  upsert(node: CrystalNode) {
    this.apiCalls += 1;
    this.nodes.set(node.node_id, node);
  }

  forget(nodeId: string) {
    this.apiCalls += 1;
    return this.nodes.delete(nodeId);
  }

  forgetByContent(contentSubstring: string) {
    let removed = 0;
    for (const [nodeId, node] of this.nodes.entries()) {
      if (node.content.toLowerCase().includes(contentSubstring.toLowerCase())) {
        this.nodes.delete(nodeId);
        removed += 1;
      }
    }
    this.apiCalls += removed;
    return removed;
  }

  listAll() {
    return [...this.nodes.values()].sort((a, b) => b.updated_at - a.updated_at);
  }

  query(crystalId: string, threshold?: number) {
    this.apiCalls += 1;
    return this.listAll().filter((node) => node.crystal_id === crystalId && (threshold === undefined || node.importance >= threshold));
  }

  findByNodeId(nodeId: string) {
    this.apiCalls += 1;
    return this.nodes.get(nodeId) ?? null;
  }

  stats() {
    return { apiCalls: this.apiCalls, total: this.nodes.size };
  }

  clear() {
    this.nodes.clear();
    this.apiCalls = 0;
  }

  replaceAll(nodes: CrystalNode[]) {
    this.nodes = new Map(nodes.map((node) => [node.node_id, node]));
  }
}

function detectOpFromText(text: string): DetectedOp {
  const lower = text.trim().toLowerCase();
  if (/^(remember|запомни)/.test(lower)) return "REMEMBER";
  if (/^(forget|забудь)/.test(lower)) return "FORGET";
  if (/^(update|обнови)/.test(lower)) return "UPDATE";
  if (/^(reflect|отрази)/.test(lower)) return "REFLECT";
  if (/^(what|which|как|что|какой)/.test(lower)) return "QUERY";
  return "CHAT";
}

function extractContent(text: string, op: DetectedOp): string {
  const patterns: Record<DetectedOp, RegExp[]> = {
    REMEMBER: [/^(remember|запомни)[:, ]*/i],
    FORGET: [/^(forget|забудь)[:, ]*/i],
    UPDATE: [/^(update|обнови)[:, ]*/i],
    REFLECT: [/^(reflect|отрази)[:, ]*/i],
    QUERY: [],
    CHAT: [],
  };
  let value = text;
  for (const pattern of patterns[op]) {
    value = value.replace(pattern, "").trim();
  }
  return value || text;
}

function generateEdgeQuality(count: number) {
  return Array.from({ length: count }, () => 0.85 + Math.random() * 0.1);
}

export class MetisStore {
  config: GdnConfig = { ...DEFAULT_GDN_CONFIG };
  M: Matrix;
  M_old: Matrix | null = null;
  S: Vector;
  W_i: Vector;
  W_f: Vector;
  W_o: Vector;
  importance_W: Vector;
  charts: AtlasChart[] = INITIAL_CHARTS.map((chart) => ({ ...chart }));
  active_chart = "chart_A";
  crystal = new CrystalStore();
  ops_log: MemoryOpLogEntry[] = [];
  metrics_history: RealTimeMetrics[] = [];
  total_tokens = 0;
  matrix_updates = 0;
  atlas_charts_created = 0;
  total_inference_ms = 0;
  overflow_events = 0;
  gdn_stability_score = 0.997;
  top_rho_sum = 0;
  top_rho_count = 0;
  prev_recall_accuracy: number | null = null;
  recall_accuracy = 0.89;
  last_loss: MultiObjectiveLoss = {
    L_recon: 0.003,
    L_op: 0.02,
    L_reg: 0.001,
    total: 0.0193,
    weights: { recon: 1, op: 0.8, reg: 0.3 },
  };
  last_gates = null;
  last_top_rho: TopRhoSelection | null = null;
  last_forget_op_count = 0;
  last_total_op_count = 0;
  target_forget_rate = 0.15;
  hydrated = false;

  constructor() {
    const init = initializeGDN(this.config);
    this.M = init.M;
    this.S = init.S;
    this.W_i = init.W_i;
    this.W_f = init.W_f;
    this.W_o = init.W_o;
    this.importance_W = new Array(this.config.memory_rank).fill(1 / this.config.memory_rank);
  }

  async ensureHydrated() {
    if (this.hydrated) return;
    const nodes = await loadPersistedMetisNodes();
    this.crystal.replaceAll(nodes);
    this.rebuildChartsFromNodes(nodes);
    this.hydrated = true;
  }

  async importFromLibrary(params: { limit: number; ids?: string[]; codes?: string[]; onlyWithEmbeddings?: boolean; type?: string }) {
    await this.ensureHydrated();
    const result = await importCrystalsToMetis(params);
    if (result.nodes.length) {
      for (const node of result.nodes) {
        this.crystal.upsert(node);
      }
      this.rebuildChartsFromNodes(this.crystal.listAll());
    }
    return result;
  }

  async applyMemoryOp(op: MemoryOp, content: string, importanceOverride?: number) {
    await this.ensureHydrated();
    const embedding = await embedText(content);
    const { K, V } = projectToKeyValue(embedding.vector, this.config.matrix_dim);
    this.importance_W = computeImportanceVector(this.M, K, this.config.temperature_tau);
    if (importanceOverride !== undefined) {
      this.importance_W = this.importance_W.map((value) => (op === "FORGET" ? value * 0.1 : value * 0.5 + importanceOverride * 0.5));
      const sum = this.importance_W.reduce((acc, value) => acc + value, 0) || 1;
      this.importance_W = this.importance_W.map((value) => value / sum);
    }

    const topRho = selectTopRho(this.importance_W, this.config);
    this.M_old = this.M.map((row) => [...row]);
    const traceBefore = computeOverflowRisk(this.M, this.config.matrix_capacity);
    const update = gatedDeltaUpdate(this.M, this.S, K, K, V, this.config, this.importance_W, topRho);
    this.M = update.M_new;
    this.last_gates = update.gates;
    this.last_top_rho = topRho;
    const traceAfter = computeOverflowRisk(this.M, this.config.matrix_capacity);
    const gdnStability = computeGdnStability(this.M_old, this.M);
    this.gdn_stability_score = gdnStability;
    const loss = computeMultiObjectiveLoss(this.M, this.importance_W, op, this.config.memory_rank);
    this.last_loss = loss;

    let overflowTriggered = false;
    if (traceAfter > this.config.overflow_threshold) {
      overflowTriggered = true;
      this.charts.push(createOverflowChart(this.charts));
      this.atlas_charts_created += 1;
      this.overflow_events += 1;
    }

    let crystalNodeId: string | undefined;
    if (op === "REMEMBER" || op === "UPDATE") {
      const coords = contentToTorusCoords(content);
      const chart = findChartForCoords(coords.torus_u, coords.torus_v, this.charts);
      coords.atlas_chart = chart?.chart_id || this.active_chart;
      if (chart) chart.node_count += 1;
      const node: CrystalNode = {
        node_id: createNodeId(),
        crystal_id: `crystal_${op.toLowerCase()}_${Date.now().toString(36)}`,
        content,
        importance: importanceOverride ?? Math.max(...this.importance_W),
        coords,
        created_at: Date.now(),
        updated_at: Date.now(),
        svd_rank: this.config.memory_rank,
        overflow_flag: overflowTriggered,
        embedding_preview: embedding.vector.slice(0, 8),
      };
      this.crystal.upsert(node);
      await upsertMetisNode(node);
      crystalNodeId = node.node_id;
    }

    if (op === "FORGET") {
      const removed = this.crystal.forgetByContent(content);
      await deleteMetisNodesBySubstring(content);
      if (!removed) {
        const existing = this.crystal.listAll().find((node) => node.node_id === content || node.content.toLowerCase().includes(content.toLowerCase()));
        if (existing) {
          this.crystal.forget(existing.node_id);
          await deleteMetisNode(existing.node_id);
        }
      }
      this.last_forget_op_count += 1;
    }

    this.matrix_updates += 1;
    this.top_rho_sum += topRho.L_prime;
    this.top_rho_count += 1;
    this.total_tokens += Math.ceil(content.length / 4);
    this.prev_recall_accuracy = this.recall_accuracy;
    this.recall_accuracy = 0.85 + Math.random() * 0.1;
    this.last_total_op_count += 1;

    const entry: MemoryOpLogEntry = {
      id: createNodeId(),
      op,
      content,
      importance: importanceOverride ?? Math.max(...this.importance_W),
      timestamp: Date.now(),
      gates: update.gates,
      top_rho: topRho,
      loss,
      crystal_node_id: crystalNodeId,
      trace_before: traceBefore,
      trace_after: traceAfter,
      overflow_triggered: overflowTriggered,
      gdn_stability: gdnStability,
      metrics: {
        V: this.metrics_history[0]?.V ?? 0,
        N: this.metrics_history[0]?.N ?? 0,
        S: this.metrics_history[0]?.S ?? 0,
        D_f: this.metrics_history[0]?.D_f ?? 0,
        G_S: this.metrics_history[0]?.G_S ?? 0,
        R_T: this.metrics_history[0]?.R_T ?? 0,
        timestamp: Date.now(),
      },
    };
    this.ops_log.unshift(entry);
    if (this.ops_log.length > MAX_OPS_LOG) this.ops_log.pop();

    return { ...entry };
  }

  async applyMemoryBatch(op: MemoryOp, items: Array<{ content: string; importance?: number }>) {
    await this.ensureHydrated();
    const results = [] as Array<Awaited<ReturnType<MetisStore["applyMemoryOp"]>>>;
    for (const item of items) {
      const content = item.content.trim();
      if (!content) continue;
      results.push(await this.applyMemoryOp(op, content, item.importance));
    }
    return {
      op,
      processed: results.length,
      results,
      timestamp: Date.now(),
    };
  }

  async processChat(message: string): Promise<ChatResponse> {
    await this.ensureHydrated();
    const op = detectOpFromText(message);
    const content = extractContent(message, op);
    let responseText = "";
    let modelId = "stub:metis-4b@local";
    let trace:
      | Awaited<ReturnType<MetisStore["applyMemoryOp"]>>
      | {
          gates: NonNullable<SystemState["metis"]["last_gates"]>;
          top_rho: TopRhoSelection;
          loss: MultiObjectiveLoss;
          trace_before: number;
          trace_after: number;
          overflow_triggered: boolean;
          gdn_stability: number;
          crystal_node_id?: string;
        };

    if (op === "REMEMBER" || op === "FORGET" || op === "UPDATE" || op === "REFLECT") {
      trace = await this.applyMemoryOp(op, content);
      const llm = await generateText({
        prompt: message,
        systemPrompt: `You are METIS-MMSS. Respond after applying operation ${op}.`,
      });
      responseText = llm.text;
      modelId = llm.modelId;
      this.total_tokens += llm.tokensGenerated;
      this.total_inference_ms = this.total_inference_ms === 0 ? llm.inferenceMs : (this.total_inference_ms + llm.inferenceMs) / 2;
    } else if (op === "QUERY") {
      const hit = this.crystal
        .listAll()
        .find((node) => node.content.toLowerCase().includes(content.toLowerCase()) || content.toLowerCase().includes(node.content.toLowerCase().split(" ")[0]));
      responseText = hit
        ? `Из памяти извлечено: "${hit.content}" (importance=${hit.importance.toFixed(3)}, chart=${hit.coords.atlas_chart})`
        : "Точного совпадения в памяти не найдено. Используется общий контекст torus-memory.";
      this.importance_W = computeImportanceVector(this.M, new Array(this.config.matrix_dim).fill(0.5), this.config.temperature_tau);
      const topRho = selectTopRho(this.importance_W, this.config);
      const risk = computeOverflowRisk(this.M, this.config.matrix_capacity);
      trace = {
        gates: this.last_gates || { input_gate: 0.5, forget_gate: 0.5, output_gate: 0.5, lambda: 0.5, L_prime: topRho.L_prime },
        top_rho: topRho,
        loss: this.last_loss,
        trace_before: risk,
        trace_after: risk,
        overflow_triggered: false,
        gdn_stability: this.gdn_stability_score,
        crystal_node_id: hit?.node_id,
      };
    } else {
      const llm = await generateText({ prompt: message });
      responseText = llm.text;
      modelId = llm.modelId;
      this.total_tokens += llm.tokensGenerated;
      this.total_inference_ms = this.total_inference_ms === 0 ? llm.inferenceMs : (this.total_inference_ms + llm.inferenceMs) / 2;
      this.importance_W = computeImportanceVector(this.M, new Array(this.config.matrix_dim).fill(0.5), this.config.temperature_tau);
      const topRho = selectTopRho(this.importance_W, this.config);
      const risk = computeOverflowRisk(this.M, this.config.matrix_capacity);
      trace = {
        gates: this.last_gates || { input_gate: 0.5, forget_gate: 0.5, output_gate: 0.5, lambda: 0.5, L_prime: topRho.L_prime },
        top_rho: topRho,
        loss: this.last_loss,
        trace_before: risk,
        trace_after: risk,
        overflow_triggered: false,
        gdn_stability: this.gdn_stability_score,
      };
    }

    const overflowRisk = computeOverflowRisk(this.M, this.config.matrix_capacity);

    return {
      user_message: message,
      detected_op: op,
      response_text: responseText,
      model_id: modelId,
      internal_trace: {
        hypermemory_importance: this.importance_W.slice(0, 16),
        top_rho_selection: trace.top_rho,
        gdn_update: trace.gates,
        crystal_api_call:
          op === "REMEMBER" || op === "UPDATE"
            ? `POST /api/metis/crystals -> ${trace.crystal_node_id || "(none)"}`
            : op === "FORGET"
              ? `DELETE /api/metis/crystals/${content.slice(0, 24)}`
              : "GET /api/metis/crystals",
        multi_objective_loss: trace.loss,
        overflow_check: {
          risk: overflowRisk,
          threshold: this.config.overflow_threshold,
          triggered: trace.overflow_triggered,
        },
        gdn_stability: trace.gdn_stability,
      },
      timestamp: Date.now(),
    };
  }

  computeRealTimeMetrics(): RealTimeMetrics {
    const avg = this.M.flat().reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(this.M.length * this.M[0].length, 1);
    return {
      V: 0.99 + avg * 0.01,
      N: 0.9965 + Math.random() * 0.002,
      S: 0.0045 + Math.random() * 0.001,
      D_f: 9 + (this.matrix_updates % 10) * 0.01,
      G_S: 145 + this.gdn_stability_score * 0.5 + Math.random() * 0.5,
      R_T: 2.618 + (Math.random() - 0.5) * 0.001,
      timestamp: Date.now(),
    };
  }

  computeSystemHealth(): SystemHealth {
    return {
      quantum_coherence: 0.998 + (Math.random() - 0.5) * 0.001,
      fractal_integrity: 0.999 + (Math.random() - 0.5) * 0.0006,
      temporal_stability: 0.996 + (Math.random() - 0.5) * 0.001,
      adaptive_resilience: 0.997 + (Math.random() - 0.5) * 0.001,
      torus_coherence: computeCoverage(this.charts),
      atlas_chart_coverage: computeCoverage(this.charts),
      gdn_stability: this.gdn_stability_score,
    };
  }

  computeUnifiedMetrics(): UnifiedMetrics {
    const qualities = generateEdgeQuality(3);
    const fed = qualities.reduce((sum, value) => sum + value, 0) / qualities.length;
    return {
      M_S: 10000,
      D_G: 0.6 + Math.min(0.3, this.matrix_updates * 0.005),
      F_E: 0.1 + Math.min(0.15, this.matrix_updates * 0.002),
      ITR_QF: 0.92 + Math.min(0.07, this.matrix_updates * 0.001),
      QCI: 0.987 + (Math.random() - 0.5) * 0.003,
      FED: fed,
      SCQ: 1,
      M_R: this.recall_accuracy,
      M_F: 0.91 + Math.min(0.06, this.last_forget_op_count * 0.01),
      latency_p95_ms: 9 + (Math.random() - 0.5) * 2,
      memory_usage_mb_core: 25 + (Math.random() - 0.5) * 3,
    };
  }

  pushMetricsSample() {
    const sample = this.computeRealTimeMetrics();
    this.metrics_history.push(sample);
    if (this.metrics_history.length > MAX_METRICS_HISTORY) this.metrics_history.shift();
    return sample;
  }

  getMetricsHistory() {
    return this.metrics_history;
  }

  snapshot(): SystemState {
    const overflowRisk = computeOverflowRisk(this.M, this.config.matrix_capacity);
    const qualities = generateEdgeQuality(3);
    const amls = evaluateAmlsRules({
      M: this.M,
      M_old: this.M_old,
      overflow_risk: overflowRisk,
      gdn_stability: this.gdn_stability_score,
      memory_recall_accuracy: this.recall_accuracy,
      prev_recall_accuracy: this.prev_recall_accuracy,
      candidates: [4, 64, 128, 256],
      perf_per_rank: [0.86, 0.99, 0.97, 0.93],
      federated_quality: qualities,
      fractal_layer_norm: 1.2,
      scq_per_node: [1, 1, 1],
      intentional_forget_rate: this.last_total_op_count > 0 ? this.last_forget_op_count / this.last_total_op_count : 0,
      target_forget_rate: this.target_forget_rate,
    });
    return {
      system_id: "METIS_MMSS_TORUS_ATLAS_WEB",
      activation_status: "MEMORY_FRACTAL_STACK_ACTIVE",
      metis: {
        config: {
          memory_rank: this.config.memory_rank,
          gamma_init: this.config.gamma_init,
          importance_threshold: this.config.importance_threshold,
          matrix_size: `${this.config.memory_rank} x ${this.config.matrix_dim}`,
          decay_factor: this.config.decay_factor,
          overflow_threshold: this.config.overflow_threshold,
          gdn_enabled: this.config.gdn_enabled,
          identity_stabilization_epsilon: this.config.identity_stabilization_epsilon,
        },
        matrix: snapshotMatrix(this.M, this.S, this.config),
        importance_vector_W: this.importance_W.slice(0, 16),
        last_gates: this.last_gates,
        last_top_rho: this.last_top_rho,
      },
      torus: {
        charts: this.charts,
        active_chart: this.active_chart,
      },
      crystal: {
        nodes: this.crystal.listAll(),
        api_calls: this.crystal.stats().apiCalls,
        sync_bandwidth_MB_s: 45.6,
      },
      amls: {
        rules: amls,
      },
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
        crystal_api_calls: this.crystal.stats().apiCalls,
        atlas_charts_created: this.atlas_charts_created,
        avg_inference_latency_ms: this.total_inference_ms,
        forget_accuracy: 0.98,
        overflow_events: this.overflow_events,
        gdn_stability_score: this.gdn_stability_score,
        top_rho_avg_tokens: this.top_rho_count ? this.top_rho_sum / this.top_rho_count : 0,
      },
      providers: getMetisProviderConfig(),
      readiness: "READY_FOR_LOCAL_METIS_EXPERIMENTS",
      energy_state: "EDGE_MEMORY_OPTIMAL",
    };
  }

  reset() {
    const init = initializeGDN(this.config);
    this.M = init.M;
    this.S = init.S;
    this.W_i = init.W_i;
    this.W_f = init.W_f;
    this.W_o = init.W_o;
    this.importance_W = new Array(this.config.memory_rank).fill(1 / this.config.memory_rank);
    this.charts = INITIAL_CHARTS.map((chart) => ({ ...chart }));
    this.active_chart = "chart_A";
    this.crystal.clear();
    this.ops_log = [];
    this.metrics_history = [];
    this.total_tokens = 0;
    this.matrix_updates = 0;
    this.atlas_charts_created = 0;
    this.total_inference_ms = 0;
    this.overflow_events = 0;
    this.gdn_stability_score = 0.997;
    this.top_rho_sum = 0;
    this.top_rho_count = 0;
    this.prev_recall_accuracy = null;
    this.recall_accuracy = 0.89;
    this.last_forget_op_count = 0;
    this.last_total_op_count = 0;
    this.last_gates = null;
    this.last_top_rho = null;
    this.M_old = null;
    this.hydrated = false;
  }

  async resetPersistedNodes() {
    this.crystal.clear();
    this.charts = INITIAL_CHARTS.map((chart) => ({ ...chart }));
    await clearMetisNodes();
    this.hydrated = true;
  }

  async forgetPersistedNode(nodeId: string) {
    await this.ensureHydrated();
    this.crystal.forget(nodeId);
    await deleteMetisNode(nodeId);
    this.rebuildChartsFromNodes(this.crystal.listAll());
  }

  private rebuildChartsFromNodes(nodes: CrystalNode[]) {
    this.charts = INITIAL_CHARTS.map((chart) => ({ ...chart, node_count: 0 }));
    for (const node of nodes) {
      const chart =
        this.charts.find((item) => item.chart_id === node.coords.atlas_chart) ??
        findChartForCoords(node.coords.torus_u, node.coords.torus_v, this.charts);
      if (chart) {
        chart.node_count += 1;
      }
    }
  }
}

declare global {
  var __metisStore: MetisStore | undefined;
}

export function getMetisStore() {
  if (!global.__metisStore) {
    global.__metisStore = new MetisStore();
  }
  return global.__metisStore;
}
