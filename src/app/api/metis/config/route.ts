import { NextRequest, NextResponse } from "next/server";
import { getMetisProviderConfig, updateMetisProviderConfig } from "@/lib/metis/providers";

export async function GET() {
  return NextResponse.json(getMetisProviderConfig());
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(updateMetisProviderConfig(body));
}

