import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";
import type { ParamToTextSnapshot } from "@/lib/param-to-text";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 512_000) return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
    const body = await request.json() as { snapshot?: ParamToTextSnapshot };
    const snapshot = body.snapshot;
    if (!snapshot || snapshot.schema !== "param_to_text_snapshot_v1" || !Array.isArray(snapshot.parameters)) {
      return NextResponse.json({ error: "Expected param_to_text_snapshot_v1." }, { status: 400 });
    }
    if (snapshot.parameters.length > 100) return NextResponse.json({ error: "Snapshot may contain at most 100 parameters." }, { status: 400 });
    const allowedEvidence = {
      tags: Array.isArray(snapshot.tags_only) ? snapshot.tags_only.slice(0, 40).map((item) => String(item).slice(0, 180)) : [],
      fragments: Array.isArray(snapshot.ranked_fragments) ? snapshot.ranked_fragments.slice(0, 24).map(({ technical_name, kind, text, intensity }) => ({ technical_name: String(technical_name).slice(0, 180), kind, text: String(text).slice(0, 360), intensity })) : [],
      parameters: snapshot.parameters.slice(0, 40).map((entry) => ({ technical_name: String(entry.technical_name).slice(0, 180), intensity: entry.intensity, unit: entry.unit, value_mean: entry.value_mean, value_min: entry.value_min, value_max: entry.value_max, prevalence: entry.prevalence, mean_similarity: entry.mean_similarity, descriptions: entry.description_fragments.slice(0, 2) })),
    };
    const { provider, settings } = await getActiveProvider();
    const result = await provider.chat([
      { role: "system", content: "Write cautious, concise draft audio descriptions in English and Russian using only the supplied evidence. Do not infer genre, instruments, mood, production details, or causes unless the evidence explicitly states them. Describe uncertain traits as approximate. Never add facts that are absent. Return only JSON with string keys description_natural_en and description_natural_ru." },
      { role: "user", content: JSON.stringify(allowedEvidence) },
    ], { model: settings.chatModel, temperature: 0.2, topP: 0.8, maxTokens: 600, format: "json" });
    const parsed = JSON.parse(result.text) as { description_natural_en?: unknown; description_natural_ru?: unknown };
    if (typeof parsed.description_natural_en !== "string" || typeof parsed.description_natural_ru !== "string") {
      return NextResponse.json({ error: "The configured model did not return both description fields." }, { status: 502 });
    }
    return NextResponse.json({ description_natural_en: parsed.description_natural_en.slice(0, 1200), description_natural_ru: parsed.description_natural_ru.slice(0, 1200), provider: result.provider, model: result.model, generated_at: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
