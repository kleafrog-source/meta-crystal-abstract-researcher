import { NextResponse } from "next/server";

import { getArtifactStatuses } from "@/lib/rag-v3/managed-rebuild";
import { getCompositeIndexInfo, getCompositeParameterNames, getCompositeVectorsByNames, TEXT_INDEX_MODELS, type TextIndexId } from "@/lib/rag-v3/composite-index";
import { searchV3, type RagV3Sources, type RagV3Scopes } from "@/lib/rag-v3/search";
import type { ActiveParameter, RetrievalScope } from "@/lib/rag-v3/types";
import { buildStage2Centroid, keepOnlyNewStage2Hits } from "@/lib/server-stage2-consensus";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Stage2Request {
  stage1_hits?: Array<{ technical_name: string; similarity: number }>;
  source_query?: string;
  top_k?: number;
  text_index?: TextIndexId;
  sources?: Partial<RagV3Sources>;
  scopes?: Partial<RagV3Scopes>;
  domain_layers?: string[];
  domain_layer_weights?: Record<string, number>;
}

function validStage1Hits(value: Stage2Request["stage1_hits"]): Array<{ technical_name: string; similarity: number }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 1000).flatMap((item) => {
    if (!item || typeof item.technical_name !== "string" || !/^[a-z0-9_]{1,180}$/u.test(item.technical_name) || !Number.isFinite(item.similarity)) return [];
    return [{ technical_name: item.technical_name, similarity: Math.max(-1, Math.min(1, item.similarity)) }];
  });
}

export async function POST(request: Request) {
  let body: Stage2Request;
  try { body = await request.json() as Stage2Request; }
  catch { return NextResponse.json({ error: "Expected a JSON Stage-1 result payload." }, { status: 400 }); }

  const stage1Hits = validStage1Hits(body.stage1_hits);
  if (stage1Hits.length === 0) return NextResponse.json({ error: "Run a Stage-1 text search before Stage-2 retrieval." }, { status: 400 });
  const textIndex: TextIndexId = body.text_index === "embeddinggemma2" ? "embeddinggemma2" : "qwen3";
  const topK = Number.isFinite(body.top_k) ? Math.max(1, Math.min(30, Math.round(body.top_k!))) : 10;

  try {
    if (textIndex === "embeddinggemma2") {
      const artifact = (await getArtifactStatuses()).artifacts.find((item) => item.kind === "embeddinggemma2_text");
      if (!artifact || artifact.status !== "built") {
        const detail = artifact?.status === "stale" ? ` Rebuild it: ${artifact.reason ?? "source catalogue changed"}.` : " Build it from Service Bay first.";
        return NextResponse.json({ error: `EmbeddingGemma 2 text index is unavailable.${detail}` }, { status: 409 });
      }
    }

    const seedNames = [...new Set(stage1Hits.map((hit) => hit.technical_name))];
    const storedVectors = await getCompositeVectorsByNames(seedNames, textIndex);
    const similarityByName = new Map(stage1Hits.map((hit) => [hit.technical_name, hit.similarity]));
    const centroid = buildStage2Centroid(storedVectors.map((item) => ({
      technical_name: item.name,
      similarity: similarityByName.get(item.name) ?? 0,
      vector: item.vector,
    })));
    if (!centroid) return NextResponse.json({ error: `No usable Stage-1 vectors were found in the selected ${textIndex} index.` }, { status: 409 });

    const excluded = new Set(seedNames);
    const candidateNames = (await getCompositeParameterNames(textIndex)).filter((name) => !excluded.has(name));
    if (candidateNames.length === 0) return NextResponse.json({ error: "The selected text index has no candidates outside Stage-1." }, { status: 409 });
    const sourceQuery = typeof body.source_query === "string" ? body.source_query.trim().slice(0, 2_000) : "";
    const externalQueryText = [
      sourceQuery ? `Source query: ${sourceQuery}` : "Stage-1 result neighborhood",
      `Coherence anchors around: ${centroid.seedNames.join(", ")}`,
    ].join(". ");

    const retrieved = await searchV3({
      query: sourceQuery,
      topK,
      currentValues: {},
      instructionContext: [],
      sources: { library: true, frozen: true, generated: true, ...body.sources, atoms: false },
      scopes: body.scopes,
      selectedDomainLayers: body.domain_layers,
      domainLayerWeights: body.domain_layer_weights,
      candidateNames,
      textIndex,
      queryEmbedding: centroid.vector,
      externalQueryText,
    });
    const newResults = keepOnlyNewStage2Hits(seedNames, retrieved.results);
    const stage2Hits: ActiveParameter[] = newResults.map((parameter) => ({
      ...parameter,
      source: "stage2",
      detail: `Stage-2 server retrieval · ${textIndex} · ${parameter.detail}`,
    }));
    const manifest = await getCompositeIndexInfo(textIndex);
    return NextResponse.json({
      stage2_hits: stage2Hits,
      stage2_meta: {
        text_index: textIndex,
        model: TEXT_INDEX_MODELS[textIndex],
        dimensions: manifest.dimensions,
        query_method: "weighted_centroid_of_stage1_text_vectors",
        seed_names: centroid.seedNames,
        excluded_stage1_names: seedNames.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
