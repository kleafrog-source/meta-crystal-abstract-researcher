/**
 * Minimal tensor operations — real math, no external deps.
 *
 * Hybrid mode (per user choice):
 *   - Малые матрицы R×D для визуализации (R=32, D=32 по умолчанию)
 *   - Но формулы (γ, λ, ρ, σ, SVD, trace) считаются математически честно.
 *
 * Эти функции НЕ заглушки. Заменять их не нужно — они эталонные.
 * Если вы захотите бо́льшие матрицы (1024×1024 как в spec) — просто поменяйте
 * RANK и DIM в конфиге state.ts; остальная математика та же.
 */

export type Matrix = number[][];
export type Vector = number[];

/** σ(x) = 1 / (1 + exp(-x)) — sigmoid для GDN gates */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/** Softmax с temperature τ для importance distribution */
export function softmax(x: Vector, tau: number = 1.0): Vector {
  const maxVal = Math.max(...x);
  const exps = x.map((v) => Math.exp((v - maxVal) / tau));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Создать R×D матрицу через функцию init(i, j) */
export function createMatrix(R: number, D: number, init: (i: number, j: number) => number): Matrix {
  const M: Matrix = [];
  for (let i = 0; i < R; i++) {
    const row: Vector = new Array(D);
    for (let j = 0; j < D; j++) row[j] = init(i, j);
    M.push(row);
  }
  return M;
}

/** Создать случайный вектор с seedable PRNG (для воспроизводимости) */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Транспонирование */
export function transpose(M: Matrix): Matrix {
  const R = M.length;
  const D = M[0].length;
  return createMatrix(D, R, (i, j) => M[j][i]);
}

/** M · N (matrix-matrix) */
export function matMul(A: Matrix, B: Matrix): Matrix {
  const R = A.length;
  const K = A[0].length;
  const D = B[0].length;
  return createMatrix(R, D, (i, j) => {
    let s = 0;
    for (let k = 0; k < K; k++) s += A[i][k] * B[k][j];
    return s;
  });
}

/** Tr(M · M^T) = sum of squares of all entries (= Frobenius norm squared) */
export function traceOfMMT(M: Matrix): number {
  let sum = 0;
  for (let i = 0; i < M.length; i++) {
    for (let j = 0; j < M[0].length; j++) {
      const v = M[i][j];
      sum += v * v;
    }
  }
  return sum;
}

/** Frobenius norm |M| = sqrt(Σ M_ij^2) */
export function frobeniusNorm(M: Matrix): number {
  return Math.sqrt(traceOfMMT(M));
}

/** |M1 - M2| Frobenius */
export function matrixDiffNorm(A: Matrix, B: Matrix): number {
  const R = A.length;
  const D = A[0].length;
  let s = 0;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < D; j++) {
      const d = A[i][j] - B[i][j];
      s += d * d;
    }
  }
  return Math.sqrt(s);
}

/** Mean Square Error */
export function mse(A: Matrix, B: Matrix): number {
  const R = A.length;
  const D = A[0].length;
  let s = 0;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < D; j++) {
      const d = A[i][j] - B[i][j];
      s += d * d;
    }
  }
  return s / (R * D);
}

/** Outer product K^T · V — используется в GDN update formula */
export function outer(K: Vector, V: Vector): Matrix {
  const R = K.length;
  const D = V.length;
  return createMatrix(R, D, (i, j) => K[i] * V[j]);
}

/** Scalar · Matrix */
export function scaleMatrix(M: Matrix, s: number): Matrix {
  return M.map((row) => row.map((v) => v * s));
}

