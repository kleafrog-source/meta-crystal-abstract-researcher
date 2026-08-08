import { NextResponse } from "next/server";
import { getMetisResearchStore } from "@/lib/metis-research/store";

export async function GET() {
  const store = getMetisResearchStore();
  await store.ensureInitialized();
  return NextResponse.json(store.getInitState());
}
