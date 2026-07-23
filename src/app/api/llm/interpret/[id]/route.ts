import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { db } from "@/lib/db";
import { getActiveProvider } from "@/lib/llm/factory";
import { buildRAGContext } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Ты аналитик системы Meta Crystal v7.2.
Дай интерпретацию кристалла на русском языке.
Структура ответа:
1. Краткое описание.
2. Тип и категория.
3. Анализ метрик MMSS.
4. Семантика фокуса и паттерна.
5. 2-3 рекомендации по использованию.
Будь конкретен и не растекайся.`;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const crystal = await db.crystal.findUnique({ where: { id } });
    if (!crystal) {
      return NextResponse.json({ ok: false, error: "Кристалл не найден" }, { status: 404 });
    }

    const fullFile = readFullFile(crystal.filepath);
    const elements = normalizeValues(safeParse(crystal.elementsJson, []));
    const operators = normalizeOperators(safeParse(crystal.operatorsJson, []));
    const metrics = safeParse<Record<string, unknown>>(crystal.metricsJson, {});
    const reasons = normalizeValues(safeParse(crystal.reasonsJson, []));
    const body = await req.json().catch(() => ({}));
    const question =
      typeof body.question === "string" && body.question.trim()
        ? body.question.trim()
        : "Дай полную интерпретацию этого кристалла.";

    const rag = await buildRAGContext(
      [
        crystal.searchText,
        crystal.combination,
        crystal.focus,
        elements.join(" "),
        operators.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 700),
    ).catch(() => ({ contextText: "", results: [] }));

    const prompt = [
      `Кристалл #${crystal.counter} (${crystal.code})`,
      `Тип: ${crystal.type}`,
      `Категория: ${crystal.category ?? "—"}`,
      `Фокус: ${crystal.focus ?? "—"}`,
      `Паттерн: ${crystal.pattern ?? "—"}`,
      `Сложность: ${crystal.complexity ?? "—"}`,
      `Quality score: ${typeof crystal.qualityScore === "number" ? crystal.qualityScore.toFixed(4) : "—"}`,
      "",
      "Комбинация:",
      crystal.combination,
      "",
      `Элементы: ${elements.join(", ") || "—"}`,
      `Операторы: ${operators.join("; ") || "—"}`,
      `Метрики: ${formatMetrics(metrics)}`,
      `Причины классификации: ${reasons.join("; ") || "—"}`,
      fullFile
        ? `Сокращенный JSON-контекст: ${JSON.stringify(minimizeFullFile(fullFile)).slice(0, 1200)}`
        : "",
      "",
      `Вопрос: ${question}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { provider, settings } = await getActiveProvider();

    let interpretation: string;
    let providerId = provider.id;
    let modelId = settings.chatModel;

    try {
      const result = await provider.chat(
        [{ role: "user", content: prompt }],
        {
          model: settings.chatModel,
          temperature: Math.min(settings.temperature, 0.7),
          topP: settings.topP,
          maxTokens: Math.min(settings.maxTokens, 1600),
          system: SYSTEM_PROMPT,
          ragContext: rag.contextText || undefined,
        },
      );
      interpretation = result.text;
      providerId = result.provider;
      modelId = result.model;
    } catch (error) {
      console.error("interpretation LLM failed:", error);
      interpretation = buildFallbackInterpretation({
        code: crystal.code,
        type: crystal.type,
        category: crystal.category,
        focus: crystal.focus,
        pattern: crystal.pattern,
        complexity: crystal.complexity,
        qualityScore: crystal.qualityScore,
        metrics,
        elements,
        operators,
        reasons,
      });
    }

    return NextResponse.json({
      ok: true,
      interpretation,
      ragResults: rag.results,
      provider: providerId,
      model: modelId,
      crystal: {
        id: crystal.id,
        code: crystal.code,
        type: crystal.type,
        focus: crystal.focus,
        combination: crystal.combination,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

function readFullFile(filepath: string | null) {
  if (!filepath || !existsSync(filepath)) return null;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return null;
  }
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      if (value && typeof value === "object") {
        const item = value as Record<string, unknown>;
        return String(item.word ?? item.name ?? item.key ?? item.symbol ?? JSON.stringify(value));
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeOperators(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const item = value as Record<string, unknown>;
        return [item.symbol, item.key, item.description]
          .filter(Boolean)
          .map(String)
          .join(" | ");
      }
      return "";
    })
    .filter(Boolean);
}

function formatMetrics(metrics: Record<string, unknown>) {
  const keys = ["V", "S", "N", "D_f", "G_S", "QEC", "CHSH", "C_val", "quality_score"];
  const entries = keys.filter((key) => metrics[key] != null);
  if (!entries.length) return "—";
  return entries
    .map((key) => {
      const value = metrics[key];
      return `${key}=${typeof value === "number" ? value.toFixed(4) : String(value)}`;
    })
    .join(", ");
}

function minimizeFullFile(fullFile: any) {
  return {
    meta: fullFile?.meta ?? null,
    crystal: {
      focus: fullFile?.crystal?.focus ?? null,
      pattern: fullFile?.crystal?.pattern ?? null,
      complexity: fullFile?.crystal?.complexity ?? null,
      quality_score: fullFile?.crystal?.quality_score ?? null,
    },
    classification: fullFile?.classification ?? null,
  };
}

function buildFallbackInterpretation(input: {
  code: string;
  type: string;
  category: string | null;
  focus: string | null;
  pattern: string | null;
  complexity: number | null;
  qualityScore: number | null;
  metrics: Record<string, unknown>;
  elements: string[];
  operators: string[];
  reasons: string[];
}) {
  return [
    `Кристалл ${input.code} относится к типу ${input.type}${input.category ? `, категория ${input.category}` : ""}.`,
    `Фокус: ${input.focus ?? "не указан"}. Паттерн: ${input.pattern ?? "не указан"}.`,
    `Сложность: ${input.complexity ?? "—"}, quality_score: ${typeof input.qualityScore === "number" ? input.qualityScore.toFixed(4) : "—"}.`,
    `Ключевые метрики: ${formatMetrics(input.metrics)}.`,
    input.reasons.length ? `Причины классификации: ${input.reasons.join("; ")}.` : "",
    input.elements.length ? `Элементы: ${input.elements.slice(0, 8).join(", ")}.` : "",
    input.operators.length ? `Операторы: ${input.operators.slice(0, 6).join("; ")}.` : "",
    "Комбинация выглядит как многодоменная гибридная конструкция с операторным связыванием нескольких смысловых слоев.",
    "Ответ собран локально по данным кристалла, потому что LLM не вернула стабильную интерпретацию.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
