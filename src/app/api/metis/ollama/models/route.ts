import { NextRequest, NextResponse } from "next/server";
import { getMetisProviderConfig, listOllamaModels } from "@/lib/metis/providers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const config = getMetisProviderConfig();
  const baseUrl = searchParams.get("baseUrl") || config.ollamaBaseUrl;
  try {
    const models = await listOllamaModels(baseUrl, config.requestTimeoutMs);
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ollama models fetch failed" },
      { status: 500 },
    );
  }
}
