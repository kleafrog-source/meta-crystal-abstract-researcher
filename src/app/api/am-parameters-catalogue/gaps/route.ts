import { NextResponse } from "next/server";
import { makeGaps, readCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
export async function GET() { try { const rows = await readCatalogueParameters(); return NextResponse.json(await makeGaps(rows)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
