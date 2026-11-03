import { NextResponse } from "next/server";

import { acquireEmbeddingModelSlot, getEmbeddingModelSlot, releaseEmbeddingModelSlot } from "@/lib/model-slot";
import { prepareGpuForV3Embedding } from "@/lib/ollama-memory";
import { TEXT_INDEX_MODELS } from "@/lib/rag-v3/composite-index";
import { searchV3 } from "@/lib/rag-v3/search";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { resolveGemmaIdentityValue } from "@/lib/am-stage-value-resolution";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SLOT_OWNER = "am-stage-value-resolution";

function isParameter(value: unknown): value is ActiveParameter {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ActiveParameter>;
  return typeof item.technical_name === "string"
    && /^[a-z0-9_]{1,180}$/u.test(item.technical_name)
    && (item.ui_element === "Range" || item.ui_element === "Select" || item.ui_element === "Toggle" || item.ui_element === "Text" || item.ui_element === "Array" || item.ui_element === "String")
    && (typeof item.default === "number" || typeof item.default === "string")
    && typeof item.similarity === "number";
}

export async function POST(request: Request) {
  let body: { query?: unknown; parameters?: unknown; clap_values?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "Expected a JSON value-resolution request." }, { status: 400 }); }

  const input = Array.isArray(body.parameters) ? body.parameters.filter(isParameter).slice(0, 500) : [];
  if (!input.length) return NextResponse.json({ error: "Provide Gemma AWTD parameters to resolve." }, { status: 400 });
  const unique = [...new Map(input.map((item) => [item.technical_name, item])).values()];
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 4_000) : "";
  const clapValues = body.clap_values && typeof body.clap_values === "object" ? body.clap_values as Record<string, unknown> : {};
  const slotOwner = SLOT_OWNER;
  if (!acquireEmbeddingModelSlot(slotOwner)) return NextResponse.json({ error: `Model slot busy: ${getEmbeddingModelSlot()?.owner ?? "another operation"}` }, { status: 409 });
  try {
    let anchored = new Map<string, ActiveParameter>();
    let anchorError: string | null = null;
    try {
      await prepareGpuForV3Embedding(5_000, TEXT_INDEX_MODELS.qwen3, slotOwner);
      const result = await searchV3({
        query: query || `Resolve values for these existing Gemma-selected controls: ${unique.map((item) => item.technical_name).join(", ")}`,
        topK: unique.length,
        currentValues: Object.fromEntries(unique.map((item) => [item.technical_name, item.current_value ?? item.default])),
        instructionContext: [],
        sources: { library: true, frozen: true, atoms: false, generated: true },
        candidateNames: unique.map((item) => item.technical_name),
        textIndex: "qwen3",
        modelSlotOwner: slotOwner,
        anchorAllCandidates: true,
      });
      anchored = new Map(result.results.map((item) => [item.technical_name, item]));
    } catch (error) {
      anchorError = error instanceof Error ? error.message : String(error);
    }

    const results = unique.map((identity) => {
      const clapCandidate = clapValues[identity.technical_name] as ActiveParameter | undefined;
      const clap = clapCandidate && isParameter(clapCandidate) ? clapCandidate : null;
      const valuePass = anchored.get(identity.technical_name);
      return resolveGemmaIdentityValue(identity, { ...(clap ? { sameWindowClap: clap } : {}), ...(valuePass ? { qwenAnchor: valuePass } : {}), ...(anchorError ? { anchorError } : {}) });
    });
    return NextResponse.json({ results, value_priority: ["same_window_clap", "qwen3_anchors", "catalogue_default"], anchor_fallback: Boolean(anchorError) });
  } finally {
    releaseEmbeddingModelSlot(slotOwner);
  }
}
