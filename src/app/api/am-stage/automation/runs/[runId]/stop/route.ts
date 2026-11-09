import { NextResponse } from "next/server";
import { stopAutomation } from "@/lib/am-stage-automation/executor";

type Context = { params: Promise<{ runId: string }> };
export async function POST(request: Request, context: Context) { try { const { runId } = await context.params; const body = await request.json() as { commandId?: string }; return NextResponse.json({ run: await stopAutomation(runId, body.commandId ?? crypto.randomUUID()) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); } }
