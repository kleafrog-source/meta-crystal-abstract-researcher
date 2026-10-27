"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Search,
  Square,
  Upload,
} from "lucide-react";
import { MacroGenerator } from "@/components/rag-v3/MacroGenerator";
import { JournalDraftButton } from "@/components/cross-modal/JournalDraftButton";
import { V3InfoTip, V3Tooltip } from "@/components/rag-v3/V3Tooltip";
import { VirtualizedParamList } from "@/components/rag-v3/VirtualizedParamList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AMIcon } from "@/components/ui/am-icon";
import { Input } from "@/components/ui/input";
import type { ActiveParameter } from "@/lib/rag-v3/types";

interface Status {
  ready: boolean;
  status: string;
  stale_reasons: string[];
  model_path: string;
  manifest: {
    model_id?: string;
    model_revision?: string;
    parameter_count?: number;
    dimensions?: number;
    encoded?: number;
    reused?: number;
  } | null;
  index_job: Job;
  search_job: Job;
}
interface Job {
  running: boolean;
  progress: { stage: string | null; current: number; total: number };
  last_error: string | null;
}
type ValueMode = "expressive" | "conservative" | "default";

export function MorphoAcousticRagPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [topK, setTopK] = useState("20");
  const [valueMode, setValueMode] = useState<ValueMode>("expressive");
  const [vocalMatrixMode, setVocalMatrixMode] = useState(false);
  const [anchoredCount, setAnchoredCount] = useState(0);
  const [parameters, setParameters] = useState<ActiveParameter[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/morpho/status", { cache: "no-store" });
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
        if (!disposed) setError(String(caught));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (status?.index_job.running || status?.search_job.running) void load();
    }, 1200);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [refresh, status?.index_job.running, status?.search_job.running]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const choose = (next: File | null) => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
    setParameters([]);
    setAnchoredCount(0);
    setError("");
  };
  const indexAction = async (method: "POST" | "DELETE") => {
    setError("");
    const response = await fetch("/api/morpho/index", { method });
    const payload = await response.json();
    if (!response.ok)
      setError(payload.error ?? payload.reason ?? `HTTP ${response.status}`);
    await refresh();
  };
  const search = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("image", file, file.name);
      form.append("top_k", topK);
      form.append("value_mode", valueMode);
      form.append("vocal_matrix", String(vocalMatrixMode));
      const response = await fetch("/api/morpho/search", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.results))
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      setParameters(payload.results);
      setAnchoredCount(Number(payload.anchored_count) || 0);
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      abortRef.current = null;
      void refresh();
    }
  };
  const stopSearch = async () => {
    abortRef.current?.abort();
    await fetch("/api/morpho/search", { method: "DELETE" });
    setBusy(false);
    await refresh();
  };
  const updateValue = (name: string, value: number | string) =>
    setParameters((current) =>
      current.map((item) =>
        item.technical_name === name ? { ...item, current_value: value } : item,
      ),
    );
  return (
    <div className="flowmusic-console flex h-full flex-col text-zinc-100">
      <header className="border-b border-white/15 bg-black/70 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
              <AMIcon name="morpho" size="md" bright />
              Morpho-Acoustic RAG · SigLIP2
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Изображение → релевантные параметры V3 → значения из SigLIP2
              anchors, axes и relations.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{status?.status ?? "loading"}</Badge>
            <Badge variant="outline">
              {status?.manifest?.model_id ?? "google/siglip2-base-patch16-224"}
            </Badge>
            <Badge variant="outline">
              CPU · {status?.manifest?.dimensions ?? 768}d
            </Badge>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-3">
        <div className="mx-auto flex max-w-[1920px] flex-col gap-3">
          <section className="rounded-lg border border-fuchsia-400/25 bg-fuchsia-950/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  SigLIP2 text index
                  <V3InfoTip content="Индексирует только sound/structure параметры V3 в общем text/image пространстве SigLIP2. GPU и Ollama не используются." />
                </div>
                {status?.stale_reasons?.length ? (
                  <div className="mt-1 text-xs text-amber-300">
                    Устарел: {status.stale_reasons.join("; ")}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <V3Tooltip content="Кодирует новые и изменённые тексты параметров; неизменённые векторы переиспользуются.">
                  <Button
                    size="sm"
                    onClick={() => void indexAction("POST")}
                    disabled={status?.index_job.running}
                  >
                    <RefreshCw
                      className={
                        status?.index_job.running
                          ? "size-4 animate-spin"
                          : "size-4"
                      }
                    />
                    Построить индекс
                  </Button>
                </V3Tooltip>
                <V3Tooltip content="Останавливает построение, не повреждая предыдущий готовый индекс.">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void indexAction("DELETE")}
                    disabled={!status?.index_job.running}
                  >
                    <Square className="size-4" />
                    Остановить
                  </Button>
                </V3Tooltip>
              </div>
            </div>
            {status?.index_job.running ? (
              <div className="mt-2 text-xs text-cyan-200">
                <Loader2 className="mr-1 inline size-4 animate-spin" />
                {status.index_job.progress.stage ?? "загрузка модели"} ·{" "}
                {status.index_job.progress.current}/
                {status.index_job.progress.total}
              </div>
            ) : null}
            {status?.manifest ? (
              <div className="mt-2 text-xs text-zinc-500">
                Параметров: {status.manifest.parameter_count} · encoded:{" "}
                {status.manifest.encoded} · reused: {status.manifest.reused}
              </div>
            ) : null}
          </section>
          <section className="grid gap-3 rounded-lg border border-cyan-400/20 bg-black/30 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <label className="flex min-h-72 cursor-pointer items-center justify-center overflow-hidden rounded border border-dashed border-cyan-400/30 bg-black/40">
                {preview ? (
                  <img
                    src={preview}
                    alt="Morpho reference"
                    className="max-h-[440px] max-w-full object-contain"
                  />
                ) : (
                  <span className="flex items-center gap-2 text-sm text-zinc-400">
                    <Upload className="size-5" />
                    Выбрать изображение
                  </span>
                )}
                <input
                  className="hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => choose(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold">
                Поиск
                <V3InfoTip content="Cosine similarity ранжирует параметры по близости к изображению. Затем выбранный режим определяет значения Range, Select и Toggle по SigLIP2-анкорам." />
              </div>
              <label className="grid gap-1 text-xs">
                Top-K
                <Input
                  type="number"
                  min="3"
                  max="100"
                  value={topK}
                  onChange={(event) => setTopK(event.target.value)}
                />
              </label>
              <div className="grid gap-1">
                <div className="flex items-center gap-1 text-xs">
                  Режим значений
                  <V3InfoTip content="Expressive применяет найденные позиции полностью. Conservative смешивает их с default. Default only отключает автоматический выбор значений." />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ["expressive", "Expressive"],
                      ["conservative", "Conservative"],
                      ["default", "Default only"],
                    ] as const
                  ).map(([mode, label]) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      variant={valueMode === mode ? "default" : "outline"}
                      onClick={() => setValueMode(mode)}
                      disabled={busy}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant={vocalMatrixMode ? "default" : "outline"}
                onClick={() => setVocalMatrixMode((value) => !value)}
                disabled={busy}
              ><AMIcon name="vocal" size="sm" />Vocal Matrix</Button>
              <div className="flex items-center gap-1 text-xs text-zinc-500">Фильтрует расширенный SigLIP2-поиск до вокальной матрицы.<V3InfoTip content="Работает и с обычным изображением, и с загруженным изображением спектрограммы. Значения выбираются текущим режимом Expressive/Conservative/Default." /></div>
              <Button
                onClick={() => void search()}
                disabled={!file || !status?.ready || busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <AMIcon name="search" size="sm" />
                )}
                {busy ? "Поиск…" : "Найти параметры"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void stopSearch()}
                disabled={!busy && !status?.search_job.running}
              >
                <Square className="size-4" />
                Остановить поиск
              </Button>
              <JournalDraftButton
                modality="image"
                engine="siglip2"
                parameters={parameters}
                model={{
                  id:
                    status?.manifest?.model_id ??
                    "google/siglip2-base-patch16-224",
                  revision: status?.manifest?.model_revision,
                  dimensions: status?.manifest?.dimensions,
                }}
                settings={{ top_k: Number(topK) || 20, value_mode: valueMode, vocal_matrix: vocalMatrixMode }}
                asset={file}
                label={`Image · ${file?.name ?? "reference"}`}
              />
              <div className="text-xs text-zinc-500">
                Файл: {file?.name ?? "не выбран"}
                <br />
                Результатов: {parameters.length} · значений подобрано:{" "}
                {anchoredCount}
              </div>
              {error ? (
                <div className="rounded border border-red-500/30 bg-red-950/20 p-2 text-xs text-red-300">
                  {error}
                </div>
              ) : null}
            </div>
          </section>
          <div className="console-workbench grid min-h-[680px] gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="console-bank flex min-h-0 flex-col">
              <div className="console-bank-header flex items-center justify-between">
                <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.18em]">
                  Image-matched control bank
                </h2>
                <span className="text-[10px] text-emerald-300">
                  {parameters.length} channels
                </span>
              </div>
              <VirtualizedParamList
                parameters={parameters}
                className="min-h-0 flex-1"
                onChange={updateValue}
                onRemove={(name) =>
                  setParameters((items) =>
                    items.filter((item) => item.technical_name !== name),
                  )
                }
              />
            </section>
            <aside>
              <MacroGenerator parameters={parameters} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
