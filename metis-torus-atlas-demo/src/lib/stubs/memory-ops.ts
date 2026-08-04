/* =============================================================================
 * ⚠️  STUB: Native Memory Operations (REMEMBER / FORGET / UPDATE / REFLECT)
 * =============================================================================
 *
 * ЗАГЛУШКА. Замените на реальный native memory engine:
 *
 *   Вариант A — PyTorch sidecar (Metis-style):
 *     from metis import MemoryOps
 *     mem_ops = MemoryOps(rank=64, dim=1024)
 *     mem_ops.remember(content_emb, importance=0.92)
 *     mem_ops.forget(node_id)
 *     mem_ops.update(node_id, new_emb)
 *     mem_ops.reflect()
 *
 *   Вариант B — transformers.js с custom memory head:
 *     реализуйте MemoryAttention module поверх pretrained transformer
 *
 * Текущая реализация: использует настоящий GDN update из engine/metis-core.ts,
 * но только с упрощённой проекцией контента. Это математически валидно.
 * ========================================================================== */

import { type MemoryOp } from "../engine/types";
import { stubEmbed, EMBEDDING_DIM } from "./embeddings";

export interface MemoryOpInput {
  op: MemoryOp;
  content: string;
  node_id?: string;
  importance_override?: number;
}

export interface MemoryOpOutput {
  op: MemoryOp;
  detected_node_id?: string;
  embedding_dim: number;
  embedding_preview: number[]; // первые 8 компонент для UI
  importance: number;
  inferred: boolean;
}

export const STUB_MEMORY_ENGINE_ID = "stub:metis-memory-ops@local";

/**
 * STUB operation parser.
 *
 * Шаги, которые реальный native memory engine делает внутри forward pass:
 *   1. Encoder(content) → z_q ∈ R^384
 *   2. HypermemoryController computes importance W
 *   3. Top-ρ selection: L'_t = clip(min{k: Σ p_(r) ≥ ρ}, 16, L)
 *   4. GDN update: M_{t+1} = λ·M_t + (1-λ)/L'_t · (K̃^T/√d_k)·Ṽ
 *   5. Stabilization: Ã_t = diag(Q̃·S+ε)^(-1)·Q̃·M
 *
 * Эти шаги выполняются в lib/engine/metis-core.ts (реально). Здесь только
 * подготовка входа и парсинг контента.
 *
 * Замените эту функцию на вызов вашего native memory engine.
 */
export async function stubMemoryOp(input: MemoryOpInput): Promise<MemoryOpOutput> {
  const emb = await stubEmbed(input.content);

  // importance: либо override, либо inferred из длины и ключевых слов
  let importance = input.importance_override;
  if (importance === undefined) {
    const lower = input.content.toLowerCase();
    let score = 0.5;
    if (lower.length > 50) score += 0.1;
    if (lower.includes("предпочитаю") || lower.includes("prefer")) score += 0.25;
    if (lower.includes("важно") || lower.includes("important")) score += 0.2;
    if (lower.includes("забудь") || lower.includes("forget")) score = 0.0; // suppress
    importance = Math.min(0.95, Math.max(0.0, score));
  }

  // детерминированный node_id из контента
  let hash = 0;
  for (let i = 0; i < input.content.length; i++) {
    hash = (hash * 31 + input.content.charCodeAt(i)) >>> 0;
  }
  const node_id = input.node_id || `node_${hash.toString(36).slice(0, 10)}`;

  return {
    op: input.op,
    detected_node_id: node_id,
    embedding_dim: EMBEDDING_DIM,
    embedding_preview: emb.vector.slice(0, 8),
    importance,
    inferred: input.importance_override === undefined,
  };
}

/** STUB: detect operation type from natural language (for live chat) */
export function detectOpFromText(text: string): MemoryOp | "QUERY" | "CHAT" {
  const lower = text.toLowerCase().trim();
  if (/^(запомни|remember|запомнить)/.test(lower)) return "REMEMBER";
  if (/^(забудь|forget|забыть)/.test(lower)) return "FORGET";
  if (/^(обнови|update|обновить)/.test(lower)) return "UPDATE";
  if (/^(отрази|reflect|рефлексируй)/.test(lower)) return "REFLECT";
  // query patterns
  if (/^(какой|что|как |what |which )/.test(lower)) return "QUERY";
  return "CHAT";
}

/** STUB: extract content from a natural-language command */
export function extractContent(text: string, op: MemoryOp | "QUERY" | "CHAT"): string {
  const lower = text.toLowerCase();
  const patterns: Record<string, RegExp[]> = {
    REMEMBER: [/^(запомни|remember)[,:]?\s*/i, /^(запомнить,?\s*что)\s*/i],
    FORGET: [/^(забудь|forget)\s+(про\s+)?/i, /^(забыть)\s+/i],
    UPDATE: [/^(обнови|update)[,:]?\s*/i],
    REFLECT: [/^(отрази|reflect)[,:]?\s*/i],
    QUERY: [],
    CHAT: [],
  };
  let result = text;
  for (const pat of patterns[op] || []) {
    if (pat.test(result)) {
      result = result.replace(pat, "").trim();
      break;
    }
  }
  return result || text;
}
