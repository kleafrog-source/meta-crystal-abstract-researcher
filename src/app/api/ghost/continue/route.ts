import { NextResponse } from "next/server";
import { continueGhostTrajectory } from "@/lib/gw-collapser-ghost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await continueGhostTrajectory({
      crystalId: String(body?.crystalId ?? "").trim(),
      startFrame: Number(body?.startFrame ?? 0),
      steps: Number(body?.steps ?? 100),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
