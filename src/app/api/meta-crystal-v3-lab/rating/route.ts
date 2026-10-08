import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RATINGS_PATH = path.join(process.cwd(), "data", "combinatorial-genesis", "meta-crystal-v3-lab", "ratings.jsonl");

export async function POST(request: Request) {
  try {
    const body = await request.json() as { technical_name?: unknown; rating?: unknown; query?: unknown };
    const technicalName = typeof body.technical_name === "string" ? body.technical_name.trim() : "";
    const rating = body.rating === "up" || body.rating === "down" ? body.rating : "";
    if (!technicalName || !rating) return NextResponse.json({ error: "technical_name and rating are required." }, { status: 400 });
    await fs.mkdir(path.dirname(RATINGS_PATH), { recursive: true });
    await fs.appendFile(RATINGS_PATH, `${JSON.stringify({ created_at: new Date().toISOString(), technical_name: technicalName, rating, query: typeof body.query === "string" ? body.query : "" })}\n`, "utf8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

