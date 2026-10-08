import { NextResponse } from "next/server";
import { startV3AnchorsBuild } from "@/lib/rag-v3/build-jobs";

export async function POST() {
  const result = await startV3AnchorsBuild();
  return NextResponse.json(result, { status: result.started ? 200 : 409 });
}
