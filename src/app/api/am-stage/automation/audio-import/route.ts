import { NextResponse } from "next/server";
import { addAssetReference, saveAudioAsset } from "@/lib/am-stage-automation/storage";
import { listAllowedAudioImports, readAllowedAudioImport } from "@/lib/am-stage-automation/audio-import";

export const runtime = "nodejs";
export const maxDuration = 300;

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes("not configured") || message.includes("ENOENT") ? 503 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try { return NextResponse.json({ configured: true, files: await listAllowedAudioImports() }); }
  catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) return NextResponse.json({ configured: false, files: [], error: error.message }, { status: 200 });
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown };
    if (typeof body.name !== "string") return NextResponse.json({ error: "Choose an audio file from the import list." }, { status: 400 });
    const source = await readAllowedAudioImport(body.name);
    const asset = await saveAudioAsset({ bytes: source.bytes, filename: source.name, mimeType: source.mimeType });
    await addAssetReference(asset.id, "automation-workbench", `current:${asset.id}`);
    return NextResponse.json({ asset, imported: { filename: source.name, sizeBytes: source.sizeBytes } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
