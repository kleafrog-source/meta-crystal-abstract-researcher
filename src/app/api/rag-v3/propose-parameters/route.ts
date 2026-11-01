import { NextResponse } from "next/server";

import { searchV3, type RagV3Sources } from "@/lib/rag-v3/search";
import type { ProposeParametersRequest } from "@/lib/rag-v3/types";
import { prepareGpuForV3Embedding } from "@/lib/ollama-memory";
import type { TextIndexId } from "@/lib/rag-v3/composite-index";
import { TEXT_INDEX_MODELS } from "@/lib/rag-v3/composite-index";
import { getArtifactStatuses } from "@/lib/rag-v3/managed-rebuild";
import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const slotOwner = "semantic-search";
  if (!acquireEmbeddingModelSlot(slotOwner)) {
    return NextResponse.json({ error: `Embedding model slot is busy: ${getEmbeddingModelSlot()?.owner ?? "unknown operation"}` }, { status: 409 });
  }
  try {
    const body = (await request.json()) as ProposeParametersRequest & {
      sources?: RagV3Sources;
      text_index?: TextIndexId;
    };
    const textIndex: TextIndexId = body.text_index === "embeddinggemma2" ? "embeddinggemma2" : "qwen3";
    if (textIndex === "embeddinggemma2") {
      const gemmaIndex = (await getArtifactStatuses()).artifacts.find((artifact) => artifact.kind === "embeddinggemma2_text");
      if (!gemmaIndex || gemmaIndex.status !== "built") {
        const detail = gemmaIndex?.status === "stale" ? ` Rebuild it: ${gemmaIndex.reason ?? "source catalogue changed"}.` : " Build it from Service Bay first.";
        return NextResponse.json({ error: `EmbeddingGemma 2 text index is unavailable.${detail}` }, { status: 409 });
      }
    }
    await prepareGpuForV3Embedding(5_000, TEXT_INDEX_MODELS[textIndex], slotOwner);
    return NextResponse.json(
      await searchV3({
        query: typeof body.query === "string" ? body.query : "",
        topK: typeof body.top_k === "number" ? body.top_k : 50,
        currentValues: body.current_values ?? {},
        instructionContext: Array.isArray(body.instruction_context)
          ? body.instruction_context
          : [],
        sources: body.sources ?? {},
        scopes: body.scopes,
        selectedDomainLayers: body.domain_layers,
        domainLayerWeights: body.domain_layer_weights,
        textIndex,
        modelSlotOwner: slotOwner,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    releaseEmbeddingModelSlot(slotOwner);
  }
}
