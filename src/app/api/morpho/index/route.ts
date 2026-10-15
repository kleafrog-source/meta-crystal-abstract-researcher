import { NextResponse } from "next/server";
import { startMorphoIndex, stopMorpho } from "@/lib/morpho/jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() {
  const result = startMorphoIndex();
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}
export async function DELETE() {
  const result = await stopMorpho("index");
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
