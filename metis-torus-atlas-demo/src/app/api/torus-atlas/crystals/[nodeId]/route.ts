import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store/system-store";

/**
 * DELETE /api/torus-atlas/crystals/{node_id}
 * Реализует forget-операцию Crystal API.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await params;
  const store = getStore();

  // Поддержка forget-by-content-substring: если nodeId начинается с "content:"
  if (nodeId.startsWith("content:")) {
    const substring = decodeURIComponent(nodeId.slice("content:".length));
    const deleted = store.crystal.forgetByContent("*", substring);
    return NextResponse.json({
      action: "forget",
      target: `content:${substring}`,
      deleted_count: deleted,
      timestamp: Date.now(),
    });
  }

  const existed = store.crystal.forget(nodeId);
  return NextResponse.json({
    action: "forget",
    node_id: nodeId,
    deleted: existed,
    timestamp: Date.now(),
  });
}
