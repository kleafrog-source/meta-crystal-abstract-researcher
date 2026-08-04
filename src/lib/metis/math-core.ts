export type Matrix = number[][];
export type Vector = number[];

export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function softmax(x: Vector, tau = 1): Vector {
  const max = Math.max(...x);
  const exps = x.map((value) => Math.exp((value - max) / tau));
  const sum = exps.reduce((acc, value) => acc + value, 0) || 1;
  return exps.map((value) => value / sum);
}

export function createMatrix(rows: number, cols: number, init: (row: number, col: number) => number): Matrix {
  return Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => init(row, col)));
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function transpose(matrix: Matrix): Matrix {
  return createMatrix(matrix[0].length, matrix.length, (row, col) => matrix[col][row]);
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  return createMatrix(a.length, b[0].length, (row, col) => {
    let sum = 0;
    for (let i = 0; i < a[0].length; i += 1) sum += a[row][i] * b[i][col];
    return sum;
  });
}

export function traceOfMMT(matrix: Matrix): number {
  let sum = 0;
  for (const row of matrix) {
    for (const value of row) sum += value * value;
  }
  return sum;
}

export function frobeniusNorm(matrix: Matrix): number {
  return Math.sqrt(traceOfMMT(matrix));
}

export function matrixDiffNorm(a: Matrix, b: Matrix): number {
  let sum = 0;
  for (let row = 0; row < a.length; row += 1) {
    for (let col = 0; col < a[0].length; col += 1) {
      const diff = a[row][col] - b[row][col];
      sum += diff * diff;
    }
  }
  return Math.sqrt(sum);
}

export function outer(a: Vector, b: Vector): Matrix {
  return createMatrix(a.length, b.length, (row, col) => a[row] * b[col]);
}

export function scaleMatrix(matrix: Matrix, scale: number): Matrix {
  return matrix.map((row) => row.map((value) => value * scale));
}

export function addMatrices(a: Matrix, b: Matrix): Matrix {
  return a.map((row, rowIndex) => row.map((value, colIndex) => value + b[rowIndex][colIndex]));
}

export function l2Norm(vector: Vector): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function normalize(vector: Vector): Vector {
  const norm = l2Norm(vector) || 1;
  return vector.map((value) => value / norm);
}

export function truncatedSVD(matrix: Matrix, rank: number): { U: Matrix; singular: Vector; Vt: Matrix } {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const limit = Math.min(rank, rows, cols);
  const rng = seededRandom(42);
  const gram = matMul(matrix, transpose(matrix));
  const U: Matrix = [];
  const singular: Vector = [];

  for (let k = 0; k < limit; k += 1) {
    let u = normalize(Array.from({ length: rows }, () => rng() * 2 - 1));
    for (let iter = 0; iter < 24; iter += 1) {
      const next = new Array(rows).fill(0);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < rows; col += 1) next[row] += gram[row][col] * u[col];
      }
      u = normalize(next);
      for (const prev of U) {
        const projection = prev.reduce((sum, value, index) => sum + value * u[index], 0);
        u = normalize(u.map((value, index) => value - projection * prev[index]));
      }
    }

    const gramU = new Array(rows).fill(0);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < rows; col += 1) gramU[row] += gram[row][col] * u[col];
    }
    const sigmaSquared = u.reduce((sum, value, index) => sum + value * gramU[index], 0);
    const sigma = Math.sqrt(Math.max(sigmaSquared, 1e-12));
    U.push(u);
    singular.push(sigma);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < rows; col += 1) {
        gram[row][col] -= sigma * sigma * u[row] * u[col];
      }
    }
  }

  const transposed = transpose(matrix);
  const Vt = U.map((u, index) => {
    const sigma = singular[index] || 1;
    return Array.from({ length: cols }, (_, col) => {
      let sum = 0;
      for (let row = 0; row < rows; row += 1) sum += transposed[col][row] * u[row];
      return sum / sigma;
    });
  });

  return { U, singular, Vt };
}

export function reconstructSVD(U: Matrix, singular: Vector, Vt: Matrix): Matrix {
  return createMatrix(U.length, Vt[0].length, (row, col) => {
    let sum = 0;
    for (let index = 0; index < singular.length; index += 1) {
      sum += (U[row][index] ?? 0) * singular[index] * (Vt[index][col] ?? 0);
    }
    return sum;
  });
}

export function orthogonality(a: Matrix, b: Matrix): number {
  const aFlat = a.flat();
  const bFlat = b.flat();
  const aNorm = l2Norm(aFlat) || 1;
  const bNorm = l2Norm(bFlat) || 1;
  let dot = 0;
  for (let index = 0; index < aFlat.length; index += 1) dot += aFlat[index] * bFlat[index];
  return Math.abs(dot / (aNorm * bNorm));
}

export function variance(values: Vector): number {
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(values.length, 1);
}

