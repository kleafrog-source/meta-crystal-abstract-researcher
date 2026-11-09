import { NextResponse } from "next/server";
import { continueAutomation, type FailedNodeAction } from "@/lib/am-stage-automation/executor";

type Context = { params: Promise<{ runId: string }> };

function parseNodeAction(value: unknown): FailedNodeAction | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid node recovery action.");
  const action = value as Record<string, unknown>;
  if (typeof action.nodeId !== "string" || !/^[\w-]{1,120}$/u.test(action.nodeId)) throw new Error("A valid failed node ID is required.");
  if (action.kind === "reuse_saved_response") return { kind: action.kind, nodeId: action.nodeId };
  if (action.kind === "retry_failed_node") {
    if (typeof action.reason !== "string" || action.reason.trim().length < 10 || action.reason.length > 500) throw new Error("Enter a retry reason between 10 and 500 characters.");
    return { kind: action.kind, nodeId: action.nodeId, reason: action.reason.trim() };
  }
  throw new Error("Unknown node recovery action.");
}

export async function POST(request: Request, context: Context) {
  try {
    const { runId } = await context.params;
    const body = await request.json() as { commandId?: string; nodeAction?: unknown };
    const nodeAction = parseNodeAction(body.nodeAction);
    return NextResponse.json({ run: await continueAutomation(runId, body.commandId ?? crypto.randomUUID(), nodeAction) }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, code: message.startsWith("EXECUTOR_BUSY") ? "EXECUTOR_BUSY" : undefined }, { status: message.startsWith("EXECUTOR_BUSY") ? 409 : 400 });
  }
}
