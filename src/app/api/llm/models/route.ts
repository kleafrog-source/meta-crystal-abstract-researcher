import { NextResponse } from "next/server";
import { loadProviderForModelListing } from "@/lib/llm/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/llm/models
 * Refreshes and returns the list of models available in the active provider.
 * Returns provider errors directly; never substitutes a different backend.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { provider, settings } = await loadProviderForModelListing(url.searchParams.get("provider") ?? undefined, url.searchParams.get("baseUrl") ?? undefined);
    const reachable = await provider.ping().catch(() => false);
    const models = reachable ? await provider.listModels() : [];
    return NextResponse.json({
      ok: true,
      provider: provider.id,
      reachable,
      currentChatModel: settings.chatModel,
      currentEmbedModel: settings.embedModel,
      models,
      ...(!reachable ? { error: provider.id === "freellmapi" && !process.env.FREELLMAPI_API_KEY ? "FREELLMAPI_API_KEY is missing on the server." : `${provider.displayName} is unavailable.` } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
