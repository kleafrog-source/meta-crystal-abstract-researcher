import { NextRequest, NextResponse } from "next/server";
import { startMorphoIndex, stopMorpho } from "@/lib/morpho/jobs";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";
import { getPreparedCandidateRowInputs } from "@/lib/rag-v3/managed-rebuild";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const settings = await loadLLMSettings();
  if (!capabilityIsEnabled(settings.capabilityRegistry, "spec.siglip.resolved")) return NextResponse.json({ started: false, reason: "spec.siglip.resolved is disabled in Settings." }, { status: 409 });
  let candidateId: unknown;
  try { candidateId = (await request.json() as { candidate_id?: unknown }).candidate_id; }
  catch { return NextResponse.json({ started: false, reason: "Prepare source files first; candidate_id is required for this row." }, { status: 400 }); }
  if (typeof candidateId !== "string") return NextResponse.json({ started: false, reason: "Prepare source files first; candidate_id is required for this row." }, { status: 400 });
  try {
    const rowInputs = await getPreparedCandidateRowInputs(candidateId);
    const result = startMorphoIndex(settings.capabilityRegistry.modelSlots.siglip2.modelId, {
      snapshotPath: rowInputs.snapshotPath, preparedInputPath: rowInputs.siglipInputPath,
      sourceRevision: rowInputs.sourceRevision, sourceSnapshotSha256: rowInputs.sourceSnapshotSha256,
      excludedSha256: rowInputs.excludedSha256, excludedCount: rowInputs.excludedCount,
    });
    return NextResponse.json(result, { status: result.started ? 202 : 409 });
  } catch (error) {
    return NextResponse.json({ started: false, reason: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}
export async function DELETE() {
  const result = await stopMorpho("index");
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
