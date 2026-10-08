import { NextResponse } from "next/server";

import { searchV3, type RagV3Sources } from "@/lib/rag-v3/search";
import type { ProposeParametersRequest } from "@/lib/rag-v3/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json() as ProposeParametersRequest & { sources?: RagV3Sources };
    return NextResponse.json(await searchV3({
      query: typeof body.query === "string" ? body.query : "",
      topK: typeof body.top_k === "number" ? body.top_k : 50,
      currentValues: body.current_values ?? {},
      instructionContext: Array.isArray(body.instruction_context) ? body.instruction_context : [],
      sources: body.sources ?? {},
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

