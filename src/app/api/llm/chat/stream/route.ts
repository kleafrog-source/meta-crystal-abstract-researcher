import { getActiveProvider } from "@/lib/llm/factory";
import { buildRAGContext } from "@/lib/rag";
import { db } from "@/lib/db";
import type { LLMMessage } from "@/lib/llm/types";
import { saveChatRouteMetadata } from "@/lib/llm/chat-route-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = (body.messages ?? []) as LLMMessage[];
    if (!messages.length) {
      return new Response(JSON.stringify({ ok: false, error: "messages are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { provider, settings } = await getActiveProvider();
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    let ragContextText = "";
    let ragResults: any[] = [];

    if (body.useRAG !== false && lastUser) {
      try {
        const rag = await buildRAGContext(lastUser.content);
        ragContextText = rag.contextText;
        ragResults = rag.results;
      } catch (error) {
        console.error("RAG build failed:", error);
      }
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          send({ event: "meta", ragResults, provider: provider.id, model: body.model ?? settings.chatModel });

          let finalText = "";
          let finalModel = body.model ?? settings.chatModel;
          let finalProvider = provider.id;
          let finalRequestedModel = body.model ?? settings.chatModel;
          let finalActualRoute: string | undefined;
          let finalActualProvider: string | undefined;
          let finalActualModel: string | undefined;
          let finalUsage: any;

          if (provider.chatStream) {
            const result = await provider.chatStream(
              messages,
              {
                model: body.model ?? settings.chatModel,
                temperature: body.temperature ?? settings.temperature,
                topP: body.topP ?? settings.topP,
                maxTokens: body.maxTokens ?? settings.maxTokens,
                system: body.system,
                ragContext: ragContextText || undefined,
                signal: req.signal,
              },
              (chunk) => {
                if (chunk.textDelta) {
                  finalText += chunk.textDelta;
                  send({ event: "delta", textDelta: chunk.textDelta });
                }
                if (chunk.model) finalModel = chunk.model;
                if (chunk.provider) finalProvider = chunk.provider;
                if (chunk.requestedModel) finalRequestedModel = chunk.requestedModel;
                if (chunk.actualRoute) finalActualRoute = chunk.actualRoute;
                if (chunk.actualProvider) finalActualProvider = chunk.actualProvider;
                if (chunk.actualModel) finalActualModel = chunk.actualModel;
                if (chunk.usage) finalUsage = chunk.usage;
              },
            );
            finalText = result.text;
            finalModel = result.model;
            finalProvider = result.provider;
            finalRequestedModel = result.requestedModel ?? finalRequestedModel;
            finalActualRoute = result.actualRoute;
            finalActualProvider = result.actualProvider;
            finalActualModel = result.actualModel;
            finalUsage = result.usage;
          } else {
            const result = await provider.chat(messages, {
              model: body.model ?? settings.chatModel,
              temperature: body.temperature ?? settings.temperature,
              topP: body.topP ?? settings.topP,
              maxTokens: body.maxTokens ?? settings.maxTokens,
              system: body.system,
              ragContext: ragContextText || undefined,
              signal: req.signal,
            });
            finalText = result.text;
            finalModel = result.model;
            finalProvider = result.provider;
            finalRequestedModel = result.requestedModel ?? finalRequestedModel;
            finalActualRoute = result.actualRoute;
            finalActualProvider = result.actualProvider;
            finalActualModel = result.actualModel;
            finalUsage = result.usage;

            const parts = result.text.split(/(\s+)/).filter(Boolean);
            for (const part of parts) {
              send({ event: "delta", textDelta: part });
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
          }

          if (lastUser) {
            await db.chatMessage.create({
              data: {
                role: "user",
                content: lastUser.content,
                ragContext: ragContextText || null,
                provider: finalProvider,
                model: finalModel,
              },
            });
          }
          const assistantMessage = await db.chatMessage.create({
            data: {
              role: "assistant",
              content: finalText,
              ragContext: ragContextText || null,
              provider: finalProvider,
              model: finalModel,
            },
          });
          await saveChatRouteMetadata(assistantMessage.id, { requestedModel: finalRequestedModel, actualRoute: finalActualRoute, actualProvider: finalActualProvider, actualModel: finalActualModel });

          send({
            event: "done",
            reply: finalText,
            ragContext: ragContextText,
            ragResults,
            provider: finalProvider,
            model: finalModel,
            requestedModel: finalRequestedModel,
            ...(finalActualRoute ? { actualRoute: finalActualRoute } : {}),
            ...(finalActualProvider ? { actualProvider: finalActualProvider } : {}),
            ...(finalActualModel ? { actualModel: finalActualModel } : {}),
            usage: finalUsage,
          });
          controller.close();
        } catch (error) {
          send({ event: "error", error: (error as Error).message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
