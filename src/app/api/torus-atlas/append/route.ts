import { NextResponse } from "next/server";
import { appendNewCrystalsToCurrentAtlas } from "@/lib/torus-atlas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = body?.limit !== undefined ? Number(body.limit) : undefined;
    return NextResponse.json(await appendNewCrystalsToCurrentAtlas(limit));
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
