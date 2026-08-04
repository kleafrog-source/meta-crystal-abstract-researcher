import { NextResponse } from "next/server";
import { getStore } from "@/lib/store/system-store";

/** GET /api/system/state — full SystemState snapshot */
export async function GET() {
  const store = getStore();
  return NextResponse.json(store.snapshot());
}
