import { NextResponse } from "next/server";

import { getJournalRecord } from "@/lib/cross-modal/journal";
import type { TransitionPreparedRow } from "@/lib/cross-modal/types";
import { readV3ParameterUnion } from "@/lib/meta-crystal-v3-lab";
import type { ActiveParameter, EnrichedParameter } from "@/lib/rag-v3/types";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

function base(parameter: EnrichedParameter): ActiveParameter {
  const fallback = Array.isArray(parameter.default) ? JSON.stringify(parameter.default) : parameter.default;
  return { technical_name: parameter.technical_name, name_ru: parameter.name_ru, description_en: parameter.description_en, description_ru: parameter.description_ru, category: parameter.category ?? "Uncategorized", sub_category: parameter.sub_category ?? "General", ui_element: parameter.ui_element, min_value: parameter.min_value, max_value: parameter.max_value, step: parameter.step, default: fallback, suggested_value: fallback, current_value: fallback, before: fallback, source: "transition", detail: "prepared parameter-space transition", unit: parameter.unit, options: parameter.options, min_length: parameter.min_length, max_length: parameter.max_length, lyria_prompt_tags: parameter.lyria_prompt_tags ?? [], semantic_keywords: parameter.semantic_keywords ?? [], similarity: 0, domain: parameter.domain, quantity_kind: parameter.quantity_kind, axes: parameter.axes ?? [], retrieval_scope: parameter.retrieval_scope ?? "sound" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { record_a?: string; record_b?: string };
    if (!body.record_a || !body.record_b || body.record_a === body.record_b) return NextResponse.json({ error: "Choose two different Journal records" }, { status: 400 });
    const [a, b, union] = await Promise.all([getJournalRecord(body.record_a), getJournalRecord(body.record_b), readV3ParameterUnion()]); if (!a || !b) return NextResponse.json({ error: "Transition source record was not found" }, { status: 404 });
    const mapA = new Map(a.snapshot.parameters.map((item) => [item.technical_name, item])); const mapB = new Map(b.snapshot.parameters.map((item) => [item.technical_name, item])); const names = [...new Set([...mapA.keys(), ...mapB.keys()])].sort(); const rows: TransitionPreparedRow[] = [];
    for (const name of names) { const metadata = union.records.get(name) as unknown as EnrichedParameter | undefined; if (!metadata) continue; const left = mapA.get(name); const right = mapB.get(name); const fallback = Array.isArray(metadata.default) ? JSON.stringify(metadata.default) : metadata.default; rows.push({ parameter: base(metadata), score_a: left?.normalized_score ?? 0, score_b: right?.normalized_score ?? 0, value_a: left?.selected_value ?? fallback, value_b: right?.selected_value ?? fallback, present_a: Boolean(left), present_b: Boolean(right) }); }
    return NextResponse.json({ record_a: { id: a.id, label: a.label, modality: a.snapshot.modality }, record_b: { id: b.id, label: b.label, modality: b.snapshot.modality }, rows });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 }); }
}
