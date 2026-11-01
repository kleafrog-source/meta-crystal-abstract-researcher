import { NextResponse } from "next/server";
import { readCatalogueState, readQueue } from "@/lib/am-parameters-catalogue/catalogue";
export async function GET() { try { const [state, queue] = await Promise.all([readCatalogueState(), readQueue()]); return NextResponse.json({ ...state, pending_count: queue.items.filter((item) => item.status === "pending").length, failed_count: queue.items.filter((item) => item.status === "failed").length }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
export async function POST() { return NextResponse.json({ error: "Используйте POST /api/am-parameters-catalogue/indexes/rebuild для явной финальной пересборки." }, { status: 405 }); }
