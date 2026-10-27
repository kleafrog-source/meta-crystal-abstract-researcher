import type { LLMChatOptions, LLMChatResult, LLMChatStreamChunk, LLMMessage, LLMModelInfo, LLMProvider } from "./types";
import { OllamaProvider } from "./ollama";

type ChatResponse = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};
export class FreeLLMAPIError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(path: string, status: number) {
    super(`FreeLLMAPI ${path} returned HTTP ${status}`);
    this.name = "FreeLLMAPIError";
    this.path = path;
    this.status = status;
  }
}
function routeMetadata(route?: string) {
  const slash = route?.indexOf("/") ?? -1;
  return slash < 0 ? {} : { actualProvider: route!.slice(0, slash), actualModel: route!.slice(slash + 1) };
}

/** OpenAI-compatible FreeLLMAPI adapter. The API key stays server-side. */
export class FreeLLMAPIProvider implements LLMProvider {
  readonly id = "freellmapi" as const;
  readonly displayName = "FreeLLMAPI";
  private baseUrl: string;

  constructor(baseUrl: string, private defaultModel: string, private apiKey: string, private ollamaUrl: string, private embedModel: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private headers(): HeadersInit {
    if (!this.apiKey) throw new Error("FreeLLMAPI key is missing. Set FREELLMAPI_API_KEY in the server environment.");
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` };
  }

  async ping(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const response = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch { return false; }
  }

  async listModels(): Promise<LLMModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new FreeLLMAPIError("/models", response.status);
    const data = await response.json() as { data?: Array<{ id: string; name?: string }> };
    return (data.data ?? []).map((model) => ({ id: model.id, name: model.name ?? model.id }));
  }

  async chat(messages: LLMMessage[], opts: LLMChatOptions = {}): Promise<LLMChatResult> {
    const requestedModel = opts.model || this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST", headers: this.headers(), signal: opts.signal,
      body: JSON.stringify({
        model: requestedModel,
        messages: [...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
          ...(opts.ragContext ? [{ role: "system" as const, content: `Context from Meta Crystal knowledge base:\n\n${opts.ragContext}` }] : []), ...messages],
        temperature: opts.temperature ?? 0.7,
        top_p: opts.topP ?? 0.9,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.format ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) throw new FreeLLMAPIError("chat completion", response.status);
    const data = await response.json() as ChatResponse;
    const routed = response.headers.get("x-routed-via") ?? undefined;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("FreeLLMAPI returned an empty completion");
    const actual = routeMetadata(routed);
    return {
      text, model: actual.actualModel ?? data.model ?? requestedModel, requestedModel, provider: this.id,
      ...(routed ? { actualRoute: routed } : {}), ...actual,
      usage: { promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens },
    };
  }

  async chatStream(messages: LLMMessage[], opts: LLMChatOptions, onChunk: (chunk: LLMChatStreamChunk) => void): Promise<LLMChatResult> {
    const requestedModel = opts.model || this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST", headers: this.headers(), signal: opts.signal,
      body: JSON.stringify({ model: requestedModel, stream: true, temperature: opts.temperature ?? 0.7,
        top_p: opts.topP ?? 0.9, max_tokens: opts.maxTokens ?? 1024,
        messages: [...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
          ...(opts.ragContext ? [{ role: "system" as const, content: `Context from Meta Crystal knowledge base:\n\n${opts.ragContext}` }] : []), ...messages] }),
    });
    if (!response.ok) throw new FreeLLMAPIError("chat completion", response.status);
    if (!response.body) throw new Error("FreeLLMAPI stream body is empty");
    const routed = response.headers.get("x-routed-via") ?? undefined;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        const dataLine = line.trim();
        if (!dataLine.startsWith("data:")) continue;
        const payload = dataLine.slice(5).trim();
        if (payload === "[DONE]") continue;
        const data = JSON.parse(payload) as ChatResponse;
        const delta = data.choices?.[0]?.delta?.content ?? "";
        if (delta) { text += delta; onChunk({ textDelta: delta, provider: this.id, ...(data.model ? { model: data.model } : {}) }); }
      }
    }
    const actual = routeMetadata(routed);
    onChunk({ textDelta: "", done: true, provider: this.id, model: actual.actualModel ?? requestedModel, requestedModel, ...(routed ? { actualRoute: routed } : {}), ...actual });
    if (!text) throw new Error("FreeLLMAPI returned an empty completion");
    return { text, model: actual.actualModel ?? requestedModel, requestedModel, provider: this.id, ...(routed ? { actualRoute: routed } : {}), ...actual };
  }

  async embed(text: string, model = this.embedModel): Promise<number[]> {
    return new OllamaProvider(this.ollamaUrl, this.defaultModel, this.embedModel).embed(text, model);
  }
}
