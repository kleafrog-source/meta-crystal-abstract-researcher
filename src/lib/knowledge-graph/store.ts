import { promises as fs } from "node:fs";
import path from "node:path";

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  [key: string]: unknown;
}
export interface GraphEdge {
  id: string;
  type: string;
  source: string;
  target: string;
  similarity?: number;
  [key: string]: unknown;
}
interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  adjacency: Record<string, string[]>;
  communities: Array<{ id: number; size: number; parameters: string[] }>;
  isolated_parameters: string[];
}
const GRAPH_PATH = path.join(
  process.cwd(),
  "data",
  "combinatorial-genesis",
  "knowledge-graph",
  "graph.json",
);
const shared = globalThis as typeof globalThis & {
  __kgCache?: {
    mtime: number;
    graph: Graph;
    nodes: Map<string, GraphNode>;
    edges: Map<string, GraphEdge>;
  };
};

export async function loadGraph() {
  const stat = await fs.stat(GRAPH_PATH);
  if (shared.__kgCache?.mtime === stat.mtimeMs) return shared.__kgCache;
  const graph = JSON.parse(await fs.readFile(GRAPH_PATH, "utf8")) as Graph;
  const cache = {
    mtime: stat.mtimeMs,
    graph,
    nodes: new Map(graph.nodes.map((node) => [node.id, node])),
    edges: new Map(graph.edges.map((edge) => [edge.id, edge])),
  };
  shared.__kgCache = cache;
  return cache;
}
export function parameterId(name: string) {
  return `parameter:${name}`;
}
export function safeName(value: string) {
  return /^[a-z0-9_]{1,240}$/.test(value);
}
export function boundedInt(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
    : fallback;
}
