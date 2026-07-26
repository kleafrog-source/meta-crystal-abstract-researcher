import { NextResponse } from "next/server";
import { callSidecar } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { result, events } = await callSidecar("mmss_status", {
      taskType: "mmss_status",
      title: "MMSS status",
      timeoutMs: 120000,
    });

    return NextResponse.json({
      ok: true,
      ...(typeof result === "object" && result ? (result as Record<string, unknown>) : {}),
      events,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
