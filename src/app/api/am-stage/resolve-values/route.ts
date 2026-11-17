import { NextResponse } from "next/server";

import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { prepareGpuForV3Embedding } from "@/lib/ollama-memory";
import { getConfiguredTextIndexModel } from "@/lib/rag-v3/composite-index";
import { searchV3 } from "@/lib/rag-v3/search";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SLOT_OWNER = "am-stage-value-resolution";

export async function POST(request: Request) {
  const settings = await loadLLMSettings();
  if (!capabilityIsEnabled(settings.capabilityRegistry, "text.gemma.resolved")) {
    return NextResponse.json({ error: "text.gemma.resolved is disabled in Settings." }, { status: 409 });
  }
  let body: {
    query?: unknown;
    parameters?: unknown;
    run_id?: unknown;
    stage_id?: unknown;
    attempt_id?: unknown;
    window_id?: unknown;
  };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "Expected a JSON Gemma value-selection request." }, { status: 400 }); }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, 4_000) : "";
  if (!query) return NextResponse.json({ error: "Gemma value selection requires input content." }, { status: 400 });
  if (!Array.isArray(body.parameters) || body.parameters.length === 0 || body.parameters.length > 500) {
    return NextResponse.json({ error: "Provide 1–500 parameters from the bound Gemma identity bank." }, { status: 400 });
  }
  const names = body.parameters.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as { technical_name?: unknown };
    if (typeof item.technical_name !== "string" || !/^[a-z0-9_]{1,180}$/u.test(item.technical_name)
    ) return [];
    return [item.technical_name];
  });
  const uniqueNames = [...new Set(names)];
  if (!uniqueNames.length) return NextResponse.json({ error: "The bound identity bank contains no valid typed catalogue parameters." }, { status: 400 });

  if (!acquireEmbeddingModelSlot(SLOT_OWNER)) {
    return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}` }, { status: 409 });
  }
  try {
    const model = await getConfiguredTextIndexModel("embeddinggemma2");
    await prepareGpuForV3Embedding(5_000, model, SLOT_OWNER);
    const result = await searchV3({
      query,
      topK: uniqueNames.length,
      currentValues: {},
      instructionContext: [],
      sources: { library: true, atoms: false, generated: true },
      candidateNames: uniqueNames,
      textIndex: "embeddinggemma2",
      modelSlotOwner: SLOT_OWNER,
      diagnosticContext: {
        ...(typeof body.run_id === "string" ? { run_id: body.run_id } : {}),
        ...(typeof body.stage_id === "string" ? { stage_id: body.stage_id } : {}),
        ...(typeof body.attempt_id === "string" ? { attempt_id: body.attempt_id } : {}),
        ...(typeof body.window_id === "string" ? { window_id: body.window_id } : {}),
      },
    });
    return NextResponse.json({ results: result.results, text_index: "embeddinggemma2", model, input_parameter_count: uniqueNames.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: /bundle|artifact|candidate/i.test(message) ? 409 : 500 });
  } finally {
    releaseEmbeddingModelSlot(SLOT_OWNER);
  }
}
