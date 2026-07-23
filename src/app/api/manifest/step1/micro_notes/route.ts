import { NextResponse } from "next/server";
import { createMicroNotes } from "@/lib/manifestation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body?.crystal_ids) || body.crystal_ids.length < 1) {
      return NextResponse.json({ ok: false, error: "crystal_ids is required" }, { status: 400 });
    }
    const result = await createMicroNotes(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
