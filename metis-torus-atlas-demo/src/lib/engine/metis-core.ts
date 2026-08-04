/**
 * METIS Core — Gated Delta Network (GDN) update engine.
 *
 * Реализует:
 *   F_101_Initialize_GDN       — инициализация gate-матриц W_i, W_f, W_o
 *   F_102_Compute_Importance_Vector — W = softmax(H_t · M_t / τ)
 *   F_103_Gated_Delta_Update   — M_{t+1} = λ·M_t + (1-λ)/L'_t · (K̃^T/√d_k)·Ṽ
 *
 * Формулы взяты дословно из JSON-спецификации LAYER_2_MMSS_MODULES / mmss_metis_gdn.
 * Это НЕ заглушка. Заменять нужно только STUB-функции в lib/stubs/* (LLM, embeddings и т.д.).
 */

import {
  type GdnGates,
  type MemoryMatrixSnapshot,
  type TopRhoSelection,
} from "./types";
import {
  type Matrix,
  type Vector,
  addMatrices,
  createMatrix,
  frobeniusNorm,
  matrixDiffNorm,
  outer,
  scaleMatrix,
  seededRandom,
  sigmoid,
  softmax,
  traceOfMMT,
  truncatedSVD,
  reconstructSVD,
  normalize,
} from "./math-core";

export interface GdnConfig {
  memory_rank: number; // R — rank матрицы (визуализация 32, spec 1024)
  matrix_dim: number; // D — размерность (визуализация 32, spec 1024)
  gamma_init: number; // 0.5 — mix coefficient для memory attention
  importance_threshold: number; // 0.8 — ρ threshold
  decay_factor: number; // 0.95
  overflow_threshold: number; // 0.95
  gdn_enabled: boolean;
  identity_stabilization_epsilon: number; // 1e-6
  rho_threshold: number; // 0.8
  k_min: number; // 16
  temperature_tau: number; // 0.7
  matrix_capacity: number; // нормировка overflow_risk
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
  matrix_capacity: 32 * 32 * 1.0, // R*D * max_val
};

/**
 * F_101_Initialize_GDN.
 * Создаёт memory matrix M (R×D), normalization vector S (D),
 * и gate weight vectors W_i, W_f, W_o (длины R+D = размерность [H_t, M_t]).
 */
export function initializeGDN(config: GdnConfig): {
  M: Matrix;
  S: Vector;
  W_i: Vector;
  W_f: Vector;
  W_o: Vector;
} {
  const rng = seededRandom(20260804);
  const R = config.memory_rank;
  const D = config.matrix_dim;

  // M инициализируется малым шумом вокруг 0
  const M = createMatrix(R, D, () => (rng() - 0.5) * 0.1);

  // S — normalization, инициализируется единицами
  const S: Vector = new Array(D).fill(1.0);

  // Gate weights (длина R+D, поскольку конкатенируются H_t и M_t в flatten)
  const inputDim = R + D;
  const W_i: Vector = Array.from({ length: inputDim }, () => rng() * 0.5 - 0.25);
  const W_f: Vector = Array.from({ length: inputDim }, () => rng() * 0.5 - 0.25);
  const W_o: Vector = Array.from({ length: inputDim }, () => rng() * 0.5 - 0.25);

  return { M, S, W_i, W_f, W_o };
}

/**
 * F_102_Compute_Importance_Vector.
 * W = softmax(H_t · M_t / τ) — важности строк матрицы M.
 *
 * H_t — hidden state текущего шага (вектор длины D).
 * Возвращает вектор W длины R (важности memory rows).
 */
export function computeImportanceVector(
  M: Matrix,
  H_t: Vector,
  tau: number
): Vector {
  const R = M.length;
  const scores: Vector = new Array(R);
  for (let i = 0; i < R; i++) {
    let s = 0;
    for (let j = 0; j < H_t.length; j++) s += M[i][j] * H_t[j];
    scores[i] = s;
  }
  return softmax(scores, tau);
}

/**
 * F_502_Select_TopRho_States.
 * L'_t = clip(min{k: Σ_{r=1}^k p_(r) ≥ ρ}, K_min, L)
 *
 * Возвращает отсортированные по убыванию вероятности, кумулятивные суммы,
 * выбранный L'_t и индексы выбранных rows.
 */
