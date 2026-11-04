import { NextResponse } from "next/server";

import { searchV3, type RagV3Sources } from "@/lib/rag-v3/search";
import type { ProposeParametersRequest } from "@/lib/rag-v3/types";
import { prepareGpuForV3Embedding } from "@/lib/ollama-memory";
import type { TextIndexId } from "@/lib/rag-v3/composite-index";
import { getConfiguredTextIndexModel } from "@/lib/rag-v3/composite-index";
import { isArtifactManifestAvailable } from "@/lib/rag-v3/managed-rebuild";
import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";

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
    const settings = await loadLLMSettings();
    const capability = textIndex === "embeddinggemma2" ? "text.gemma.awtd" : "text.qwen.resolved";
    if (!capabilityIsEnabled(settings.capabilityRegistry, capability)) {
      return NextResponse.json({ error: `${capability} is disabled in Settings.` }, { status: 409 });
    }
    if (textIndex === "embeddinggemma2") {
      const model = await getConfiguredTextIndexModel(textIndex);
      if (!(await isArtifactManifestAvailable("embeddinggemma2_text", model))) return NextResponse.json({ error: "EmbeddingGemma 2 text index is unavailable or configured to a different model. Check status and rebuild in Service Bay." }, { status: 409 });
    }
    const model = await getConfiguredTextIndexModel(textIndex);
    await prepareGpuForV3Embedding(5_000, model, slotOwner);
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
