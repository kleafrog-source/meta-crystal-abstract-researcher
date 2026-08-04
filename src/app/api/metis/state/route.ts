import { NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";

export async function GET() {
  const store = getMetisStore();
  await store.ensureHydrated();
  return NextResponse.json(store.snapshot());
}
