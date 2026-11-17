import { NextRequest, NextResponse } from "next/server";

import { activateCorpusCandidate, connectGemmaCandidate, getArtifactStatuses, getBuildPreflight, getManagedJob, rollbackCorpusCandidate, startManagedRebuild, stopManagedRebuild, type QwenCandidateArtifactKind, type RebuildKind } from "@/lib/rag-v3/managed-rebuild";
import type { GemmaCandidateArtifactKind } from "@/lib/rag-v3/gemma-bundle";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<RebuildKind>(["composite", "embeddinggemma2_text", "atoms", "anchors", "range", "select", "relations", "clap", "gemma2_atoms", "gemma2_anchors", "gemma2_range", "gemma2_select", "gemma2_relations", "all_qwen", "catalogue", "corpus_candidate", "vectorize_candidate", "finalize_candidate", "qwen_component", "gemma_component", "finalize_gemma_candidate"]);
const QWEN_COMPONENTS = new Set<QwenCandidateArtifactKind>(["composite", "atoms", "anchors", "range", "select", "relations"]);
const GEMMA_COMPONENTS = new Set<GemmaCandidateArtifactKind>(["embeddinggemma2_text", "gemma2_atoms", "gemma2_anchors", "gemma2_range", "gemma2_select", "gemma2_relations"]);

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view");
  if (view === "job") {
    return NextResponse.json({ job: getManagedJob() });
  }
  if (view === "preflight") {
    try { return NextResponse.json(await getBuildPreflight()); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
  }
  return NextResponse.json({ error: "Use POST action=audit to refresh index status." }, { status: 405 });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { kind?: unknown; action?: unknown; candidate_id?: unknown; candidate_version?: unknown; artifact_kind?: unknown };
  if (body.action === "audit") return NextResponse.json({ ...(await getArtifactStatuses()), job: getManagedJob() });
  if (body.action === "activate-candidate" || body.action === "rollback-candidate") {
    const candidateRef = typeof body.candidate_id === "string" ? body.candidate_id : body.candidate_version;
    if (typeof candidateRef !== "string") return NextResponse.json({ error: "candidate_id is required" }, { status: 400 });
    try {
      const result = body.action === "activate-candidate"
        ? await activateCorpusCandidate(candidateRef)
        : await rollbackCorpusCandidate(candidateRef);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
    }
  }
  if (body.action === "connect-gemma-candidate") {
    if (typeof body.candidate_version !== "string") return NextResponse.json({ error: "candidate_version is required" }, { status: 400 });
    try { return NextResponse.json(await connectGemmaCandidate(body.candidate_version)); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
  }
  if (typeof body.kind !== "string" || !KINDS.has(body.kind as RebuildKind)) return NextResponse.json({ error: "Unknown rebuild kind" }, { status: 400 });
  const kind = body.kind as RebuildKind;
  const capability = kind === "composite" || kind === "all_qwen" || kind === "catalogue" || kind === "atoms" || kind === "anchors" || kind === "range" || kind === "select" || kind === "relations" || kind === "corpus_candidate" || kind === "vectorize_candidate" || kind === "finalize_candidate" || kind === "qwen_component"
    ? "text.qwen.resolved"
    : kind.startsWith("gemma2_") || kind === "embeddinggemma2_text" || kind === "gemma_component" || kind === "finalize_gemma_candidate" ? "text.gemma.awtd" : null;
  if (capability) {
    const settings = await loadLLMSettings();
    if (!capabilityIsEnabled(settings.capabilityRegistry, capability)) return NextResponse.json({ error: `${capability} is disabled in Settings.` }, { status: 409 });
  }
  if (kind === "qwen_component" && (typeof body.artifact_kind !== "string" || !QWEN_COMPONENTS.has(body.artifact_kind as QwenCandidateArtifactKind))) return NextResponse.json({ error: "Unknown Qwen candidate artifact kind" }, { status: 400 });
  if (kind === "gemma_component" && (typeof body.artifact_kind !== "string" || !GEMMA_COMPONENTS.has(body.artifact_kind as GemmaCandidateArtifactKind))) return NextResponse.json({ error: "Unknown Gemma candidate artifact kind" }, { status: 400 });
  const result = await startManagedRebuild(kind, typeof body.candidate_version === "string" ? body.candidate_version : undefined, typeof body.artifact_kind === "string" ? body.artifact_kind as QwenCandidateArtifactKind | GemmaCandidateArtifactKind : undefined);
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}

export async function DELETE() {
  const result = stopManagedRebuild();
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
