import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store/system-store";
import type { MemoryOp } from "@/lib/engine/types";

/**
 * POST /api/memory/ops
 * Body: { op: "REMEMBER"|"FORGET"|"UPDATE"|"REFLECT", content: string, importance?: number }
 *
 * Выполняет нативную операцию памяти через полный pipeline:
 *   embedding (STUB) → importance W → top-ρ → GDN update → stabilization →
 *   multi-objective loss → overflow check → crystal sync
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const op = body.op as MemoryOp;
  const content: string = body.content ?? "";
  const importance: number | undefined = body.importance;

  if (!["REMEMBER", "FORGET", "UPDATE", "REFLECT"].includes(op)) {
    return NextResponse.json(
      { error: "op must be REMEMBER | FORGET | UPDATE | REFLECT" },
      { status: 400 }
    );
  }
  if (!content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const store = getStore();
  const trace = await store.applyMemoryOp(op, content, importance);

  return NextResponse.json({
    op,
    content,
    ...trace,
    timestamp: Date.now(),
  });
}
