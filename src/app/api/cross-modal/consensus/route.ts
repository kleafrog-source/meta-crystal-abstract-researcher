import { NextResponse } from "next/server";

import { buildConsensus, type GraphSuggestion } from "@/lib/cross-modal/consensus";
import { getJournalRecord } from "@/lib/cross-modal/journal";
import type { ConsensusResultRow } from "@/lib/cross-modal/types";
import { loadGraph } from "@/lib/knowledge-graph/store";
import { readV3ParameterUnion } from "@/lib/meta-crystal-v3-lab";
import type { ActiveParameter, EnrichedParameter } from "@/lib/rag-v3/types";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

function activeParameter(parameter: EnrichedParameter, row: ConsensusResultRow & { selected_value: number | string }): ActiveParameter {
  const fallback = Array.isArray(parameter.default) ? JSON.stringify(parameter.default) : parameter.default;
  return { technical_name: parameter.technical_name, name_ru: parameter.name_ru, description_en: parameter.description_en, description_ru: parameter.description_ru, category: parameter.category ?? "Uncategorized", sub_category: parameter.sub_category ?? "General", ui_element: parameter.ui_element, min_value: parameter.min_value, max_value: parameter.max_value, step: parameter.step, default: fallback, suggested_value: row.selected_value, current_value: row.selected_value, before: fallback, source: "consensus", value_confidence: row.consensus_score, anchor_target: row.selected_value, detail: `${row.graph_only ? "graph depth=1" : `${row.direct_source_count} direct source(s)`}; ${row.conflict ? "value conflict resolved" : "values aligned"}`, unit: parameter.unit, options: parameter.options, min_length: parameter.min_length, max_length: parameter.max_length, lyria_prompt_tags: parameter.lyria_prompt_tags ?? [], semantic_keywords: parameter.semantic_keywords ?? [], similarity: row.consensus_score, domain: parameter.domain, quantity_kind: parameter.quantity_kind, axes: parameter.axes ?? [], retrieval_scope: parameter.retrieval_scope ?? "sound" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sources?: Array<{ record_id?: string; weight?: number }>; top_k?: number; graph_enabled?: boolean; graph_penalty?: number };
    const requested = Array.isArray(body.sources) ? body.sources.filter((item) => item.record_id && Number(item.weight) > 0).slice(0, 12) : [];
    if (!requested.length) return NextResponse.json({ error: "Select at least one Journal source with a positive weight" }, { status: 400 });
    const journalSources = await Promise.all(requested.map(async (item) => { const record = await getJournalRecord(item.record_id!); if (!record) throw new Error(`Journal record not found: ${item.record_id}`); return { record_id: record.id, modality: record.snapshot.modality, weight: Math.max(0, Math.min(1, Number(item.weight))), parameters: record.snapshot.parameters }; }));
    const { records } = await readV3ParameterUnion(); const metadata = new Map<string, EnrichedParameter>(); for (const [name, value] of records) metadata.set(name, value as unknown as EnrichedParameter);
    const graphSuggestions: GraphSuggestion[] = [];
    if (body.graph_enabled) {
      try {
        const graph = await loadGraph(); const directNames = new Set(journalSources.flatMap((source) => source.parameters.map((item) => item.technical_name))); const bySource = new Map<string, GraphSuggestion[]>();
        for (const edge of graph.graph.edges) { if (edge.type !== "semantic_neighbor" || typeof edge.similarity !== "number") continue; const left = edge.source.startsWith("parameter:") ? edge.source.slice(10) : ""; const right = edge.target.startsWith("parameter:") ? edge.target.slice(10) : ""; for (const [sourceName, targetName] of [[left, right], [right, left]]) { if (!sourceName || !targetName || !directNames.has(sourceName)) continue; const list = bySource.get(sourceName) ?? []; list.push({ source_name: sourceName, target_name: targetName, similarity: edge.similarity }); bySource.set(sourceName, list); } }
        for (const suggestions of bySource.values()) graphSuggestions.push(...suggestions.sort((a, b) => b.similarity - a.similarity || a.target_name.localeCompare(b.target_name)).slice(0, 2));
      } catch { /* Consensus remains valid when the optional graph is unavailable. */ }
    }
    const rows = buildConsensus(journalSources, metadata, Number(body.top_k) || 40, graphSuggestions, Number.isFinite(Number(body.graph_penalty)) ? Number(body.graph_penalty) : .35);
    const parameters = rows.flatMap((row) => { const parameter = metadata.get(row.technical_name); return parameter ? [activeParameter(parameter, row)] : []; });
    return NextResponse.json({ parameters, provenance: rows, source_count: journalSources.length, graph_enabled: Boolean(body.graph_enabled), graph_suggestion_count: graphSuggestions.length });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 }); }
}
