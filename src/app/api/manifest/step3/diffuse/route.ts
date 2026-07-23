import { NextResponse } from "next/server";
import { diffuseCrystals } from "@/lib/manifestation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body?.donor_ids) || body.donor_ids.length < 2) {
      return NextResponse.json({ ok: false, error: "donor_ids must contain at least 2 items" }, { status: 400 });
    }
    const result = await diffuseCrystals(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
