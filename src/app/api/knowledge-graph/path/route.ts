import { NextRequest, NextResponse } from "next/server";
import {
  boundedInt,
  loadGraph,
  parameterId,
  safeName,
} from "@/lib/knowledge-graph/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from") ?? "",
      to = request.nextUrl.searchParams.get("to") ?? "";
    if (!safeName(from) || !safeName(to))
      return NextResponse.json(
        { error: "Invalid parameter name" },
        { status: 400 },
      );
    const maximum = boundedInt(
      request.nextUrl.searchParams.get("maxDepth"),
      8,
      1,
      12,
    );
    const cache = await loadGraph(),
      start = parameterId(from),
      goal = parameterId(to);
    if (!cache.nodes.has(start) || !cache.nodes.has(goal))
      return NextResponse.json(
        { error: "Parameter not found" },
        { status: 404 },
      );
    const queue: Array<{ id: string; depth: number }> = [
      { id: start, depth: 0 },
    ];
    const parent = new Map<string, { node: string; edge: string }>();
    const visited = new Set([start]);
    while (queue.length) {
      const current = queue.shift()!;
      if (current.id === goal) {
        const nodeIds = [goal],
          edgeIds: string[] = [];
        let cursor = goal;
        while (cursor !== start) {
          const step = parent.get(cursor)!;
          edgeIds.push(step.edge);
          nodeIds.push(step.node);
          cursor = step.node;
        }
        nodeIds.reverse();
        edgeIds.reverse();
        return NextResponse.json({
          found: true,
          nodes: nodeIds.map((id) => cache.nodes.get(id)),
          edges: edgeIds.map((id) => cache.edges.get(id)),
        });
      }
      if (current.depth >= maximum) continue;
      for (const edgeId of cache.graph.adjacency[current.id] ?? []) {
        const edge = cache.edges.get(edgeId)!;
        const other = edge.source === current.id ? edge.target : edge.source;
        if (!visited.has(other)) {
          visited.add(other);
          parent.set(other, { node: current.id, edge: edgeId });
          queue.push({ id: other, depth: current.depth + 1 });
        }
      }
    }
    return NextResponse.json({ found: false, nodes: [], edges: [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
