import type { GdnGates, MemoryMatrixSnapshot, TopRhoSelection } from "@/lib/metis/types";
import {
  addMatrices,
  createMatrix,
  frobeniusNorm,
  matrixDiffNorm,
  normalize,
  outer,
  reconstructSVD,
  scaleMatrix,
  seededRandom,
  sigmoid,
  softmax,
  traceOfMMT,
  truncatedSVD,
  type Matrix,
  type Vector,
} from "@/lib/metis/math-core";

export interface GdnConfig {
  memory_rank: number;
  matrix_dim: number;
  gamma_init: number;
  importance_threshold: number;
  decay_factor: number;
  overflow_threshold: number;
  gdn_enabled: boolean;
  identity_stabilization_epsilon: number;
  rho_threshold: number;
  k_min: number;
  temperature_tau: number;
  matrix_capacity: number;
}

export const DEFAULT_GDN_CONFIG: GdnConfig = {
  memory_rank: 32,
  matrix_dim: 32,
  gamma_init: 0.5,
  importance_threshold: 0.8,
  decay_factor: 0.95,
  overflow_threshold: 0.95,
  gdn_enabled: true,
  identity_stabilization_epsilon: 1e-6,
  rho_threshold: 0.8,
  k_min: 16,
  temperature_tau: 0.7,
  matrix_capacity: 32 * 32,
};

export function initializeGDN(config: GdnConfig): { M: Matrix; S: Vector; W_i: Vector; W_f: Vector; W_o: Vector } {
  const rng = seededRandom(20260804);
  const M = createMatrix(config.memory_rank, config.matrix_dim, () => (rng() - 0.5) * 0.1);
  const S = new Array(config.matrix_dim).fill(1);
  const gateSize = config.memory_rank + config.matrix_dim;
  const makeGate = () => Array.from({ length: gateSize }, () => rng() * 0.5 - 0.25);
  return { M, S, W_i: makeGate(), W_f: makeGate(), W_o: makeGate() };
}

export function computeImportanceVector(M: Matrix, H_t: Vector, tau: number): Vector {
  const scores = M.map((row) => row.reduce((sum, value, index) => sum + value * (H_t[index] ?? 0), 0));
  return softmax(scores, tau);
}

export function selectTopRho(W: Vector, config: GdnConfig): TopRhoSelection {
  const indices = Array.from({ length: W.length }, (_, index) => index).sort((a, b) => W[b] - W[a]);
  const probabilities = indices.map((index) => W[index]);
  const cumulative: number[] = [];
  let acc = 0;
  for (const probability of probabilities) {
    acc += probability;
    cumulative.push(acc);
  }
  let k = W.length;
  for (let index = 0; index < cumulative.length; index += 1) {
    if (cumulative[index] >= config.rho_threshold) {
      k = index + 1;
      break;
    }
  }
  return {
    L_prime: Math.max(config.k_min, Math.min(k, W.length)),
    K_min: config.k_min,
    rho_threshold: config.rho_threshold,
    temperature_tau: config.temperature_tau,
    probabilities,
    cumulative,
    selected_indices: indices.slice(0, Math.max(config.k_min, Math.min(k, W.length))),
  };
}

export function gatedDeltaUpdate(
  M: Matrix,
  S: Vector,
  H_t: Vector,
  K_tilde: Vector,
  V_tilde: Vector,
  config: GdnConfig,
  importance_W: Vector,
  topRho: TopRhoSelection,
): { M_new: Matrix; gates: GdnGates; delta_norm: number } {
  const rows = M.length;
  const cols = M[0].length;
  const meanRow = new Array(cols).fill(0);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) meanRow[col] += M[row][col] / rows;
  }
  const concat = [...meanRow.map((value, index) => value * 0.5 + (H_t[index] ?? 0) * 0.5), ...importance_W];
  let gi = 0;
  let gf = 0;
  let go = 0;
  for (let index = 0; index < concat.length; index += 1) {
    gi += concat[index] * (index % 2 === 0 ? 0.3 : -0.1);
    gf += concat[index] * (index % 3 === 0 ? -0.2 : 0.15);
    go += concat[index] * (index % 2 === 1 ? 0.25 : 0.05);
  }
  const input_gate = sigmoid(gi + 1.5);
  const forget_gate = sigmoid(gf - 1);
  const output_gate = sigmoid(go + 1.2);
  const lambda = input_gate;
  const scale = (1 - lambda) / topRho.L_prime / Math.sqrt(cols);
  const delta = scaleMatrix(outer(K_tilde.map((value) => value / Math.sqrt(cols)), V_tilde), scale);
  const M_new = addMatrices(scaleMatrix(M, lambda), delta).map((row, rowIndex) =>
    row.map((value, colIndex) => value / ((S[colIndex] ?? 1) + config.identity_stabilization_epsilon)),
  );
  return {
    M_new,
    gates: { input_gate, forget_gate, output_gate, lambda, L_prime: topRho.L_prime },
    delta_norm: matrixDiffNorm(M_new, M),
  };
}

export function computeOverflowRisk(M: Matrix, capacity: number): number {
  return traceOfMMT(M) / capacity;
}

export function computeGdnStability(M_old: Matrix, M_new: Matrix): number {
  const base = frobeniusNorm(M_old);
  if (base < 1e-12) return 1;
  return 1 - matrixDiffNorm(M_old, M_new) / base;
}

export function snapshotMatrix(M: Matrix, S: Vector, config: GdnConfig): MemoryMatrixSnapshot {
  const flat = M.flat();
  const trace = traceOfMMT(M);
  return {
    rank: M.length,
    dim: M[0].length,
    flat,
    S: [...S],
    trace,
    capacity: config.matrix_capacity,
    overflow_risk: trace / config.matrix_capacity,
  };
}

export function computeMultiObjectiveLoss(
  M: Matrix,
  importance_W: Vector,
  op: "REMEMBER" | "FORGET" | "UPDATE" | "REFLECT",
  rank: number,
): { L_recon: number; L_op: number; L_reg: number; total: number; weights: { recon: number; op: number; reg: number } } {
  const { U, singular, Vt } = truncatedSVD(M, rank);
  const reconstructed = reconstructSVD(U, singular, Vt);
  let recon = 0;
  for (let row = 0; row < M.length; row += 1) {
    for (let col = 0; col < M[0].length; col += 1) {
      const diff = M[row][col] - reconstructed[row][col];
      recon += diff * diff;
    }
  }
  recon /= M.length * M[0].length;
  const opLoss = op === "FORGET" ? 0.03 : op === "REMEMBER" ? 0.18 : op === "UPDATE" ? 0.1 : 0.07;
  const uniform = 1 / Math.max(importance_W.length, 1);
  const l2 = importance_W.reduce((sum, value) => sum + value * value, 0);
  const kl = importance_W.reduce((sum, value) => sum + (value > 1e-12 ? value * Math.log(value / uniform) : 0), 0);
  const reg = 0.001 * l2 + 0.1 * kl;
  return {
    L_recon: recon,
    L_op: opLoss,
    L_reg: reg,
    total: recon + 0.8 * opLoss + 0.3 * reg,
    weights: { recon: 1, op: 0.8, reg: 0.3 },
  };
}

export function projectToKeyValue(embedding: Vector, dim: number): { K: Vector; V: Vector } {
  const head = embedding.slice(0, dim);
  const K = normalize(head);
  const V = normalize(head.map((value, index) => value * Math.cos(index * 0.1) + Math.sin(index * 0.1) * 0.1));
  return { K, V };
}

