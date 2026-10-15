import { NextRequest, NextResponse } from "next/server";
import {
  boundedInt,
  loadGraph,
  parameterId,
} from "@/lib/knowledge-graph/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const cache = await loadGraph();
    const id = Number((await context.params).id);
    const group = cache.graph.communities.find((item) => item.id === id);
    if (!group)
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 },
      );
    const limit = boundedInt(
      request.nextUrl.searchParams.get("limit"),
      100,
      1,
      200,
    );
    return NextResponse.json({
      ...group,
      parameters: group.parameters.slice(0, limit),
      nodes: group.parameters
        .slice(0, limit)
        .map((name) => cache.nodes.get(parameterId(name))),
      truncated: group.size > limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
