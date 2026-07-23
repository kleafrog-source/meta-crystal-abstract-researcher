import { NextResponse } from "next/server";
import { searchManifestEmbeddings } from "@/lib/manifestation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.query) {
      return NextResponse.json({ ok: false, error: "query is required" }, { status: 400 });
    }
    const result = await searchManifestEmbeddings(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
