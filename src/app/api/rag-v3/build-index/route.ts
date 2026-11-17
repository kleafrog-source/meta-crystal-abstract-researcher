import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Legacy V3 index build is disabled because it does not use a pinned current-catalogue candidate. Use the candidate workflow in Service Bay." }, { status: 410 });
}
