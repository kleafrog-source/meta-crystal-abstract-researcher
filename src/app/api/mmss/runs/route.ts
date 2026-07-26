import { NextResponse } from "next/server";
import { listTaskJournalEntries } from "@/lib/task-journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit") ?? 12);
    const limit = Number.isFinite(limitParam) ? limitParam : 12;
    const runs = listTaskJournalEntries("mmss", limit);
    return NextResponse.json({
      ok: true,
      runs,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
