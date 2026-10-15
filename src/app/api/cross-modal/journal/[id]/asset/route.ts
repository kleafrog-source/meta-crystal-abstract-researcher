import { NextResponse } from "next/server";

import { readJournalAsset } from "@/lib/cross-modal/journal";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const result = await readJournalAsset(id);
    if (!result) return NextResponse.json({ error: "Journal asset not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(result.bytes), { headers: { "Content-Type": result.record.asset!.mime_type, "Content-Length": String(result.bytes.byteLength), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(result.record.asset!.original_name)}`, "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
