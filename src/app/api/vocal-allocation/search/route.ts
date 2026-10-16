import { NextResponse } from "next/server";
import { readGenesisLibrary, type GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import { searchV3 } from "@/lib/rag-v3/search";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { prepareGpuForV3Embedding } from "@/lib/ollama-memory";
import { isVocalMatrixParameter, parseVocalQuery, selectOption } from "@/lib/vocal-allocation/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function fromLibrary(p: GenesisLibraryParameter): ActiveParameter {
  const value = Array.isArray(p.default) ? p.default.join(", ") : (p.default as number | string ?? "");
  return { technical_name: String(p.technical_name), name_ru: typeof p.name_ru === "string" ? p.name_ru : undefined, description_en: typeof p.description_en === "string" ? p.description_en : undefined, description_ru: typeof p.description_ru === "string" ? p.description_ru : undefined, category: String(p.category ?? "vocal"), sub_category: String(p.sub_category ?? "matrix"), ui_element: (p.ui_element as ActiveParameter["ui_element"]) ?? "String", min_value: typeof p.min_value === "number" ? p.min_value : undefined, max_value: typeof p.max_value === "number" ? p.max_value : undefined, step: typeof p.step === "number" ? p.step : undefined, default: value, suggested_value: value, current_value: value, before: value, source: "default", detail: "Добавлено целевым парсером Vocal Allocation Matrix", unit: typeof p.unit === "string" ? p.unit : undefined, options: Array.isArray(p.options) ? p.options.map(String) : undefined, lyria_prompt_tags: Array.isArray(p.lyria_prompt_tags) ? p.lyria_prompt_tags.map(String) : [], semantic_keywords: Array.isArray(p.semantic_keywords) ? p.semantic_keywords.map(String) : [], similarity: 1, domain: typeof p.domain === "string" ? p.domain : null, quantity_kind: typeof p.quantity_kind === "string" ? p.quantity_kind : null, axes: Array.isArray(p.axes) ? p.axes.map(String) : [], retrieval_scope: "sound" };
}

function nearbyRole(query: string, token: string): "lead" | "whisper" | "ritual" | null {
  const text = query.toLowerCase();
  const position = text.indexOf(token.toLowerCase());
  if (position < 0) return null;
  const start = Math.max(text.lastIndexOf(";", position), text.lastIndexOf(".", position), text.lastIndexOf(",", position));
  const ends = [text.indexOf(";", position), text.indexOf(".", position), text.indexOf(",", position)].filter((value) => value >= 0);
  const clause = text.slice(start + 1, ends.length ? Math.min(...ends) : text.length);
  if (/(whisper|шепот|шёпот|ambient)/.test(clause)) return "whisper";
  if (/(choir|choral|ritual|хор|ритуал)/.test(clause)) return "ritual";
  if (/(lead|лид|primary|основн)/.test(clause)) return "lead";
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: string; top_k?: number };
    const query = String(body.query ?? "").trim();
    if (!query) return NextResponse.json({ error: "Введите описание вокальной матрицы." }, { status: 400 });
    await prepareGpuForV3Embedding();
    const parsed = parseVocalQuery(query);
    const [search, library] = await Promise.all([searchV3({ query, topK: Math.max(80, body.top_k ?? 40), currentValues: {}, instructionContext: [], sources: { library: true, frozen: false, atoms: false, generated: false } }), readGenesisLibrary()]);
    const byName = new Map(library.map((p) => [String(p.technical_name), p]));
    const results = search.results.filter(isVocalMatrixParameter).slice(0, body.top_k ?? 40);
    const resultMap = new Map(results.map((p) => [p.technical_name, p]));
    const ensure = (name: string) => { if (!resultMap.has(name) && byName.has(name)) resultMap.set(name, fromLibrary(byName.get(name)!)); return resultMap.get(name); };
    const set = (name: string, value: number | string | undefined, reason: string) => { if (value === undefined) return; const p = ensure(name); if (!p) return; p.current_value = value; p.suggested_value = value; p.source = "lexical"; p.value_confidence = 1; p.detail = reason; };

    const languageSlots = ["iso_language_primary_layer_1", "iso_language_primary_layer_2", "iso_language_primary_layer_3", "iso_language_secondary_layer_1", "iso_language_secondary_layer_2", "iso_language_secondary_layer_3", "vocal_language_iso_code"];
    parsed.languages.slice(0, languageSlots.length).forEach((code, index) => { const p = ensure(languageSlots[index]); set(languageSlots[index], selectOption(p?.options, code) ?? code, `Язык распознан явно: ${code}`); });
    const techniqueSlots: Record<string, string> = { VGUT: "technique_primary_lead_layer", VFRY: "technique_primary_lead_layer", VCLR: "technique_ritual_chant_layer", VWSP: "technique_ambient_whisper_layer", VINH: "vocal_technique_primary_mode", VGRN: "vocal_technique_primary_mode" };
    parsed.techniques.forEach((code) => { const role = nearbyRole(query, code); const name = role === "whisper" ? "technique_ambient_whisper_layer" : role === "ritual" ? "technique_ritual_chant_layer" : role === "lead" ? "technique_primary_lead_layer" : techniqueSlots[code]; const p = ensure(name); set(name, selectOption(p?.options, code) ?? code, `TECH4 распознан явно: ${code}`); });
    const fxSlots: Record<string, string> = { DRV1: "fx_chain_primary_lead", PSH1: "fx_chain_primary_lead", FMT1: "vocal_fx_chain_select", GRN1: "vocal_fx_chain_select", DLY1: "fx_chain_ambient_whisper", RVB1: "fx_chain_ritual_chant" };
    parsed.effects.forEach((code) => { const role = nearbyRole(query, code); const name = role === "whisper" ? "fx_chain_ambient_whisper" : role === "ritual" ? "fx_chain_ritual_chant" : role === "lead" ? "fx_chain_primary_lead" : fxSlots[code]; const p = ensure(name); set(name, selectOption(p?.options, code) ?? code, `FX4 распознан явно: ${code}`); });
    const digitNames: Record<string, string> = { i: "impact_aggression_digit_i", s: "spatial_stereo_width_digit_s", e: "entropy_chaos_digit_e", a: "vocal_vector_adaptive_alignment_a" };
    Object.entries(parsed.digits).forEach(([key, value]) => set(digitNames[key], value, `${key.toUpperCase()} задан явно`));
    const ordered = [...resultMap.values()].sort((a, b) => Number(/распознан явно|задан явно/.test(b.detail)) - Number(/распознан явно|задан явно/.test(a.detail)));
    return NextResponse.json({ query, parsed, results: ordered.slice(0, body.top_k ?? 40), total_scoped: resultMap.size });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
