/**
 * Ollama provider - calls the local Ollama HTTP API.
 */

import type {
  LLMChatOptions,
  LLMChatResult,
  LLMChatStreamChunk,
  LLMMessage,
  LLMModelInfo,
  LLMProvider,
} from "./types";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export class OllamaProvider implements LLMProvider {
  readonly id = "ollama" as const;
  readonly displayName = "Ollama (local)";

  constructor(
    private baseUrl: string = DEFAULT_OLLAMA_URL,
    private defaultModel: string = "qwen2.5-3b",
    private embedModel: string = "embeddinggemma:300m",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<LLMModelInfo[]> {
    const r = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
    if (!r.ok) throw new Error(`Ollama /api/tags returned ${r.status}`);
    const data = await r.json();
    return (data.models ?? []).map((m: any) => ({
      id: m.name ?? m.model,
      name: m.name ?? m.model,
      size: m.size,
      quantization: m.details?.quantization_level,
      family: m.details?.family,
    }));
  }

  async chat(messages: LLMMessage[], opts: LLMChatOptions = {}): Promise<LLMChatResult> {
    const model = opts.model || this.defaultModel;
    const body = this.buildChatBody(messages, opts, false);
    const r = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Ollama /api/chat returned ${r.status}: ${text}`);
    }

    const data = await r.json();
    return {
      text: data.message?.content ?? "",
      model,
      provider: "ollama",
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
      },
    };
  }

  async chatStream(
    messages: LLMMessage[],
    opts: LLMChatOptions,
    onChunk: (chunk: LLMChatStreamChunk) => void,
  ): Promise<LLMChatResult> {
    const model = opts.model || this.defaultModel;
    const body = this.buildChatBody(messages, opts, true);
    const r = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Ollama /api/chat returned ${r.status}: ${text}`);
    }
    if (!r.body) throw new Error("Ollama stream body is empty");

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let usage: LLMChatResult["usage"];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const data = JSON.parse(trimmed);
        const delta = data.message?.content ?? "";
        if (delta) {
          text += delta;
          onChunk({ textDelta: delta, model, provider: "ollama" });
        }
        if (data.done) {
          usage = {
            promptTokens: data.prompt_eval_count,
            completionTokens: data.eval_count,
          };
          onChunk({ textDelta: "", done: true, model, provider: "ollama", usage });
        }
      }
    }

    return { text, model, provider: "ollama", usage };
  }

  async embed(text: string, model?: string): Promise<number[]> {
    const m = model || this.embedModel;
    const r = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m, prompt: text }),
    });
    if (!r.ok) throw new Error(`Ollama /api/embeddings returned ${r.status}`);
    const data = await r.json();
    return data.embedding as number[];
  }

  private buildChatBody(messages: LLMMessage[], opts: LLMChatOptions, stream: boolean) {
    const model = opts.model || this.defaultModel;
    const fullMessages: LLMMessage[] = [];

    if (opts.system) {
      fullMessages.push({ role: "system", content: opts.system });
    }
    if (opts.ragContext) {
      fullMessages.push({
        role: "system",
        content: `Context from Meta Crystal knowledge base:\n\n${opts.ragContext}`,
      });
    }
    fullMessages.push(...messages);

    return {
      model,
      messages: fullMessages,
      stream,
      options: {
        temperature: opts.temperature ?? 0.7,
        top_p: opts.topP ?? 0.9,
        num_predict: opts.maxTokens ?? 1024,
      },
    };
  }
}
