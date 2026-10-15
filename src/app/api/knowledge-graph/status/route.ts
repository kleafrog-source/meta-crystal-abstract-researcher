import { NextResponse } from "next/server";
import { getKnowledgeGraphStatus } from "@/lib/knowledge-graph/job";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getKnowledgeGraphStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
