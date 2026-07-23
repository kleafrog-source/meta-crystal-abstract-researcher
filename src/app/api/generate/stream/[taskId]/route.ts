import { getTask, type SidecarEvent } from "@/lib/engine/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/generate/stream/[taskId]
 * Server-Sent Events stream of sidecar events for a running task.
 *
 * The client should subscribe to this endpoint with an EventSource and
 * reconstruct the log/progress UI from the emitted events.
 */
export async function GET(
  res: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await ctx.params;
  const handle = getTask(taskId);
  if (!handle) {
    return new Response(JSON.stringify({ ok: false, error: "Задача не найдена" }), {
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

      // Replay buffered events first
      for (const e of handle.events) send(e);

      if (handle.status !== "running") {
        send({ event: "closed", status: handle.status, result: handle.result });
        controller.close();
        return;
      }

      // Subscribe to live events
      const unsubscribe = handle.subscribe((e: SidecarEvent) => {
        send(e);
        if (e.event === "done" || e.event === "error") {
          send({ event: "closed", status: handle.status });
          controller.close();
        }
      });

      // Keep-alive ping every 15s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {}
      }, 15000);

      // Cleanup on abort
      const cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };
      res.signal?.addEventListener("abort", cleanup);
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
