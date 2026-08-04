import { NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";

export async function POST() {
  const store = getMetisStore();
  store.reset();
  await store.resetPersistedNodes();
  return NextResponse.json({ ok: true });
}
