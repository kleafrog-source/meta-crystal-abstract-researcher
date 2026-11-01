export interface EmbeddingModelSlot {
  owner: string;
  acquired_at: number;
}

const shared = globalThis as typeof globalThis & { __embeddingModelSlot?: EmbeddingModelSlot | null };

export function getEmbeddingModelSlot(): EmbeddingModelSlot | null {
  return shared.__embeddingModelSlot ?? null;
}

export function acquireEmbeddingModelSlot(owner: string): boolean {
  if (shared.__embeddingModelSlot) return false;
  shared.__embeddingModelSlot = { owner, acquired_at: Date.now() };
  return true;
}

export function releaseEmbeddingModelSlot(owner: string): void {
  if (shared.__embeddingModelSlot?.owner === owner) shared.__embeddingModelSlot = null;
}

export function assertOllamaInferenceAvailable(allowedOwner?: string): void {
  const slot = getEmbeddingModelSlot();
  if (slot && slot.owner !== allowedOwner) {
    throw new Error(`Ollama embedding is reserved by ${slot.owner}; retry after the index build finishes.`);
  }
}
