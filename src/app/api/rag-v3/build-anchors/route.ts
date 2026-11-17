import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Legacy anchors build is disabled because it does not consume a pinned effective-catalogue snapshot. Use the candidate workflow in Service Bay." }, { status: 410 });
}
