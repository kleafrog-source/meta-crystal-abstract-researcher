import { NextResponse } from "next/server";
import { getNormalizationStatus } from "@/lib/am-parameters-catalogue/normalization-jobs";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getNormalizationStatus()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
