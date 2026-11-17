/** Cosine score used by Preview. Invalid dimensions, non-finite inputs and zero norms are unusable. */
export function normalizedCosine(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return Number.NEGATIVE_INFINITY;
  if (left.some((value) => !Number.isFinite(value)) || right.some((value) => !Number.isFinite(value))) {
    return Number.NEGATIVE_INFINITY;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (!Number.isFinite(denominator) || denominator === 0 || !Number.isFinite(dot)) {
    return Number.NEGATIVE_INFINITY;
  }
  return Math.min(1, Math.max(-1, dot / denominator));
}
