import { NextResponse } from "next/server";

import { bridgeStatus, buildBridgeIndex, searchBridge } from "@/lib/cross-modal/bridge";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 1800;
export async function GET() { try { return NextResponse.json(await bridgeStatus()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
export async function POST(request: Request) { try { const body = await request.json() as { action?: string; record_id?: string; include_review?: boolean; top_k?: number }; if (body.action === "build") return NextResponse.json({ manifest: await buildBridgeIndex() }); if (body.action === "search" && body.record_id) return NextResponse.json({ matches: await searchBridge(body.record_id, Boolean(body.include_review), Number(body.top_k) || 10) }); return NextResponse.json({ error: "Use action build or search with record_id" }, { status: 400 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 }); } }
