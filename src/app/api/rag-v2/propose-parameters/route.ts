import { NextResponse } from "next/server";

import { searchAndAnchor } from "@/lib/rag-v2/search";
import type { ProposeParametersRequest } from "@/lib/rag-v2/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: ProposeParametersRequest;

  try {
    body = (await request.json()) as ProposeParametersRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const payload = await searchAndAnchor({
      query: typeof body.query === "string" ? body.query : "",
      topK: typeof body.top_k === "number" ? body.top_k : 30,
      currentValues: body.current_values ?? {},
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
