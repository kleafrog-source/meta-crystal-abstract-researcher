import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { generateV3TechnicalNameCatalog, type V3CatalogResult } from "@/lib/combinatorial-genesis/v3-catalog";

export const dynamic = "force-dynamic";

const MANIFEST_PATH = path.join(process.cwd(), "docs", "v3-parameter-catalog", "manifest.json");

export async function GET() {
  try {
    return NextResponse.json(JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8")) as V3CatalogResult);
  } catch {
    return NextResponse.json({ generated_at: null, parameter_count: 0, part_size: 500, part_count: 0, files: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { part_size?: unknown };
    const partSize = typeof body.part_size === "number" ? body.part_size : 500;
    return NextResponse.json(await generateV3TechnicalNameCatalog(partSize));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

