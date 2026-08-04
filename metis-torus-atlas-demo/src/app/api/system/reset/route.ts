import { NextResponse } from "next/server";
import { getStore } from "@/lib/store/system-store";

/** POST /api/system/reset — reset in-memory state to initial */
export async function POST() {
  const store = getStore();
  store.reset();
  return NextResponse.json({ ok: true, message: "state reset to initial" });
}
