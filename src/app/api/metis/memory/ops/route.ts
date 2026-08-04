import { NextRequest, NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";
import type { MemoryOp } from "@/lib/metis/types";

const OPS = new Set<MemoryOp>(["REMEMBER", "FORGET", "UPDATE", "REFLECT"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const op = body.op as MemoryOp;
  const content = String(body.content || "").trim();
  const items = Array.isArray(body.items)
    ? body.items
        .map((item) => {
          if (typeof item === "string") return { content: item.trim() };
          if (item && typeof item === "object") {
            return {
              content: String((item as { content?: unknown }).content ?? "").trim(),
              importance:
                typeof (item as { importance?: unknown }).importance === "number"
                  ? ((item as { importance?: number }).importance as number)
                  : undefined,
            };
          }
          return null;
        })
        .filter((item): item is { content: string; importance?: number } => Boolean(item?.content))
    : [];
  const importance = typeof body.importance === "number" ? body.importance : undefined;
  if (!OPS.has(op)) {
    return NextResponse.json({ error: "invalid op" }, { status: 400 });
  }
  if (!content && !items.length) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  try {
    if (items.length) {
      return NextResponse.json(await getMetisStore().applyMemoryBatch(op, items));
    }
    return NextResponse.json(await getMetisStore().applyMemoryOp(op, content, importance));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Metis op failed" }, { status: 500 });
  }
}
