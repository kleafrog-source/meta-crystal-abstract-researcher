import { NextRequest, NextResponse } from "next/server";

import { getArtifactStatuses, getManagedJob, startManagedRebuild, stopManagedRebuild, type RebuildKind } from "@/lib/rag-v3/managed-rebuild";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<RebuildKind>(["composite", "embeddinggemma2_text", "atoms", "anchors", "range", "select", "relations", "clap", "gemma2_atoms", "gemma2_anchors", "gemma2_range", "gemma2_select", "gemma2_relations", "all_qwen", "catalogue"]);

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view");
  if (view === "job") {
    const job = getManagedJob();
    return NextResponse.json({ job: { running: job.running, kind: job.kind, stage: job.stage, started_at: job.started_at, finished_at: job.finished_at, exit_code: job.exit_code, last_error: job.last_error } });
  }
  return NextResponse.json({ error: "Use POST action=audit to refresh index status." }, { status: 405 });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { kind?: unknown; action?: unknown };
  if (body.action === "audit") return NextResponse.json({ ...(await getArtifactStatuses()), job: getManagedJob() });
  if (typeof body.kind !== "string" || !KINDS.has(body.kind as RebuildKind)) return NextResponse.json({ error: "Unknown rebuild kind" }, { status: 400 });
  const kind = body.kind as RebuildKind;
  const capability = kind === "composite" || kind === "all_qwen" || kind === "catalogue" || kind === "atoms" || kind === "anchors" || kind === "range" || kind === "select" || kind === "relations"
    ? "text.qwen.resolved"
    : kind.startsWith("gemma2_") || kind === "embeddinggemma2_text" ? "text.gemma.awtd" : null;
  if (capability) {
    const settings = await loadLLMSettings();
    if (!capabilityIsEnabled(settings.capabilityRegistry, capability)) return NextResponse.json({ error: `${capability} is disabled in Settings.` }, { status: 409 });
  }
  const result = await startManagedRebuild(kind);
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}

export async function DELETE() {
  const result = stopManagedRebuild();
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
