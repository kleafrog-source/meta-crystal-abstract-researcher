import { NextResponse } from "next/server";
import { createPreview } from "@/lib/am-stage-automation/executor";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) { try { return NextResponse.json(await createPreview(await request.json())); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); } }
