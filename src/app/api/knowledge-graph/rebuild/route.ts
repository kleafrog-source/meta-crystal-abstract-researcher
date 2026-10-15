import { NextResponse } from "next/server";
import {
  startKnowledgeGraphJob,
  stopKnowledgeGraphJob,
} from "@/lib/knowledge-graph/job";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST() {
  const result = await startKnowledgeGraphJob();
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}
export async function DELETE() {
  const result = await stopKnowledgeGraphJob();
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
