import { NextResponse } from "next/server";
import { ensureKnowledgeEmbeddings } from "@/lib/rag";
import { syncKnowledgeBase } from "@/lib/engine/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/llm/index_kb
 * Body: { force?: boolean }
 * Pulls the engine knowledge base (lexicon, operators, patterns, focus)
 * into the KnowledgeEntity table and computes embeddings for any missing
 * entries. Returns counts.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    const sync = await syncKnowledgeBase();
    const emb = await ensureKnowledgeEmbeddings(force);

    return NextResponse.json({
      ok: true,
      synced: sync,
      embedded: emb,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
