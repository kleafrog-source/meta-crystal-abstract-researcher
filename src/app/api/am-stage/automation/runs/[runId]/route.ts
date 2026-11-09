import { NextResponse } from "next/server";
import { deleteAutomationRun, getAutomationRun } from "@/lib/am-stage-automation/executor";

type Context = { params: Promise<{ runId: string }> };
export async function GET(_request: Request, context: Context) { const { runId } = await context.params; const run = await getAutomationRun(runId); return run ? NextResponse.json({ run }) : NextResponse.json({ error: "Run not found." }, { status: 404 }); }
export async function DELETE(request: Request, context: Context) {
  const { runId } = await context.params;
  try { return NextResponse.json(await deleteAutomationRun(runId, String((await request.json()).commandId ?? ""))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
}
