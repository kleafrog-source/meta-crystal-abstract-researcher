import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { TAXONOMY_STATS_PATH } from "@/lib/am-parameters-catalogue/taxonomy";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(JSON.parse(await fs.readFile(TAXONOMY_STATS_PATH, "utf8")) as unknown); }
  catch (error) { return NextResponse.json({ error: (error as NodeJS.ErrnoException).code === "ENOENT" ? "Отчёт ещё не создан." : error instanceof Error ? error.message : String(error) }, { status: 404 }); }
}
