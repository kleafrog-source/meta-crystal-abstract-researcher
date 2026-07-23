import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/llm/messages — recent chat messages for history.
 * Query: ?limit=50
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50", 10));
    const msgs = await db.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    // Reverse to chronological order
    msgs.reverse();
    return NextResponse.json({
      ok: true,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ragContext: m.ragContext,
        provider: m.provider,
        model: m.model,
        createdAt: m.createdAt,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/llm/messages — clear all chat history.
 */
export async function DELETE() {
  try {
    await db.chatMessage.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
