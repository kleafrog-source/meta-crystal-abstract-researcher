import { NextResponse } from "next/server";

import { callSidecar } from "@/lib/engine/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 7200;

export async function GET() {
  try {
    const { result } = await callSidecar("audio_index_status", { timeoutMs: 30_000, taskType: "audio-clap", title: "CLAP index status" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { result } = await callSidecar("audio_index", { timeoutMs: 2 * 60 * 60_000, taskType: "audio-clap", title: "Build CLAP text index" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
