import { NextResponse } from "next/server";
import { readQueue } from "@/lib/am-parameters-catalogue/catalogue";
import { reconcileCatalogueIndexJob } from "@/lib/am-parameters-catalogue/index-job";
export async function GET() { try { const [state, queue] = await Promise.all([reconcileCatalogueIndexJob(), readQueue()]); return NextResponse.json({ ...state, pending_count: queue.items.filter((item) => item.status === "pending").length, failed_count: queue.items.filter((item) => item.status === "failed").length }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
export async function POST() { return NextResponse.json({ error: "Откройте /service-bay#index-coverage для явной пересборки индексов." }, { status: 405 }); }
