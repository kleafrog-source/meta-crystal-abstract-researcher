import { db } from "@/lib/db";
import { getAutomationRun, initializeAutomation } from "@/lib/am-stage-automation/executor";
import { needsAutomationSnapshot } from "@/lib/am-stage-automation/sse-cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };
type EventRow = { sequence: number; type: string; stageId: string | null; attemptId: string | null; occurredAt: Date; payloadJson: string };
const TERMINAL = new Set(["finished", "failed", "stopped", "interrupted", "deletion-failed"]);
const json = (value: string) => { try { return JSON.parse(value) as unknown; } catch { return null; } };
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function frame(event: string, data: unknown, id?: number) {
  return `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, context: Context) {
  const { runId } = await context.params;
  await initializeAutomation();
  const exists = await db.automationRun.findUnique({ where: { id: runId }, select: { id: true, status: true } });
  if (!exists) return Response.json({ error: "Run not found." }, { status: 404 });

  const headerCursor = request.headers.get("last-event-id");
  const queryCursor = new URL(request.url).searchParams.get("after");
  const rawCursor = headerCursor ?? queryCursor;
  const parsedCursor = rawCursor === null || rawCursor === "" ? null : Number(rawCursor);
  let cursor = parsedCursor !== null && Number.isSafeInteger(parsedCursor) && parsedCursor >= 0 ? parsedCursor : null;
  const latestRow = await db.automationRunEvent.findFirst({ where: { runId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  let latest = latestRow?.sequence ?? 0;
  const firstAfterRow = cursor !== null && cursor < latest
    ? await db.automationRunEvent.findFirst({ where: { runId, sequence: { gt: cursor } }, orderBy: { sequence: "asc" }, select: { sequence: true } })
    : null;
  let sendSnapshot = needsAutomationSnapshot({ cursor, latest, firstAfter: firstAfterRow?.sequence ?? null });

  const encoder = new TextEncoder();
  let cancelled = false;
  let closeStream: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let heartbeatAt = Date.now();
      const enqueue = (value: string) => { if (!cancelled) controller.enqueue(encoder.encode(value)); };
      const close = () => { if (cancelled) return; cancelled = true; controller.close(); };
      closeStream = close;
      request.signal.addEventListener("abort", close, { once: true });
      void (async () => {
        try {
          if (sendSnapshot) {
            const snapshot = await getAutomationRun(runId);
            if (!snapshot) { enqueue(frame("stream-error", { message: "Run not found." })); close(); return; }
            const snapshotCursor = Math.max(latest, ...snapshot.events.map((event) => event.sequence));
            cursor = snapshotCursor;
            latest = snapshotCursor;
            enqueue(frame("snapshot", { cursor: snapshotCursor, run: snapshot }, snapshotCursor));
          }
          while (!cancelled) {
            const events = await db.automationRunEvent.findMany({ where: { runId, sequence: { gt: cursor ?? 0 } }, orderBy: { sequence: "asc" }, take: 250 }) as EventRow[];
            for (const event of events) {
              if (cancelled) break;
              enqueue(frame("automation", { sequence: event.sequence, type: event.type, stageId: event.stageId, attemptId: event.attemptId, occurredAt: event.occurredAt, payload: json(event.payloadJson) }, event.sequence));
              cursor = event.sequence;
            }
            if (cancelled) break;
            const state = await db.automationRun.findUnique({ where: { id: runId }, select: { status: true } });
            if (!state) { close(); break; }
            const maxRow = await db.automationRunEvent.findFirst({ where: { runId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
            latest = maxRow?.sequence ?? 0;
            if (TERMINAL.has(state.status) && (cursor ?? 0) >= latest) {
              enqueue(frame("terminal", { status: state.status, cursor: latest }, latest));
              close();
              break;
            }
            if (Date.now() - heartbeatAt > 15_000) { enqueue(": keep-alive\n\n"); heartbeatAt = Date.now(); }
            await wait(500);
          }
        } catch (error) {
          enqueue(frame("stream-error", { message: error instanceof Error ? error.message : String(error) }));
          close();
        }
      })();
    },
    cancel() { closeStream(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
