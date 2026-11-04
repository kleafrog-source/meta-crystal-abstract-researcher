import { NextResponse } from "next/server";
import { startMorphoIndex, stopMorpho } from "@/lib/morpho/jobs";
import { loadLLMSettings } from "@/lib/llm/factory";
import { capabilityIsEnabled } from "@/lib/capability-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() {
  const settings = await loadLLMSettings();
  if (!capabilityIsEnabled(settings.capabilityRegistry, "spec.siglip.resolved")) return NextResponse.json({ started: false, reason: "spec.siglip.resolved is disabled in Settings." }, { status: 409 });
  const result = startMorphoIndex(settings.capabilityRegistry.modelSlots.siglip2.modelId);
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}
export async function DELETE() {
  const result = await stopMorpho("index");
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
