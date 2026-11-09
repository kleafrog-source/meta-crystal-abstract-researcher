import { NextResponse } from "next/server";
import { listAutomationRuns, startAutomation } from "@/lib/am-stage-automation/executor";

export const runtime = "nodejs";
export const maxDuration = 7200;
export async function GET(request: Request) { try { const url = new URL(request.url); return NextResponse.json({ runs: await listAutomationRuns({ status: url.searchParams.get("status") ?? undefined, scenarioId: url.searchParams.get("scenarioId") ?? undefined, query: url.searchParams.get("q") ?? undefined, createdAfter: url.searchParams.get("after") ?? undefined, createdBefore: url.searchParams.get("before") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 30) }) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
export async function POST(request: Request) { try { return NextResponse.json({ run: await startAutomation(await request.json()) }, { status: 202 }); } catch (error) { const message = error instanceof Error ? error.message : String(error); return NextResponse.json({ error: message, code: message.startsWith("EXECUTOR_BUSY") ? "EXECUTOR_BUSY" : undefined }, { status: message.startsWith("EXECUTOR_BUSY") ? 409 : 400 }); } }
