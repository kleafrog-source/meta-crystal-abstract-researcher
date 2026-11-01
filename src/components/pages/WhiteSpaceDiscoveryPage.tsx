"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  FlaskConical,
  Grid3X3,
  Loader2,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { V3InfoTip, V3Tooltip } from "@/components/rag-v3/V3Tooltip";
import { useUiText } from "@/lib/ui-i18n";

interface Gap {
  gap_id: string;
  kind: "taxonomy" | "atom_coverage" | "semantic_density" | "graph";
  priority: number;
  confidence: number;
  evidence: Record<string, unknown>;
  suggested_query: string;
  target_mode: "meta-crystal-v3-lab" | "combinatorial-synthesis";
}
interface Report {
  generated_at: string;
  embedding_model: string;
  dimensions: number;
  parameter_count: number;
  summary: Record<string, number>;
  gaps: Gap[];
  taxonomy_matrix: {
    cells: Array<{ category: string; sub_category: string; count: number }>;
  };
}
interface Status {
  status: "not_built" | "stale" | "ready";
  stale_reasons: string[];
  report: Report | null;
  job: {
    running: boolean;
    progress: { stage: string | null; current: number; total: number };
    log_tail: string[];
    last_error: string | null;
  };
  error?: string;
}

const labels: Record<Gap["kind"], string> = {
  taxonomy: "Таксономия",
  atom_coverage: "Атомы",
  semantic_density: "Семантическая плотность",
  graph: "Граф",
};