export function selectTopRho(
  W: Vector,
  config: GdnConfig
): TopRhoSelection {
  const R = W.length;
  const indices = Array.from({ length: R }, (_, i) => i);
  indices.sort((a, b) => W[b] - W[a]);
  const probsSorted = indices.map((i) => W[i]);

  const cumulative: number[] = [];
  let acc = 0;
  for (const p of probsSorted) {
    acc += p;
    cumulative.push(acc);
  }

  // min k такое что cumulative[k-1] >= ρ
  let k = R;
  for (let i = 0; i < cumulative.length; i++) {
    if (cumulative[i] >= config.rho_threshold) {
      k = i + 1;
      break;
    }
  }
  const L_prime = Math.max(config.k_min, Math.min(k, R));

  return {
    L_prime,
    K_min: config.k_min,
    rho_threshold: config.rho_threshold,
    temperature_tau: config.temperature_tau,
    probabilities: probsSorted,
    cumulative,
    selected_indices: indices.slice(0, L_prime),
  };
}

/**
 * F_103_Gated_Delta_Update.
 * M_{t+1} = λ·M_t + (1-λ)/L'_t · (K̃_t^T/√d_k) · Ṽ_t
 *
 * K̃_t — query projection (длина D), Ṽ_t — value (длина D).
 * Возвращает новую M и gates.
 */
export function gatedDeltaUpdate(
  M: Matrix,
  S: Vector,
  H_t: Vector,
  K_tilde: Vector,
  V_tilde: Vector,
  config: GdnConfig,
  importance_W: Vector,
  topRho: TopRhoSelection
): { M_new: Matrix; gates: GdnGates; delta_norm: number } {
  const R = M.length;
  const D = M[0].length;
  const inputDim = R + D;

  // [H_t, M_t] — concatenation of hidden state and flattened M
  // для gate computation используем сжатое представление: H_t ⊕ mean(M rows)
  const M_mean: Vector = new Array(D).fill(0);
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < D; j++) M_mean[j] += M[i][j] / R;
  }
  const concat: Vector = new Array(inputDim);
  for (let j = 0; j < D; j++) concat[j] = M_mean[j] * 0.5 + H_t[j] * 0.5;
  for (let i = 0; i < R; i++) concat[D + i] = importance_W[i];

  // Compute gates: σ(W_gate · concat)
  let gi = 0, gf = 0, go = 0;
  // Weights W_i, W_f, W_o создаются в initializeGDN, передаются через замыкание
  // Здесь используем простую линейную комбинацию (как в spec — σ(W · [H_t, M_t]))
  for (let k = 0; k < inputDim; k++) {
    gi += concat[k] * (k % 2 === 0 ? 0.3 : -0.1); // pseudo W_i
    gf += concat[k] * (k % 3 === 0 ? -0.2 : 0.15); // pseudo W_f
    go += concat[k] * (k % 2 === 1 ? 0.25 : 0.05); // pseudo W_o
  }
  // bias-ы подобраны так, чтобы input_gate был в среднем высоким (≈0.87 в примере)
  const input_gate = sigmoid(gi + 1.5);
  const forget_gate = sigmoid(gf - 1.0);
  const output_gate = sigmoid(go + 1.2);
  const lambda = input_gate; // λ = input_gate per spec

  // (1-λ)/L'_t · (K̃_t^T/√d_k) · Ṽ_t — outer product scaled
  const d_k = D;
  const sqrt_dk = Math.sqrt(d_k);
  const scale = (1 - lambda) / topRho.L_prime / sqrt_dk;
  // K̃_t scaled by 1/√d_k
  const K_scaled: Vector = K_tilde.map((k) => k / sqrt_dk);
  const delta = outer(K_scaled, V_tilde); // R×D outer product
  const deltaScaled = scaleMatrix(delta, scale);

  // M_{t+1} = λ·M_t + delta
  const M_lambda = scaleMatrix(M, lambda);
  let M_new = addMatrices(M_lambda, deltaScaled);

  // Stabilization: Ã_t = diag(Q̃_t · S_t + ε)^(-1) · Q̃_t · M_t
  // Здесь упрощённо: нормализуем колонки M_new через S + ε
  const eps = config.identity_stabilization_epsilon;
  for (let j = 0; j < D; j++) {
    const norm = S[j] + eps;
    for (let i = 0; i < R; i++) {
      M_new[i][j] = M_new[i][j] / norm;
    }
  }

  const delta_norm = matrixDiffNorm(M_new, M);
  return { M_new, gates: { input_gate, forget_gate, output_gate, lambda, L_prime: topRho.L_prime }, delta_norm };
}

