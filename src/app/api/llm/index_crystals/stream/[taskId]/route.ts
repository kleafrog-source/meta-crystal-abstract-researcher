import { getCrystalIndexTask } from "@/lib/llm/crystal-indexer";
import type { SidecarEvent } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await ctx.params;
  const handle = getCrystalIndexTask(taskId);
  if (!handle) {
    return new Response(JSON.stringify({ ok: false, error: "Задача индексации не найдена." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      for (const event of handle.events) send(event);

      if (handle.status !== "running") {
        send({ event: "closed", status: handle.status, result: handle.result });
        controller.close();
        return;
      }

      const unsubscribe = handle.subscribe((event: SidecarEvent) => {
        send(event);
        if (event.event === "done" || event.event === "error") {
          send({ event: "closed", status: handle.status, result: handle.result });
          controller.close();
        }
      });

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {}
      }, 15000);

      const cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };

      req.signal?.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
