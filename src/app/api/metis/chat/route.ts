import { NextRequest, NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getMetisStore().processChat(message));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Metis chat failed" }, { status: 500 });
  }
}

