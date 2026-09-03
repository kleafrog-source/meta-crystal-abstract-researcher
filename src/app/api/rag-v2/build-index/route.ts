import { NextResponse } from "next/server";

import { startRetrievalIndexBuild } from "@/lib/rag-v2/build-jobs";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = startRetrievalIndexBuild();
  return NextResponse.json(result, { status: result.started ? 200 : 409 });
}
