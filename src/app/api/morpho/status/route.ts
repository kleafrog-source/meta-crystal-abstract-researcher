import { NextRequest, NextResponse } from "next/server";
import { getMorphoJob, getMorphoStatus } from "@/lib/morpho/jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("view") === "job") return NextResponse.json({ job: getMorphoJob("index") });
  try {
    return NextResponse.json(await getMorphoStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
