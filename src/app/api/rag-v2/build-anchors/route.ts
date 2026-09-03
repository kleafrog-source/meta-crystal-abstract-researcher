import { NextResponse } from "next/server";

import { startAnchorsBuild } from "@/lib/rag-v2/build-jobs";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = startAnchorsBuild();
  return NextResponse.json(result, { status: result.started ? 200 : 409 });
}