export function WhiteSpaceDiscoveryPage() {
  const t = useUiText();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("all");
  const [minimum, setMinimum] = useState("0");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/white-space", { cache: "no-store" });
    const value = (await response.json()) as Status;
    if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
    setStatus(value);
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
    const response = await fetch("/api/white-space", { method });
    const value = (await response.json()) as {
      reason?: string;
      error?: string;
    };
    if (!response.ok)
      setError(value.error ?? value.reason ?? `HTTP ${response.status}`);
    await refresh();
  };

  const gaps = useMemo(
    () =>
      (status?.report?.gaps ?? []).filter((item) => {
        if (kind !== "all" && item.kind !== kind) return false;
        if (item.priority < Number(minimum || 0)) return false;
        const needle = search.trim().toLowerCase();
        return (
          !needle ||
          item.suggested_query.toLowerCase().includes(needle) ||
          JSON.stringify(item.evidence).toLowerCase().includes(needle)
        );
      }),
    [status?.report?.gaps, kind, minimum, search],
  );

  const matrix = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const cell of status?.report?.taxonomy_matrix.cells ?? []) {
      const key = `${cell.category} · ${cell.sub_category}`;
      grouped.set(key, (grouped.get(key) ?? 0) + cell.count);
    }
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [status?.report]);

  const openTarget = (item: Gap) => {
    router.push(
      `/${item.target_mode}?query=${encodeURIComponent(item.suggested_query)}`,
    );
  };

  return (
    <div className="flowmusic-console min-h-full overflow-auto p-4 text-zinc-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="rounded-lg border border-sky-400/25 bg-gradient-to-br from-sky-950/40 to-cyan-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sky-200">
                <Grid3X3 className="size-5" />
                <h1 className="font-mono text-lg font-semibold">
                  White Space Discovery
                </h1>
                <V3InfoTip content="Ищет проверяемые пробелы покрытия. Режим ничего не публикует и не запускает LLM автоматически." />
                <V3InfoTip content={t("Таксономические, атомные и локально-разреженные области текущей V3. UMAP не используется как доказательство лакуны.")} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{status?.status ?? "loading"}</Badge>
              <Badge variant="outline">
                {status?.report?.embedding_model ?? "—"}
              </Badge>
              <Badge variant="outline">
                {status?.report
                  ? `${t("Параметров:")} ${status.report.parameter_count}`
                  : t("нет отчёта")}
              </Badge>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-cyan-400/20 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                Управляемый анализ
                <V3InfoTip content="Анализ использует готовый composite index и NumPy на CPU. Новые embedding-запросы и GPU не запускаются." />
              </div>
              {status?.stale_reasons?.length ? (
                <div className="mt-1 text-xs text-amber-300">
                  Устарел: {status.stale_reasons.join("; ")}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <V3Tooltip content="Строит новый отчёт. Предыдущий остаётся рабочим до атомарного завершения.">
                <Button
                  size="sm"
                  onClick={() => void run("POST")}
                  disabled={status?.job.running}
                >
                  <Search className="size-4" />
                  Построить отчёт
                </Button>
              </V3Tooltip>
              <V3Tooltip content="Останавливает текущий анализ, не заменяя готовый отчёт.">
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
              <V3Tooltip content="Перечитывает статус и готовый отчёт.">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refresh()}
                >
                  <RefreshCw className="size-4" />
                  Обновить
                </Button>
              </V3Tooltip>
            </div>
          </div>
          {status?.job.running ? (
            <div className="mt-3 text-xs text-cyan-200">
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
          {error ? (
            <div className="mt-2 text-xs text-red-300">{error}</div>
          ) : null}
        </section>

        {status?.report ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  "taxonomy",
                  "atom_coverage",
                  "semantic_density",
                  "graph",
                ] as const
              ).map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-white/10 bg-black/30 p-3"
                >
                  <div className="text-xs text-zinc-500">{t(labels[item])}</div>
                  <div className="mt-1 text-2xl font-semibold text-cyan-200">
                    {status.report?.summary[item] ?? 0}
                  </div>
                </div>
              ))}
            </section>
            <section className="rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                Покрытие крупнейших групп
                <V3InfoTip content="Число параметров в паре category/subcategory. Это обзор покрытия, а не автоматическое доказательство лакуны." />
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {matrix.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-2 rounded border border-white/10 px-3 py-2 text-xs"
                  >
                    <span className="truncate text-zinc-300">{name}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </section>
            <section className="space-y-3 rounded-lg border border-fuchsia-400/20 bg-fuchsia-950/10 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs">
                  Тип
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все типы</SelectItem>
                      {Object.entries(labels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-xs">
                  Минимальный priority
                  <Input
                    className="w-36"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={minimum}
                    onChange={(event) => setMinimum(event.target.value)}
                  />
                </label>
                <label className="grid min-w-64 flex-1 gap-1 text-xs">
                  Фильтр
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="категория, атом или текст запроса"
                  />
                </label>
                <Badge variant="outline">показано: {gaps.length}</Badge>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {gaps.map((item) => (
                  <article
                    key={item.gap_id}
                    className="rounded-lg border border-white/10 bg-black/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{t(labels[item.kind])}</Badge>
                        <span className="text-[10px] text-zinc-500">
                          P {item.priority.toFixed(3)} · C{" "}
                          {item.confidence.toFixed(3)}
                        </span>
                      </div>
                      <code className="text-[9px] text-zinc-600">
                        {item.gap_id}
                      </code>
                    </div>
                    <p className="mt-3 text-sm text-zinc-200">
                      {item.suggested_query}
                    </p>
                    <details className="mt-2 text-xs text-zinc-500">
                      <summary className="cursor-pointer">Evidence</summary>
                      <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2">
                        {JSON.stringify(item.evidence, null, 2)}
                      </pre>
                    </details>
                    <V3Tooltip content="Открывает выбранный генеративный режим и переносит этот запрос. Генерация не запускается автоматически.">
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() => openTarget(item)}
                      >
                        {item.target_mode === "meta-crystal-v3-lab" ? (
                          <Brain className="size-4" />
                        ) : (
                          <FlaskConical className="size-4" />
                        )}
                        Открыть в{" "}
                        {item.target_mode === "meta-crystal-v3-lab"
                          ? "V3 Lab"
                          : "Synthesis"}
                      </Button>
                    </V3Tooltip>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-white/15 p-10 text-center text-sm text-zinc-500">
            Отчёт ещё не построен.
          </div>
        )}
      </div>
    </div>
  );
}
