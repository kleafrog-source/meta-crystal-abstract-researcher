import { NextRequest, NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const crystalId = url.searchParams.get("crystal_id") || "*";
  const threshold = url.searchParams.get("importance_threshold");
  const parsed = threshold ? Number(threshold) : undefined;
  const store = getMetisStore();
  const nodes = crystalId === "*" ? store.crystal.listAll().filter((node) => parsed === undefined || node.importance >= parsed) : store.crystal.query(crystalId, parsed);
  return NextResponse.json({ crystal_nodes: nodes, timestamp: Date.now() });
}

