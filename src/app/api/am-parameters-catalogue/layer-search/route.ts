import { NextRequest, NextResponse } from "next/server";
import { readCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
import { buildEffectiveQuery, sanitizeInstructionText, normalizeInfluence } from "@/lib/rag-v3/instruction-support";
import type { InstructionContextEntry } from "@/lib/rag-v3/types";
import { embedText } from "@/lib/ollama-client";
import { prepareGpuForV3Embedding } from "@/lib/ollama-memory";
import { rankCompositeNames } from "@/lib/rag-v3/composite-index";
import { classifyDomainLayer, DOMAIN_LAYER_TEMPLATES, isExcludedFromDomainLayers, type DomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { query?: string; top_k?: number; instructions?: InstructionContextEntry[]; layer?: string; category_prefix?: string };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return NextResponse.json({ error: "Введите семантическую цель." }, { status: 400 });
    const instructions = Array.isArray(body.instructions) ? body.instructions.slice(0, 10).filter((slot) => typeof slot?.content === "string" && slot.content.trim()).map((slot) => ({ id: String(slot.id ?? ""), title: String(slot.title ?? "Instruction"), content: sanitizeInstructionText(slot.content), influence: normalizeInfluence(Number(slot.influence) || 0) })) : [];
    const effectiveQuery = buildEffectiveQuery(query, instructions);
    const topK = Math.max(1, Math.min(700, Math.round(Number(body.top_k) || 50)));
    const layer = DOMAIN_LAYER_TEMPLATES.some((item) => item.id === body.layer) ? body.layer as DomainLayer : null;
    await prepareGpuForV3Embedding();
    const vector = await embedText(effectiveQuery);
    const parameters = await readCatalogueParameters();
    const prefix = typeof body.category_prefix === "string" ? body.category_prefix.trim().toLocaleLowerCase() : "";
    const candidates = parameters.filter((item) => !isExcludedFromDomainLayers(item.technical_name, String(item.category ?? "")) && (!prefix || String(item.category ?? "").toLocaleLowerCase().startsWith(prefix)));
    const ranked = await rankCompositeNames(vector, candidates.map((item) => item.technical_name), topK);
    const byName = new Map(candidates.map((item) => [item.technical_name, item]));
    const results = ranked.flatMap((item) => {
      const parameter = byName.get(item.name);
      if (!parameter) return [];
      const template = layer && DOMAIN_LAYER_TEMPLATES.find((entry) => entry.id === layer);
      const keyIdHits = template?.key_ids.filter((prefixValue) => item.name.toLowerCase().startsWith(prefixValue.toLowerCase())).length ?? 0;
      const regexLayer = classifyDomainLayer(item.name, String(parameter.category ?? ""));
      return [{ ...parameter, sim: item.similarity, weighted_score: 1.5 * Number(regexLayer === layer) + item.similarity + 0.3 * keyIdHits, regex_layer: regexLayer, proposed_layer: regexLayer ?? layer, key_id_hits: keyIdHits }];
    });
    return NextResponse.json({ query, effective_query: effectiveQuery, top_k: topK, layer, index: "existing_composite_index", total_candidates: candidates.length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
