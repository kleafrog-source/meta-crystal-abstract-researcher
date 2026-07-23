import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";
import { buildRAGContext } from "@/lib/rag";
import { db } from "@/lib/db";
import type { LLMMessage } from "@/lib/llm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/llm/chat
 * Body: {
 *   messages: LLMMessage[],
 *   useRAG?: boolean (default true),
 *   system?: string,
 *   model?: string,
 *   temperature?, topP?, maxTokens?
 * }
 *
 * Returns: { ok, reply, ragContext, provider, model, usage }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = (body.messages ?? []) as LLMMessage[];
    if (!messages.length) {
      return NextResponse.json(
        { ok: false, error: "messages не могут быть пустыми" },
        { status: 400 },
      );
    }

    const { provider, settings } = await getActiveProvider();

    // Build RAG context from the last user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    let ragContextText = "";
    let ragResults: any[] = [];
    if (body.useRAG !== false && lastUser) {
      try {
        const rag = await buildRAGContext(lastUser.content);
        ragContextText = rag.contextText;
        ragResults = rag.results;
      } catch (e) {
        console.error("RAG build failed:", e);
      }
    }

    const result = await provider.chat(messages, {
      model: body.model ?? settings.chatModel,
      temperature: body.temperature ?? settings.temperature,
      topP: body.topP ?? settings.topP,
      maxTokens: body.maxTokens ?? settings.maxTokens,
      system: body.system,
      ragContext: ragContextText || undefined,
    });

    // Persist the user + assistant messages for chat history
    try {
      if (lastUser) {
        await db.chatMessage.create({
          data: {
            role: "user",
            content: lastUser.content,
            ragContext: ragContextText || null,
            provider: provider.id,
            model: result.model,
          },
        });
      }
      await db.chatMessage.create({
        data: {
          role: "assistant",
          content: result.text,
          ragContext: ragContextText || null,
          provider: provider.id,
          model: result.model,
        },
      });
    } catch (e) {
      console.error("chat persist failed:", e);
    }

    return NextResponse.json({
      ok: true,
      reply: result.text,
      ragContext: ragContextText,
      ragResults,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
