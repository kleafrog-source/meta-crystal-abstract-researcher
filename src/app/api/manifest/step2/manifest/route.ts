import { NextResponse } from "next/server";
import { manifestCrystals } from "@/lib/manifestation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body?.crystal_ids) || body.crystal_ids.length < 1) {
      return NextResponse.json({ ok: false, error: "crystal_ids is required" }, { status: 400 });
    }
    const result = await manifestCrystals(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status });
  }
}
