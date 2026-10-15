import { NextResponse } from "next/server";

import { getWhiteSpaceStatus, startWhiteSpaceJob, stopWhiteSpaceJob } from "@/lib/white-space/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await getWhiteSpaceStatus()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function POST() {
  const result = await startWhiteSpaceJob();
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}

export async function DELETE() {
  const result = await stopWhiteSpaceJob();
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
