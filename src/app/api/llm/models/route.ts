import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/llm/models
 * Refreshes and returns the list of models available in the active provider.
 * Falls back to a mock list if the provider is unreachable.
 */
export async function GET() {
  try {
    const { provider, settings } = await getActiveProvider();
    const reachable = await provider.ping().catch(() => false);
    let models: any[] = [];
    if (reachable) {
      try {
        models = await provider.listModels();
      } catch (e) {
        return NextResponse.json({
          ok: false,
          reachable: true,
          error: (e as Error).message,
          models: [],
        });
      }
    } else {
      // Fall back to mock provider models so UI can still show something
      const { MockProvider } = await import("@/lib/llm/mock");
      models = await new MockProvider().listModels();
    }
    return NextResponse.json({
      ok: true,
      provider: provider.id,
      reachable,
      currentChatModel: settings.chatModel,
      currentEmbedModel: settings.embedModel,
      models,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
