import { NextResponse } from "next/server";
import { getStore } from "@/lib/store/system-store";

/** GET /api/system/metrics — push a new sample and return current + history */
export async function GET() {
  const store = getStore();
  const current = store.pushMetricsSample();
  return NextResponse.json({
    current,
    history: store.getMetricsHistory(),
  });
}