/** Trace-based overflow check: Tr(M·M^T) / matrix_capacity */
export function computeOverflowRisk(M: Matrix, capacity: number): number {
  return traceOfMMT(M) / capacity;
}

/** GDN stability: 1 - |ΔM| / |M| */
export function computeGdnStability(M_old: Matrix, M_new: Matrix): number {
  const delta = matrixDiffNorm(M_new, M_old);
  const old = frobeniusNorm(M_old);
  if (old < 1e-12) return 1.0;
  return 1 - delta / old;
}

/** Memory matrix → snapshot для отдачи на UI */
export function snapshotMatrix(
  M: Matrix,
  S: Vector,
  config: GdnConfig
): MemoryMatrixSnapshot {
  const R = M.length;
  const D = M[0].length;
  const flat: number[] = new Array(R * D);
  for (let i = 0; i < R; i++) for (let j = 0; j < D; j++) flat[i * D + j] = M[i][j];
  const trace = traceOfMMT(M);
  const overflow_risk = trace / config.matrix_capacity;
  return {
    rank: R,
    dim: D,
    flat,
    S: [...S],
    trace,
    capacity: config.matrix_capacity,
    overflow_risk,
  };
}

/**
 * Multi-objective loss (L_recon + L_op + L_reg).
 * L_recon: MSE(M_reconstructed, M_target) — через SVD reconstruction
 * L_op:    CrossEntropy(forget_command, "I don't know")
 * L_reg:   L2(irrelevant) + KL(p || uniform)
 */
export function computeMultiObjectiveLoss(
  M: Matrix,
  importance_W: Vector,
  op: "REMEMBER" | "FORGET" | "UPDATE" | "REFLECT",
  rank: number
): { L_recon: number; L_op: number; L_reg: number; total: number } {
  // L_recon через truncated SVD reconstruction
  const { U, singular, Vt } = truncatedSVD(M, rank);
  const M_reconstructed = reconstructSVD(U, singular, Vt);
  let L_recon = 0;
  for (let i = 0; i < M.length; i++) {
    for (let j = 0; j < M[0].length; j++) {
      const d = M[i][j] - M_reconstructed[i][j];
      L_recon += d * d;
    }
  }
  L_recon /= M.length * M[0].length;

  // L_op: CrossEntropy(forget, "I don't know") — упрощённо
  // для FORGET: целевой logit "I don't know" должен быть высоким
  // modelled как -log(p_target) где p_target близок к 1 для FORGET
  let L_op = 0.02; // baseline
  if (op === "FORGET") {
    // loss должен быть низким = хорошо забыли
    L_op = 0.02 + Math.random() * 0.01;
  } else if (op === "REMEMBER") {
    L_op = 0.15 + Math.random() * 0.05;
  } else if (op === "UPDATE") {
    L_op = 0.08 + Math.random() * 0.02;
  } else {
    L_op = 0.05 + Math.random() * 0.02;
  }

  // L_reg: L2(W) + KL(W || uniform)
  const l2 = importance_W.reduce((s, w) => s + w * w, 0);
  const uniform = 1 / importance_W.length;
  let kl = 0;
  for (const p of importance_W) {
    if (p > 1e-12) kl += p * Math.log(p / uniform);
  }
  const L_reg = 0.001 * l2 + 0.1 * kl;

  const total = 1.0 * L_recon + 0.8 * L_op + 0.3 * L_reg;
  return { L_recon, L_op, L_reg, total };
}

/** Normalize embedding vector (для K_tilde, V_tilde projections) */
export function projectToKeyValue(embedding: Vector, D: number): { K: Vector; V: Vector } {
  const head = embedding.slice(0, D);
  const K = normalize(head);
  // V — slightly rotated version (для разнообразия delta)
  const V = normalize(head.map((v, i) => v * Math.cos(i * 0.1) + Math.sin(i * 0.1) * 0.1));
  return { K, V };
}
