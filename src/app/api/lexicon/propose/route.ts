import { NextResponse } from "next/server";
import { proposeSemanticConfiguration } from "@/lib/semantic-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      query?: string;
      profile?: Record<string, unknown>;
      entityTypes?: string[];
      topK?: number;
    };

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ ok: false, error: "query is required" }, { status: 400 });
    }

    const proposal = await proposeSemanticConfiguration({
      query,
      profile: body.profile ?? null,
      entityTypes: Array.isArray(body.entityTypes) ? body.entityTypes as never : undefined,
      topK: typeof body.topK === "number" ? body.topK : undefined,
    });

    return NextResponse.json({ ok: true, proposal });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Semantic proposal failed" },
      { status: 500 },
    );
  }
}
