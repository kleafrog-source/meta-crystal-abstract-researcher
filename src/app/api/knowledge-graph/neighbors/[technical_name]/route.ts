import { NextRequest, NextResponse } from "next/server";
import {
  boundedInt,
  loadGraph,
  parameterId,
  safeName,
} from "@/lib/knowledge-graph/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ technical_name: string }> },
) {
  try {
    const name = decodeURIComponent((await context.params).technical_name);
    if (!safeName(name))
      return NextResponse.json(
        { error: "Invalid technical_name" },
        { status: 400 },
      );
    const depth = boundedInt(
      request.nextUrl.searchParams.get("depth"),
      1,
      1,
      2,
    );
    const limit = boundedInt(
      request.nextUrl.searchParams.get("limit"),
      80,
      1,
      200,
    );
    const cache = await loadGraph();
    const root = parameterId(name);
    if (!cache.nodes.has(root))
      return NextResponse.json(
        { error: "Parameter not found" },
        { status: 404 },
      );
    const selectedNodes = new Set([root]);
    const selectedEdges = new Set<string>();
    let frontier = [root];
    for (let level = 0; level < depth && selectedNodes.size < limit; level++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const edgeId of cache.graph.adjacency[id] ?? []) {
          const edge = cache.edges.get(edgeId);
          if (!edge) continue;
          const other = edge.source === id ? edge.target : edge.source;
          selectedEdges.add(edgeId);
          if (!selectedNodes.has(other) && selectedNodes.size < limit) {
            selectedNodes.add(other);
            next.push(other);
          }
        }
      frontier = next;
    }
    const edges = [...selectedEdges]
      .map((id) => cache.edges.get(id)!)
      .filter(
        (edge) =>
          selectedNodes.has(edge.source) && selectedNodes.has(edge.target),
      );
    return NextResponse.json({
      root,
      nodes: [...selectedNodes].map((id) => cache.nodes.get(id)),
      edges,
      truncated: selectedNodes.size >= limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
