import { NextResponse } from "next/server";
import { getMetisResearchStore } from "@/lib/metis-research/store";

export async function POST() {
  getMetisResearchStore().clearHistory();
  return NextResponse.json({ ok: true, message: "Research history cleared" });
}
