export interface NormalizableCandidate {
  technical_name: string;
  llm_normalization?: unknown;
}

export function selectPendingNormalizationCandidates<T extends NormalizableCandidate>(
  candidates: T[],
  selectedNames: string[],
): T[] {
  const selected = new Set(selectedNames);
  return candidates.filter((candidate) => selected.has(candidate.technical_name) && !candidate.llm_normalization);
}

export function resolveNormalizationBatch(
  targetNames: string[],
  successfulNames: string[],
  error?: string,
): { succeeded: string[]; failed: Record<string, string> } {
  const succeededSet = new Set(successfulNames);
  const succeeded = targetNames.filter((name) => succeededSet.has(name));
  const failed = Object.fromEntries(targetNames.filter((name) => !succeededSet.has(name)).map((name) => [name, error ?? "Ответ модели не содержит выбранный параметр."]));
  return { succeeded, failed };
}
