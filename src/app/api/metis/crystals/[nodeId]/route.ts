import { NextRequest, NextResponse } from "next/server";
import { getMetisStore } from "@/lib/metis/store";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await params;
  const store = getMetisStore();
  await store.forgetPersistedNode(nodeId);
  return NextResponse.json({ deleted: true, nodeId, timestamp: Date.now() });
}
