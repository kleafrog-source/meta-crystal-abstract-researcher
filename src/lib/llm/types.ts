/**
 * LLM provider abstraction layer.
 *
 * Supports multiple providers (Ollama by default, with a mock fallback
 * that produces plausible-looking responses when no real LLM is available).
 * The interface mirrors the spec from the ТЗ:
 *   - chat(prompt, context)
 *   - embed(text)
 *   - generate_completion(prompt, max_tokens)
 */

export type LLMProviderId = "ollama" | "openai" | "mock";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  /** Model identifier, e.g. "qwen2.5-3b" */
  model?: string;
  /** Sampling temperature 0..1 */
  temperature?: number;
  /** Nucleus sampling probability 0..1 */
  topP?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Optional system prompt prepended to the conversation */
  system?: string;
  /** RAG-injected context block, inserted after the system prompt */
  ragContext?: string;
  /** Signal to abort the request */
  signal?: AbortSignal;
}

export interface LLMChatResult {
  text: string;
  model: string;
  provider: LLMProviderId;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface LLMChatStreamChunk {
  textDelta: string;
  done?: boolean;
  model?: string;
  provider?: LLMProviderId;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface LLMModelInfo {
  id: string;
  name: string;
  size?: number;
  quantization?: string;
  family?: string;
}

/**
 * Common interface every provider implements.
 */
export interface LLMProvider {
  readonly id: LLMProviderId;
  readonly displayName: string;
  /** List available models. May throw if the backend is unreachable. */
  listModels(): Promise<LLMModelInfo[]>;
  /** Generate a chat completion. */
  chat(messages: LLMMessage[], opts?: LLMChatOptions): Promise<LLMChatResult>;
  /** Stream a chat completion chunk-by-chunk. */
  chatStream?(
    messages: LLMMessage[],
    opts: LLMChatOptions,
    onChunk: (chunk: LLMChatStreamChunk) => void,
  ): Promise<LLMChatResult>;
  /** Generate an embedding vector for the given text. */
  embed(text: string, model?: string): Promise<number[]>;
  /** Lightweight ping — returns true if the backend is reachable. */
  ping(): Promise<boolean>;
}

// ============================================================
// Helpers
// ============================================================

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Truncate text to a maximum token count (approximate: 1 token ≈ 4 chars).
 */
export function truncateForContext(text: string, maxTokens = 4000): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n…[обрезано]";
}
