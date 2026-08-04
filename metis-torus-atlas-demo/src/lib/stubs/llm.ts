/* =============================================================================
 * ⚠️  STUB: LLM Inference Adapter
 * =============================================================================
 *
 * ЗАГЛУШКА. Замените на реальную интеграцию с локальной моделью:
 *
 *   Вариант A — HuggingFace Transformers (Python sidecar):
 *     from transformers import AutoModelForCausalLM, AutoTokenizer
 *     tok = AutoTokenizer.from_pretrained("Metis-4B")
 *     model = AutoModelForCausalLM.from_pretrained("Metis-4B", torch_dtype="auto")
 *     inputs = tok(prompt, return_tensors="pt")
 *     out = model.generate(**inputs, max_new_tokens=200)
 *
 *   Вариант B — Ollama (HTTP):
 *     POST http://localhost:11434/api/generate
 *     { "model": "metis:4b", "prompt": "...", "stream": false }
 *
 *   Вариант C — llama.cpp / transformers.js (in-process):
 *     import { pipeline } from "@xenova/transformers"
 *     const generator = await pipeline("text-generation", "Xenova/metis-4b")
 *
 * Текущая реализация: rule-based ответ для демо. Не используйте в production.
 * ========================================================================== */

export interface LLMRequest {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  system_prompt?: string;
}

export interface LLMResponse {
  text: string;
  tokens_generated: number;
  inference_ms: number;
  model_id: string;
}

/** STUB model id — поменять на реальный при интеграции */
export const STUB_MODEL_ID = "stub:metis-4b@local";

/**
 * STUB generate function.
 *
 * Чтобы подключить реальную модель:
 *   1. Замените тело функции на вызов вашего inference backend.
 *   2. Верните LLMResponse с реальными tokens_generated и inference_ms.
 *   3. Сигнатура функции сохранится — остальной код менять не нужно.
 */
export async function stubLLMGenerate(req: LLMRequest): Promise<LLMResponse> {
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 80)); // имитация latency

  // Простейшая rule-based логика — только для демо-ответов.
  // В реальной модели здесь будет forwards pass через transformer.
  const p = req.prompt.toLowerCase();
  let text = "";

  if (p.includes("запомни") || p.includes("remember")) {
    const fact = req.prompt.replace(/.*?(запомни|remember)[,:…]?\s*/i, "").trim();
    text = `Запомнил: ${fact || "(пустой контекст)"}`;
  } else if (p.includes("забудь") || p.includes("forget")) {
    const fact = req.prompt.replace(/.*?(забудь|forget)\s+(про\s+)?/i, "").trim();
    text = `Забыл: ${fact || "(пустой контекст)"} удалён из внутренней памяти`;
  } else if (p.includes("обнови") || p.includes("update")) {
    text = `Обновил состояние памяти в соответствии с запросом`;
  } else if (p.includes("отрази") || p.includes("reflect")) {
    text = `Выполнена процедура reflect: реорганизована внутренняя структура памяти`;
  } else if (p.includes("какой жанр") || p.includes("что я люблю") || p.includes("what do i like")) {
    text = `(QUERY) Извлечено из нативной памяти через MemoryAttention`;
  } else {
    text = `Принято. Обработано через STUB LLM (замените на локальную модель).`;
  }

  const tokens = Math.ceil(text.length / 4) + Math.ceil(req.prompt.length / 4);

  return {
    text,
    tokens_generated: tokens,
    inference_ms: Date.now() - t0,
    model_id: STUB_MODEL_ID,
  };
}
