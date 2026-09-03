// POST /api/generate-macro
//
// Replaces the FastAPI `POST /api/generate-macro` endpoint. Stamps the
// user's currently-tuned parameters into the Flowmusic UNIFIED PROTOCOL
// override template. Pure text templating — no LLM involved.

import { NextResponse } from "next/server";
import type { GenerateMacroRequest, GenerateMacroResponse } from "@/lib/rag-types";

export const dynamic = "force-dynamic";

const PROTOCOL_URL =
  "https://raw.githubusercontent.com/kleafrog-source/meta-crystal-abstract-researcher/refs/heads/main/meta_lexicon/flowmusic-instructions/UNIFIED_PROTOCOL_v4_49-VMTS-Indian_Meta-Genesis.md";
const DATASET_URL =
  "https://raw.githubusercontent.com/kleafrog-source/meta-crystal-abstract-researcher/refs/heads/main/meta_lexicon/flowmusic-instructions/parameters-dataset.json";

function formatValue(value: number | string): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value);
}

export async function POST(req: Request) {
  let body: GenerateMacroRequest;
  try {
    body = (await req.json()) as GenerateMacroRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.parameters)) {
    return NextResponse.json(
      { error: "`parameters` must be an array" },
      { status: 400 },
    );
  }

  const overrideLines: string[] = [];
  for (const p of body.parameters) {
    const name = String(p.technical_name ?? "").trim();
    if (!name) continue;
    const val = formatValue(p.current_value);
    const unit = p.unit && String(p.unit).trim() ? ` ${String(p.unit).trim()}` : "";
    overrideLines.push(`   - ${name}: ${val}${unit}`);
  }

  const overrides =
    overrideLines.length > 0
      ? overrideLines.join("\n")
      : "   (no active parameters — run a semantic query first)";

  const macro = [
    `1. FETCH ${PROTOCOL_URL}`,
    `2. FETCH ${DATASET_URL}`,
    `3. PARSE categories from the dataset based on semantic vector similarity to user query.`,
    `4. OVERRIDE: The selected parameters take priority over the base UNIFIED Ω-PROTOCOL v4.49 instruction.`,
    `5. APPLIED OVERRIDES:`,
    overrides,
    `6. GENERATE output exclusively using the selected categories' sonic blueprints integrating with the overridden protocol.`,
  ].join("\n");

  const payload: GenerateMacroResponse = {
    macro,
    parameter_count: overrideLines.length,
  };
  return NextResponse.json(payload);
}
