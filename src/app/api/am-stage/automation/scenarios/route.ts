import { NextResponse } from "next/server";
import { createUserScenario, importLegacyAutomations, listAutomationScenarios } from "@/lib/am-stage-automation/scenarios";

export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json({ scenarios: await listAutomationScenarios() }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
export async function POST(request: Request) {
  try {
    const body = await request.json() as { scenario?: { id?: string; title?: string; description?: string; definition?: never }; importLegacy?: unknown };
    if (Array.isArray(body.importLegacy)) return NextResponse.json({ results: await importLegacyAutomations(body.importLegacy as never[]) });
    if (!body.scenario?.title || !body.scenario.definition) return NextResponse.json({ error: "Provide a scenario title and definition." }, { status: 400 });
    return NextResponse.json(await createUserScenario({ id: body.scenario.id, title: body.scenario.title, description: body.scenario.description, definition: body.scenario.definition as never }), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
