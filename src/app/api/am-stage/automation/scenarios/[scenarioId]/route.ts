import { NextResponse } from "next/server";
import { archiveScenario, getAutomationScenario, saveScenarioVersion } from "@/lib/am-stage-automation/scenarios";

type Context = { params: Promise<{ scenarioId: string }> };
export async function GET(_request: Request, context: Context) { const { scenarioId } = await context.params; const item = await getAutomationScenario(scenarioId); return item ? NextResponse.json({ scenario: item }) : NextResponse.json({ error: "Scenario not found." }, { status: 404 }); }
export async function PATCH(request: Request, context: Context) { try { const { scenarioId } = await context.params; const body = await request.json() as { expectedVersion: number; definition: never; title?: string }; return NextResponse.json(await saveScenarioVersion({ id: scenarioId, ...body })); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); } }
export async function DELETE(_request: Request, context: Context) { try { const { scenarioId } = await context.params; return NextResponse.json(await archiveScenario(scenarioId)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); } }
