/**
 * Mock LLM provider — used as a fallback when Ollama is not running.
 * Produces plausible-looking deterministic responses based on the input
 * so the UI remains explorable without a real LLM backend.
 *
 * The mock also produces deterministic 384-dim embeddings derived from a
 * hash of the input tokens. This is NOT semantically meaningful, but it
 * gives a stable vector for any given text, which is enough for the RAG
 * pipeline to demonstrate end-to-end flow.
 */

import type {
  LLMChatOptions,
  LLMChatResult,
  LLMMessage,
  LLMModelInfo,
  LLMProvider,
} from "./types";

const EMBED_DIM = 384;

// A small library of canned responses keyed by intent. The mock tries to
// detect the user's intent from their last message and returns a tailored
// answer; otherwise it falls back to a generic "interpretation" template.
const INTENTS: Array<{
  match: RegExp;
  reply: (msg: string, ctx?: string) => string;
}> = [
  {
    match: /пайплайн|pipeline|шаг|генераци/i,
    reply: (msg, ctx) =>
      `На основе вашего запроса я предлагаю следующий пайплайн:

1. **Шаг «Генерация»** — сгенерировать базовый батч комбинаций (50 шт., фокус: ПРОЦЕСС).
2. **Шаг «Фильтр изумрудов»** — отфильтровать по метрикам V ≥ 0.6, S ≥ 0.5.
3. **Шаг «Каталогизация»** — определить типы (ИЗУМРУД / АЛМАЗ / ПРИНЦИП).
4. **Шаг «Сохранение»** — записать в индекс, обновить счётчик.
5. **Шаг «Эволюция»** — повторить 3 поколения с увеличением батча до 100.

${
  ctx
    ? `\nКонтекст из базы знаний:\n${ctx.slice(0, 600)}\n`
    : ""
}

JSON-схема пайплайна готова к передаче в бэкенд.`,
  },
  {
    match: /интерпрет|interpret|что значит|объясни|опиши/i,
    reply: (msg) =>
      `Интерпретация комбинации:

Эта комбинация представляет собой **многоуровневую структуру**, объединяющую несколько доменов знания. Основной фокус — на трансформации и эмерджентных свойствах.

**Ключевые характеристики:**
- **Сложность**: высокая (≥7 уровней вложенности)
- **Тип**: вероятнее всего ИЗУМРУД (высокая согласованность метрик V, S, N)
- **Эмерджентность**: выражена (D_f > 0.7)
- **Когерентность**: G_S ≥ 0.6

**Рекомендации:**
1. Использовать как базис для генерации производных гибридов.
2. Включить в пайплайн как эталон для фильтрации изоморфизмов.
3. Проверить на устойчивость при применении квантовых операторов.

Запрос: «${msg.slice(0, 120)}»`,
  },
  {
    match: /привет|hello|hi|здравств/i,
    reply: () =>
      `Здравствуйте! Я LLM-ассистент Мета-Кристалл. Я могу:
- интерпретировать сгенерированные кристаллы;
- строить пайплайны генерации по описанию задачи;
- искать релевантные сущности в базе знаний (RAG);
- оценивать качество комбинаций по семантическим критериям.

Задайте вопрос или попросите сгенерировать пайплайн.`,
  },
  {
    match: /метрик|оценк|quality|качество/i,
    reply: () =>
      `Система метрик MMSS (Meta-Multi-System-Science) оценивает комбинации по нескольким осям:

- **V** — валидность (correspondence with structural patterns)
- **S** — синтаксическая связность
- **N** — новизна (расстояние от исторических кристаллов)
- **D_f** — фрактальная размерность
- **G_S** — глобальная синергия
- **QEC** — квантовая коррекция ошибок
- **CHSH** — неравенство Белла (для квантовых кристаллов)
- **C_val** — контекстуальная ценность

Порог изумруда: V ≥ 0.6, S ≥ 0.5, N ≥ 0.4.`,
  },
];

const GENERIC_REPLIES = [
  `Я обработал ваш запрос. В контексте Мета-Кристалл это означает, что следует обратить внимание на структурные паттерны и метрики качества. База знаний содержит 171 домен и 196 операторов — можно построить богатую комбинационную решётку.`,
  `Запрос принят к анализу. Рекомендую использовать эволюционный подход: запустить 2-3 поколения генерации с батчем 50-100, отфильтровать изумруды и построить алмаз. Пайплайн можно сгенерировать автоматически — нажмите кнопку «Сгенерировать пайплайн».`,
  `С точки зрения комбинаторной алхимии, ваш запрос затрагивает несколько уровней абстракции. Я бы предложил декомпозировать задачу на 3-5 шагов и оформить их как пайплайн.`,
];

// Simple deterministic hash for embeddings
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Produce a deterministic 384-dim embedding from the input text.
 * Each token contributes a hashed value to a set of dimensions.
 */
function mockEmbed(text: string): number[] {
  const vec = new Float32Array(EMBED_DIM);
  const toks = tokensOf(text);
  for (const t of toks) {
    const h = hashStr(t);
    // spread the token's contribution across 8 dimensions
    for (let i = 0; i < 8; i++) {
      const idx = (h + i * 7919) % EMBED_DIM;
      const sign = ((h >> (i + 1)) & 1) === 1 ? 1 : -1;
      vec[idx] += sign * (0.3 + ((h >> (i + 3)) & 0xff) / 1024);
    }
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) out[i] = vec[i] / norm;
  return out;
}

export class MockProvider implements LLMProvider {
  readonly id = "mock" as const;
  readonly displayName = "Mock (без LLM)";

  async ping(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<LLMModelInfo[]> {
    return [
      { id: "mock-small", name: "Mock Small (детерминированный)" },
      { id: "mock-large", name: "Mock Large (с контекстом)" },
    ];
  }

  async chat(messages: LLMMessage[], opts: LLMChatOptions = {}): Promise<LLMChatResult> {
    // Simulate latency
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.content ?? "";

    // Find a matching intent
    let reply: string | null = null;
    for (const intent of INTENTS) {
      if (intent.match.test(userText)) {
        reply = intent.reply(userText, opts.ragContext);
        break;
      }
    }
    if (!reply) {
      const idx = hashStr(userText) % GENERIC_REPLIES.length;
      reply = GENERIC_REPLIES[idx];
      if (opts.ragContext) {
        reply += `\n\n**RAG-контекст:**\n${opts.ragContext.slice(0, 500)}…`;
      }
    }

    return {
      text: reply,
      model: opts.model ?? "mock-small",
      provider: "mock",
      usage: {
        promptTokens: Math.ceil(userText.length / 4),
        completionTokens: Math.ceil(reply.length / 4),
      },
    };
  }

  async embed(text: string): Promise<number[]> {
    return mockEmbed(text);
  }
}