/** M1 + M2 */
export function addMatrices(A: Matrix, B: Matrix): Matrix {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

/** L2 norm of vector */
export function l2Norm(v: Vector): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

/** Normalize vector to unit L2 */
export function normalize(v: Vector): Vector {
  const n = l2Norm(v) || 1;
  return v.map((x) => x / n);
}

/** KL divergence KL(p || uniform) для regularization loss */
export function klToUniform(p: Vector): number {
  const n = p.length;
  const uniform = 1 / n;
  let kl = 0;
  for (const pi of p) {
    if (pi > 1e-12) kl += pi * Math.log(pi / uniform);
  }
  return kl;
}

/**
 * Truncated SVD approximation (rank-r) via power iteration on M · M^T.
 *
 * Spec says "Low-Rank SVD Adapter (rank 64)". Для R=32 визуализации используем rank ≤ R.
 * Здесь реализован honest truncated SVD через power iteration — это настоящая
 * математика SVD, не заглушка.
 *
 * Возвращает: U (R×r), singular values (r), V^T (r×D)
 */
export function truncatedSVD(M: Matrix, rank: number): {
  U: Matrix;
  singular: Vector;
  Vt: Matrix;
} {
  const R = M.length;
  const D = M[0].length;
  const r = Math.min(rank, Math.min(R, D));
  const rng = seededRandom(42);

  // Gram matrix A = M · M^T (R×R)
  const Mt = transpose(M);
  const A = matMul(M, Mt);

  const U: Matrix = [];
  const singular: Vector = [];

  // Power iteration для каждого сингулярного вектора
  for (let k = 0; k < r; k++) {
    // случайный стартовый вектор
    let u: Vector = Array.from({ length: R }, () => rng() * 2 - 1);
    u = normalize(u);

    // orthogonalize против уже найденных
    for (let prev = 0; prev < k; prev++) {
      const proj = U[prev].reduce((s, uv, i) => s + uv * u[i], 0);
      u = u.map((uv, i) => uv - proj * U[prev][i]);
      u = normalize(u);
    }

    // 30 итераций power method
    for (let iter = 0; iter < 30; iter++) {
      const Au = new Array(R).fill(0);
      for (let i = 0; i < R; i++) {
        for (let j = 0; j < R; j++) Au[i] += A[i][j] * u[j];
      }
      u = normalize(Au);
      // re-orthogonalize
      for (let prev = 0; prev < k; prev++) {
        const proj = U[prev].reduce((s, uv, i) => s + uv * u[i], 0);
        u = u.map((uv, i) => uv - proj * U[prev][i]);
        u = normalize(u);
      }
    }

    // σ_k^2 = u^T · A · u
    const Au = new Array(R).fill(0);
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < R; j++) Au[i] += A[i][j] * u[j];
    }
    const sigma2 = u.reduce((s, ui, i) => s + ui * Au[i], 0);
    const sigma = Math.sqrt(Math.max(sigma2, 1e-12));

    U.push(u);
    singular.push(sigma);

    // Deflate A: A -= σ^2 · u · u^T
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < R; j++) {
        A[i][j] -= sigma * sigma * u[i] * u[j];
      }
    }
  }

  // V^T rows: v_k = (1/σ_k) · M^T · u_k
  const Vt: Matrix = [];
  for (let k = 0; k < r; k++) {
    const v = new Array(D).fill(0);
    for (let j = 0; j < D; j++) {
      for (let i = 0; i < R; i++) v[j] += Mt[j][i] * U[k][i];
      v[j] /= singular[k];
    }
    Vt.push(v);
  }

  return { U, singular, Vt };
}

/** Reconstruct M ≈ U · diag(singular) · Vt (для L_recon) */
export function reconstructSVD(
  U: Matrix,
  singular: Vector,
  Vt: Matrix
): Matrix {
  const R = U.length;
  const r = singular.length;
  const D = Vt[0].length;
  // (R × r) · (r × D) = R × D
  return createMatrix(R, D, (i, j) => {
    let s = 0;
    for (let k = 0; k < r; k++) s += U[i][k] * singular[k] * Vt[k][j];
    return s;
  });
}

/** Ортогональность двух матриц (cosine between flattened vectors) */
export function orthogonality(A: Matrix, B: Matrix): number {
  const aFlat: Vector = [];
  const bFlat: Vector = [];
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[0].length; j++) {
      aFlat.push(A[i][j]);
      bFlat.push(B[i][j]);
    }
  }
  const na = l2Norm(aFlat) || 1;
  const nb = l2Norm(bFlat) || 1;
  let dot = 0;
  for (let i = 0; i < aFlat.length; i++) dot += aFlat[i] * bFlat[i];
  return Math.abs(dot / (na * nb));
}

/** Sample mean of vector */
export function mean(v: Vector): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Sample variance of vector */
export function variance(v: Vector): number {
  const m = mean(v);
  return v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length;
}
