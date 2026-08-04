import { NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";

export async function GET() {
  const store = getMetisStore();
  const current = store.pushMetricsSample();
  return NextResponse.json({ current, history: store.getMetricsHistory() });
}

