import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store/system-store";

/**
 * POST /api/chat
 * Body: { message: string }
 *
 * Auto-detect operation (REMEMBER/FORGET/UPDATE/REFLECT/QUERY/CHAT)
 * via stub memory-ops.ts and route through full pipeline.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message: string = body.message ?? "";

  if (!message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const store = getStore();
  const response = await store.processChat(message);

  return NextResponse.json(response);
}
