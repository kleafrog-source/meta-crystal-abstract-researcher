import { NextRequest, NextResponse } from "next/server";

import { getArtifactStatuses, getManagedJob, startManagedRebuild, stopManagedRebuild, type RebuildKind } from "@/lib/rag-v3/managed-rebuild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<RebuildKind>(["composite", "atoms", "anchors", "range", "select", "relations", "clap", "all_qwen"]);

export async function GET() {
  return NextResponse.json({ ...(await getArtifactStatuses()), job: getManagedJob() });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { kind?: unknown };
  if (typeof body.kind !== "string" || !KINDS.has(body.kind as RebuildKind)) return NextResponse.json({ error: "Unknown rebuild kind" }, { status: 400 });
  const result = await startManagedRebuild(body.kind as RebuildKind);
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}

export async function DELETE() {
  const result = stopManagedRebuild();
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
