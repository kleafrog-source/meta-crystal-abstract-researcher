"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2, RefreshCw, Search, Square } from "lucide-react";

import { V3InfoTip, V3Tooltip } from "@/components/rag-v3/V3Tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Node {
  id: string;
  type: string;
  label: string;
  name_ru?: string;
  category?: string;
  community_id?: number;
  semantic_degree?: number;
}
interface Edge {
  id: string;
  type: string;
  source: string;
  target: string;
  similarity?: number;
  provenance?: Record<string, unknown>;
}
interface Subgraph {
  root: string;
  nodes: Node[];
  edges: Edge[];
  truncated: boolean;
}
interface Status {
  status: "ready" | "stale" | "not_built";
  stale_reasons: string[];
  summary: Record<string, number | Record<string, number>> | null;
  manifest: Record<string, unknown> | null;
  job: {
    running: boolean;
    progress: { stage: string | null; current: number; total: number };
    last_error: string | null;
  };
}

export function KnowledgeGraphPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState("1");
  const [graph, setGraph] = useState<Subgraph | null>(null);
  const [edgeType, setEdgeType] = useState("all");
  const [selected, setSelected] = useState<Edge | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/knowledge-graph/status", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? `HTTP ${response.status}`);
    setStatus(payload);
  }, []);
  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        await refresh();
      } catch (caught) {
        if (!disposed)
          setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (status?.job.running) void load();
    }, 1200);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [refresh, status?.job.running]);
  const run = async (method: "POST" | "DELETE") => {
    setError("");
    const response = await fetch("/api/knowledge-graph/rebuild", { method });
    const payload = await response.json();
    if (!response.ok)
      setError(payload.error ?? payload.reason ?? `HTTP ${response.status}`);
    await refresh();
  };
  const search = async () => {
    setError("");
    setSelected(null);
    const name = query.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    const response = await fetch(
      `/api/knowledge-graph/neighbors/${encodeURIComponent(name)}?depth=${depth}&limit=160`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? `HTTP ${response.status}`);
      setGraph(null);
      return;
    }
    setGraph(payload);
  };
  const visibleEdges = useMemo(
    () =>
      (graph?.edges ?? []).filter(
        (edge) => edgeType === "all" || edge.type === edgeType,
      ),
    [graph, edgeType],
  );
  const visibleIds = useMemo(
    () =>
      new Set(
        visibleEdges
          .flatMap((edge) => [edge.source, edge.target])
          .concat(graph?.root ?? []),
      ),
    [visibleEdges, graph?.root],
  );
  const nodes = useMemo(
    () => (graph?.nodes ?? []).filter((node) => visibleIds.has(node.id)),
    [graph, visibleIds],
  );
  const types = useMemo(
    () => [...new Set((graph?.edges ?? []).map((edge) => edge.type))].sort(),
    [graph],
  );

  return (
    <div className="flowmusic-console min-h-full overflow-auto p-4 text-zinc-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="rounded-lg border border-violet-400/25 bg-gradient-to-br from-violet-950/40 to-fuchsia-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-violet-200">
                <GitBranch className="size-5" />
                <h1 className="font-mono text-lg font-semibold">
                  Parameter Knowledge Graph
                </h1>
                <V3InfoTip content="Read-only граф связей параметров V3. Он не меняет базу, значения или индексы." />
                <V3InfoTip content="Фактические связи таксономии и атомов плюс взаимные семантические соседи из текущего composite index." />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{status?.status ?? "loading"}</Badge>
              <Badge variant="outline">
                {String(status?.manifest?.embedding_model ?? "—")}
              </Badge>
              <Badge variant="outline">
                {String(status?.summary?.parameter_count ?? 0)} параметров
              </Badge>
            </div>
          </div>
        </header>
        <section className="rounded-lg border border-cyan-400/20 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              Построение графа{" "}
              <V3InfoTip content="Использует готовые векторы и CPU. Ollama и GPU не запускаются. Предыдущий граф сохраняется до успешного завершения." />
              {status?.stale_reasons?.length ? (
                <div className="mt-1 text-xs font-normal text-amber-300">
                  Устарел: {status.stale_reasons.join("; ")}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <V3Tooltip content="Перестроить граф из актуального снимка V3 и composite index.">
                <Button
                  size="sm"
                  onClick={() => void run("POST")}
                  disabled={status?.job.running}
                >
                  <GitBranch className="size-4" />
                  Построить
                </Button>
              </V3Tooltip>
              <V3Tooltip content="Остановить текущую сборку без повреждения готового графа.">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void run("DELETE")}
                  disabled={!status?.job.running}
                >
                  <Square className="size-4" />
                  Остановить
                </Button>
              </V3Tooltip>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refresh()}
              >
                <RefreshCw className="size-4" />
                Обновить
              </Button>
            </div>
          </div>
          {status?.job.running ? (
            <div className="mt-2 text-xs text-cyan-200">
              <Loader2 className="mr-1 inline size-4 animate-spin" />
              {status.job.progress.stage ?? "подготовка"} ·{" "}
              {status.job.progress.current}/{status.job.progress.total}
            </div>
          ) : null}
          {status?.job.last_error ? (
            <div className="mt-2 text-xs text-red-300">
              {status.job.last_error}
            </div>
          ) : null}
        </section>
        {status?.summary ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Узлы", status.summary.node_count],
              ["Рёбра", status.summary.edge_count],
              ["Semantic", status.summary.semantic_edge_count],
              ["Компоненты", status.summary.community_count],
              ["Изолированные", status.summary.isolated_parameter_count],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-white/10 bg-black/30 p-3"
              >
                <div className="text-xs text-zinc-500">{String(label)}</div>
                <div className="mt-1 text-2xl text-violet-200">
                  {String(value ?? 0)}
                </div>
              </div>
            ))}
          </section>
        ) : null}
        <section className="rounded-lg border border-fuchsia-400/20 bg-black/30 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-72 flex-1 gap-1 text-xs">
              technical_name
              <V3InfoTip content="Введите точное техническое имя параметра. Пробелы автоматически заменяются подчёркиваниями." />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void search();
                }}
                placeholder="spectral_flux_density_ratio"
              />
            </label>
            <label className="grid gap-1 text-xs">
              Глубина
              <V3InfoTip content="1 показывает непосредственных соседей; 2 — ещё один уровень. Ответ ограничен 160 узлами." />
              <Input
                className="w-24"
                type="number"
                min="1"
                max="2"
                value={depth}
                onChange={(event) => setDepth(event.target.value)}
              />
            </label>
            <Button onClick={() => void search()}>
              <Search className="size-4" />
              Найти
            </Button>
            {graph ? (
              <select
                className="h-9 rounded border border-white/10 bg-black px-3 text-xs"
                value={edgeType}
                onChange={(event) => setEdgeType(event.target.value)}
              >
                <option value="all">Все связи</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {error ? (
            <div className="mt-2 text-xs text-red-300">{error}</div>
          ) : null}
        </section>
        {graph ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
              <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">
                Ограниченный подграф · {nodes.length} узлов ·{" "}
                {visibleEdges.length} рёбер{" "}
                {graph.truncated ? (
                  <Badge className="ml-2" variant="outline">
                    лимит достигнут
                  </Badge>
                ) : null}
              </div>
              <div className="max-h-[620px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-950">
                    <tr>
                      <th className="p-2">Узел</th>
                      <th className="p-2">Тип</th>
                      <th className="p-2">Категория</th>
                      <th className="p-2">Компонента</th>
                      <th className="p-2">Степень</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node) => (
                      <tr
                        key={node.id}
                        className={
                          node.id === graph.root
                            ? "bg-violet-950/40"
                            : "border-t border-white/5"
                        }
                      >
                        <td className="p-2 font-mono text-cyan-200">
                          {node.label}
                        </td>
                        <td className="p-2">{node.type}</td>
                        <td className="p-2">{node.category ?? "—"}</td>
                        <td className="p-2">{node.community_id ?? "—"}</td>
                        <td className="p-2">{node.semantic_degree ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="mb-2 text-sm font-semibold">
                Связи и provenance
              </div>
              <div className="max-h-[560px] space-y-2 overflow-auto">
                {visibleEdges.slice(0, 200).map((edge) => (
                  <button
                    key={edge.id}
                    onClick={() => setSelected(edge)}
                    className="block w-full rounded border border-white/10 p-2 text-left text-[11px] hover:border-violet-400/40"
                  >
                    <div className="text-violet-200">
                      {edge.type}
                      {edge.similarity !== undefined
                        ? ` · ${edge.similarity.toFixed(4)}`
                        : ""}
                    </div>
                    <div className="mt-1 break-all text-zinc-500">
                      {edge.source}
                      <br />→ {edge.target}
                    </div>
                  </button>
                ))}
              </div>
              {selected ? (
                <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-black p-2 text-[10px] text-zinc-400">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
