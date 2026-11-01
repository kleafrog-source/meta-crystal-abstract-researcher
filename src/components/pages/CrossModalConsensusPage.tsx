"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  AudioWaveform,
  Blend,
  Check,
  Copy,
  Grid2X2,
  ImageIcon,
  Link2,
  List,
  Loader2,
  Network,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";

import { MacroGenerator } from "@/components/rag-v3/MacroGenerator";
import { VirtualizedParamList } from "@/components/rag-v3/VirtualizedParamList";
import { JournalDraftButton } from "@/components/cross-modal/JournalDraftButton";
import { V3InfoTip, V3Tooltip } from "@/components/rag-v3/V3Tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  BridgeManifest,
  BridgeMatch,
  ConsensusResultRow,
  JournalRecord,
  TransitionPreparedRow,
} from "@/lib/cross-modal/types";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { interpolateTransition } from "@/lib/cross-modal/transition";
import { useUiText } from "@/lib/ui-i18n";

export function CrossModalConsensusPage() {
  const t = useUiText();
  const [records, setRecords] = useState<JournalRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState<{
    ready: boolean;
    stale: boolean;
    active_model: string;
    manifest: BridgeManifest | null;
  } | null>(null);
  const [bridgeRecord, setBridgeRecord] = useState("");
  const [includeReview, setIncludeReview] = useState(false);
  const [bridgeMatches, setBridgeMatches] = useState<BridgeMatch[]>([]);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [sourceWeights, setSourceWeights] = useState<Record<string, number>>(
    {},
  );
  const [consensusTopK, setConsensusTopK] = useState(40);
  const [graphEnabled, setGraphEnabled] = useState(false);
  const [consensusBusy, setConsensusBusy] = useState(false);
  const [consensusParameters, setConsensusParameters] = useState<
    ActiveParameter[]
  >([]);
  const [consensusProvenance, setConsensusProvenance] = useState<
    ConsensusResultRow[]
  >([]);
  const [transitionA, setTransitionA] = useState("");
  const [transitionB, setTransitionB] = useState("");
  const [transitionRows, setTransitionRows] = useState<TransitionPreparedRow[]>(
    [],
  );
  const [transitionRatio, setTransitionRatio] = useState(0.5);
  const [transitionTopK, setTransitionTopK] = useState(40);
  const [transitionParameters, setTransitionParameters] = useState<
    ActiveParameter[]
  >([]);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const transitionCategorical = useRef<Record<string, string>>({});
  const [journalView, setJournalView] = useState<"cards" | "list">("cards");
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(
    null,
  );
  const [copyState, setCopyState] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/journal", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      setRecords(payload.records ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    void fetch("/api/cross-modal/journal", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (disposed) return;
        if (!response.ok)
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        setRecords(payload.records ?? []);
      })
      .catch((caught) => {
        if (!disposed)
          setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      disposed = true;
    };
  }, []);
  const refreshBridge = useCallback(async () => {
    const response = await fetch("/api/cross-modal/bridge", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? `HTTP ${response.status}`);
    setBridgeStatus(payload);
  }, []);
  useEffect(() => {
    let disposed = false;
    void fetch("/api/cross-modal/bridge", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (disposed) return;
        if (!response.ok)
          throw new Error(payload.error ?? `HTTP ${response.status}`);
        setBridgeStatus(payload);
      })
      .catch((caught) => {
        if (!disposed)
          setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      disposed = true;
    };
  }, []);
  const remove = async (record: JournalRecord) => {
    if (
      !window.confirm(
        `Удалить запись «${record.label}»? Media asset будет удалён только при отсутствии других ссылок.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };
  const verify = async (record: JournalRecord) => {
    setVerifying(record.id);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id }),
      });
      const payload = await response.json();
      if (!response.ok && !payload.verification)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setVerifying(null);
    }
  };
  const stop = async () => {
    try {
      await fetch("/api/cross-modal/verify", { method: "DELETE" });
    } finally {
      setVerifying(null);
    }
  };
  const buildBridge = async () => {
    setBridgeBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build" }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      await refreshBridge();
      setBridgeMatches([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBridgeBusy(false);
    }
  };
  const searchBridge = async () => {
    if (!bridgeRecord) return;
    setBridgeBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          record_id: bridgeRecord,
          include_review: includeReview,
          top_k: 10,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      setBridgeMatches(payload.matches ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBridgeBusy(false);
    }
  };
  const runConsensus = async () => {
    const sources = Object.entries(sourceWeights)
      .filter(([, weight]) => weight > 0)
      .map(([record_id, weight]) => ({ record_id, weight }));
    if (!sources.length) return;
    setConsensusBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources,
          top_k: consensusTopK,
          graph_enabled: graphEnabled,
          graph_penalty: 0.35,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      setConsensusParameters(payload.parameters ?? []);
      setConsensusProvenance(payload.provenance ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setConsensusBusy(false);
    }
  };
  const updateConsensusValue = (name: string, value: number | string) =>
    setConsensusParameters((current) =>
      current.map((item) =>
        item.technical_name === name ? { ...item, current_value: value } : item,
      ),
    );
  const applyTransition = (
    rows: TransitionPreparedRow[],
    ratio: number,
    topK = transitionTopK,
  ) => {
    const result = interpolateTransition(
      rows,
      ratio,
      topK,
      transitionCategorical.current,
    );
    transitionCategorical.current = result.categorical;
    setTransitionRatio(ratio);
    setTransitionParameters(result.parameters);
  };
  const prepareTransition = async () => {
    if (!transitionA || !transitionB || transitionA === transitionB) return;
    setTransitionBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_a: transitionA, record_b: transitionB }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      const rows = payload.rows ?? [];
      setTransitionRows(rows);
      transitionCategorical.current = {};
      applyTransition(rows, 0.5);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setTransitionBusy(false);
    }
  };
  const updateTransitionValue = (name: string, value: number | string) =>
    setTransitionParameters((current) =>
      current.map((item) =>
        item.technical_name === name ? { ...item, current_value: value } : item,
      ),
    );
  const verdict = async (
    record: JournalRecord,
    decision: "approved" | "rejected",
  ) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cross-modal/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, decision }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(key);
      window.setTimeout(() => setCopyState(""), 1600);
    } catch {
      setError("Не удалось скопировать текст в буфер обмена.");
    }
  };
  const bridgeRecords = records.filter(
    (record) =>
      (record.snapshot.modality === "audio" ||
        record.snapshot.modality === "image") &&
      (record.latest_user_verdict?.decision === "approved" ||
        record.latest_verification?.status === "verified" ||
        (includeReview && record.latest_verification?.status === "review")),
  );
  const selectedJournal =
    records.find((record) => record.id === selectedJournalId) ?? records[0];
  const displayedRecords =
    journalView === "list"
      ? selectedJournal
        ? [selectedJournal]
        : []
      : records;
  return (
    <div className="flowmusic-console flex h-full flex-col text-zinc-100">
      <header className="border-b border-white/15 bg-black/70 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-base font-semibold">
              <Archive className="size-4 text-cyan-300" />
              Cross-Modal Consensus
            </h1>
            <p className="text-[10px] text-zinc-500">
              Audio · Image · Semantic V3
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
            {["Journal", "Cycle", "Bridge", "Consensus", "Transition"].map(
              (item) => (
                <span
                  key={item}
                  className="rounded border border-cyan-400/25 bg-cyan-950/20 px-2 py-1 font-mono text-[9px] text-cyan-200"
                >
                  {item} · ready
                </span>
              ),
            )}
            <Badge variant="outline">{records.length}</Badge>
            <V3Tooltip content="Перечитывает Journal с диска.">
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                onClick={() => void refresh()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
              </Button>
            </V3Tooltip>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-[1700px] space-y-4">
          <section className="rounded-lg border border-cyan-400/25 bg-cyan-950/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              Cross-Modal Journal
              <V3InfoTip content="Записи неизменяемы и адресуются SHA-256. Проверки цикла сохраняются отдельно, поэтому повторная проверка не уничтожает историю." />
            </div>
          </section>
          <section className="space-y-3 rounded-lg border border-fuchsia-400/25 bg-fuchsia-950/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="size-4 text-fuchsia-300" />
                  Lingua Franca Bridge
                  <V3InfoTip content="Сопоставляет Audio и Image записи только через их проверенные Reverse Query в общей embedding-модели. CLAP и SigLIP2 векторы никогда не смешиваются." />
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  model: {bridgeStatus?.active_model ?? "…"} · index:{" "}
                  {bridgeStatus?.manifest?.count ?? 0} ·{" "}
                  {bridgeStatus?.stale
                    ? "stale"
                    : bridgeStatus?.ready
                      ? "ready"
                      : "not built"}
                </div>
              </div>
              <V3Tooltip content="Инкрементально добавляет verified/review Reverse Query. При смене embedding-модели индекс полностью перестраивается.">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void buildBridge()}
                  disabled={bridgeBusy}
                >
                  {bridgeBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {bridgeStatus?.ready
                    ? t("Обновить Bridge index")
                    : t("Построить Bridge index")}
                </Button>
              </V3Tooltip>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <select
                className="h-9 rounded border border-white/15 bg-black/50 px-3 text-xs"
                value={bridgeRecord}
                onChange={(event) => setBridgeRecord(event.target.value)}
              >
                <option value="">
                  {t("Выберите verified Audio или Image запись")}
                </option>
                {bridgeRecords.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.snapshot.modality} · {record.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded border border-white/10 px-3 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={includeReview}
                  onChange={(event) => {
                    setIncludeReview(event.target.checked);
                    setBridgeRecord("");
                    setBridgeMatches([]);
                  }}
                />
                {t("Включить review")}
              </label>
              <V3Tooltip content="Ищет записи противоположной модальности. Совпадение самой записи и одинакового media asset исключается.">
                <Button
                  size="sm"
                  onClick={() => void searchBridge()}
                  disabled={
                    bridgeBusy ||
                    !bridgeRecord ||
                    !bridgeStatus?.ready ||
                    bridgeStatus.stale
                  }
                >
                  <Search className="size-4" />
                  Найти связь
                </Button>
              </V3Tooltip>
            </div>
            {!bridgeRecords.length ? (
              <div className="rounded border border-dashed border-white/10 p-3 text-xs text-zinc-500">
                {t("Нет подходящих verified Audio/Image записей. Rejected записи намеренно не индексируются.").replace("verified", `verified${includeReview ? "/review" : ""}`)}
              </div>
            ) : null}
            {bridgeMatches.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {bridgeMatches.map((match) => (
                  <div
                    key={match.record_id}
                    className="rounded border border-white/10 bg-black/30 p-3 text-xs"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-fuchsia-100">{match.label}</span>
                      <Badge variant="outline">{match.modality}</Badge>
                    </div>
                    <div className="mt-2 font-mono text-[10px] text-zinc-400">
                      text similarity {match.similarity.toFixed(4)} ·
                      verification {match.verification_score.toFixed(4)}
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-500">
                      общие параметры:{" "}
                      {match.common_parameters.length
                        ? match.common_parameters.slice(0, 12).join(" · ")
                        : "нет"}
                    </div>
                  </div>
                ))}
              </div>
            ) : bridgeRecord && !bridgeBusy ? (
              <div className="text-xs text-zinc-500">
                Связи противоположной модальности не найдены.
              </div>
            ) : null}
          </section>
          <section className="space-y-3 rounded-lg border border-emerald-400/25 bg-emerald-950/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="size-4 text-emerald-300" />
              Consensus Engine
              <V3InfoTip content="Объединяет результаты в общем пространстве technical_name и значений. Порядок выбранных источников не влияет на итог." />
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {records.map((record) => {
                const weight = sourceWeights[record.id] ?? 0;
                return (
                  <div
                    key={record.id}
                    className={`rounded border p-2 ${weight > 0 ? "border-emerald-400/35 bg-emerald-950/15" : "border-white/10 bg-black/25"}`}
                  >
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={weight > 0}
                        onChange={(event) =>
                          setSourceWeights((current) => ({
                            ...current,
                            [record.id]: event.target.checked ? 0.7 : 0,
                          }))
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-zinc-200">
                          {record.label}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {record.snapshot.modality} ·{" "}
                          {record.snapshot.parameters.length} parameters
                        </span>
                      </span>
                    </label>
                    {weight > 0 ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          className="w-full accent-emerald-400"
                          type="range"
                          min="0.05"
                          max="1"
                          step="0.05"
                          value={weight}
                          onChange={(event) =>
                            setSourceWeights((current) => ({
                              ...current,
                              [record.id]: Number(event.target.value),
                            }))
                          }
                        />
                        <span className="w-8 font-mono text-[10px] text-emerald-300">
                          {weight.toFixed(2)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded border border-white/10 px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={graphEnabled}
                  onChange={(event) => setGraphEnabled(event.target.checked)}
                />
                <Network className="size-3" />
                Knowledge Graph depth=1
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                Top-K
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={consensusTopK}
                  onChange={(event) =>
                    setConsensusTopK(
                      Math.max(
                        1,
                        Math.min(100, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className="h-9 w-20 rounded border border-white/15 bg-black/50 px-2 font-mono"
                />
              </label>
              <V3Tooltip content="Выполняет noisy-OR голосование по параметрам и согласует значения. Операция не запускает embedding или LLM.">
                <Button
                  size="sm"
                  onClick={() => void runConsensus()}
                  disabled={
                    consensusBusy ||
                    !Object.values(sourceWeights).some((weight) => weight > 0)
                  }
                >
                  {consensusBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <SlidersHorizontal className="size-4" />
                  )}
                  Собрать Consensus
                </Button>
              </V3Tooltip>
            </div>
            {consensusProvenance.length ? (
              <details className="rounded border border-white/10 bg-black/25 p-2">
                <summary className="cursor-pointer text-xs text-emerald-200">
                  Provenance · {consensusProvenance.length} параметров
                </summary>
                <div className="mt-2 max-h-52 overflow-auto font-mono text-[10px] text-zinc-500">
                  {consensusProvenance.map((row) => (
                    <div key={row.technical_name}>
                      {row.technical_name} · {row.consensus_score.toFixed(4)} ·{" "}
                      {row.graph_only
                        ? "graph"
                        : `${row.direct_source_count} direct`}{" "}
                      · {row.conflict ? "conflict" : "aligned"}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
          {consensusParameters.length ? (
            <div className="console-workbench grid min-h-[680px] gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="console-bank flex min-h-0 flex-col">
                <div className="console-bank-header flex items-center justify-between">
                  <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.18em]">
                    Consensus control bank
                  </h2>
                  <span className="text-[10px] text-emerald-300">
                    {consensusParameters.length} channels
                  </span>
                </div>
                <VirtualizedParamList
                  parameters={consensusParameters}
                  className="min-h-0 flex-1"
                  onChange={updateConsensusValue}
                  onRemove={(name) =>
                    setConsensusParameters((items) =>
                      items.filter((item) => item.technical_name !== name),
                    )
                  }
                />
                <div className="border-t border-white/10 p-2">
                  <JournalDraftButton
                    modality="text"
                    engine="consensus"
                    parameters={consensusParameters}
                    model={{ id: "parameter-space-consensus-v1" }}
                    settings={{
                      top_k: consensusTopK,
                      graph_enabled: graphEnabled,
                      selected_sources: Object.values(sourceWeights).filter(
                        (weight) => weight > 0,
                      ).length,
                    }}
                    label={`Consensus · ${consensusParameters.length} parameters`}
                  />
                </div>
              </section>
              <aside>
                <MacroGenerator parameters={consensusParameters} />
              </aside>
            </div>
          ) : null}
          <section className="space-y-3 overflow-hidden rounded-lg border border-amber-400/25 bg-amber-950/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Blend className="size-4 text-amber-300" />
              Transitional Query
              <V3InfoTip content="Подготавливает две Journal-точки один раз, затем интерполирует score и значения локально. Сырые embeddings разных моделей не используются." />
            </div>
            <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
              <select
                value={transitionA}
                onChange={(event) => {
                  setTransitionA(event.target.value);
                  setTransitionRows([]);
                  setTransitionParameters([]);
                }}
                className="h-9 min-w-0 w-full truncate rounded border border-white/15 bg-black/50 px-3 text-xs"
              >
                <option value="">{t("Точка A")}</option>
                {records.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.snapshot.modality} · {record.label}
                  </option>
                ))}
              </select>
              <span className="hidden self-center text-center text-amber-300 xl:block">
                →
              </span>
              <select
                value={transitionB}
                onChange={(event) => {
                  setTransitionB(event.target.value);
                  setTransitionRows([]);
                  setTransitionParameters([]);
                }}
                className="h-9 min-w-0 w-full truncate rounded border border-white/15 bg-black/50 px-3 text-xs"
              >
                <option value="">{t("Точка B")}</option>
                {records.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.snapshot.modality} · {record.label}
                  </option>
                ))}
              </select>
              <V3Tooltip content="Загружает объединение параметров A/B и актуальные V3-метаданные. Тяжёлые модели не запускаются.">
                <Button
                  size="sm"
                  className="w-full xl:w-auto"
                  onClick={() => void prepareTransition()}
                  disabled={
                    transitionBusy ||
                    !transitionA ||
                    !transitionB ||
                    transitionA === transitionB
                  }
                >
                  {transitionBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Blend className="size-4" />
                  )}
                  Подготовить
                </Button>
              </V3Tooltip>
            </div>
            {transitionRows.length ? (
              <div className="space-y-2 rounded border border-white/10 bg-black/25 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-amber-200">
                    A {(100 - transitionRatio * 100).toFixed(0)}%
                  </span>
                  <input
                    className="min-w-40 flex-1 accent-amber-400"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={transitionRatio}
                    onChange={(event) =>
                      applyTransition(
                        transitionRows,
                        Number(event.target.value),
                      )
                    }
                  />
                  <span className="font-mono text-xs text-amber-200">
                    B {(transitionRatio * 100).toFixed(0)}%
                  </span>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    Top-K
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={transitionTopK}
                      onChange={(event) => {
                        const value = Math.max(
                          1,
                          Math.min(100, Number(event.target.value) || 1),
                        );
                        setTransitionTopK(value);
                        applyTransition(transitionRows, transitionRatio, value);
                      }}
                      className="h-8 w-20 rounded border border-white/15 bg-black/50 px-2 font-mono"
                    />
                  </label>
                </div>
                <div className="text-[10px] text-zinc-500">
                  Range интерполируется непрерывно; Select/Toggle использует
                  hysteresis около границы переключения; отсутствующий параметр
                  имеет score 0.
                </div>
              </div>
            ) : null}
          </section>
          {transitionParameters.length ? (
            <div className="console-workbench grid min-h-[680px] gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="console-bank flex min-h-0 flex-col">
                <div className="console-bank-header flex items-center justify-between">
                  <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.18em]">
                    Transition control bank ·{" "}
                    {(transitionRatio * 100).toFixed(0)}%
                  </h2>
                  <span className="text-[10px] text-amber-300">
                    {transitionParameters.length} channels
                  </span>
                </div>
                <VirtualizedParamList
                  parameters={transitionParameters}
                  className="min-h-0 flex-1"
                  onChange={updateTransitionValue}
                  onRemove={(name) =>
                    setTransitionParameters((items) =>
                      items.filter((item) => item.technical_name !== name),
                    )
                  }
                />
                <div className="border-t border-white/10 p-2">
                  <JournalDraftButton
                    modality="transition"
                    engine="transition"
                    parameters={transitionParameters}
                    model={{ id: "parameter-space-transition-v1" }}
                    settings={{
                      ratio: transitionRatio,
                      top_k: transitionTopK,
                      source_a: transitionA,
                      source_b: transitionB,
                    }}
                    label={`Transition ${(transitionRatio * 100).toFixed(0)}% · ${transitionParameters.length} parameters`}
                  />
                  <div className="mt-1 text-[10px] text-zinc-500">
                    После сохранения используйте «Проверить цикл» у новой
                    записи: LLM создаст описание этой переходной точки и
                    выполнит V3 replay.
                  </div>
                </div>
              </section>
              <aside>
                <MacroGenerator parameters={transitionParameters} />
              </aside>
            </div>
          ) : null}
          {error ? (
            <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}
          {!records.length && !busy ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-10 text-center text-sm text-zinc-500">
              {t("Journal пока пуст. Выполните поиск в одном из трёх режимов и сохраните результат.")}
            </div>
          ) : null}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                Journal · {records.length}
              </div>
              <div className="flex gap-1">
                <V3Tooltip content="Показывает записи сеткой карточек.">
                  <Button
                    size="icon"
                    variant={journalView === "cards" ? "default" : "outline"}
                    className="size-8"
                    onClick={() => setJournalView("cards")}
                  >
                    <Grid2X2 className="size-4" />
                  </Button>
                </V3Tooltip>
                <V3Tooltip content="Показывает компактный список слева и полную запись справа.">
                  <Button
                    size="icon"
                    variant={journalView === "list" ? "default" : "outline"}
                    className="size-8"
                    onClick={() => {
                      setJournalView("list");
                      setSelectedJournalId(selectedJournal?.id ?? null);
                    }}
                  >
                    <List className="size-4" />
                  </Button>
                </V3Tooltip>
              </div>
            </div>
            <div
              className={
                journalView === "list"
                  ? "grid min-w-0 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]"
                  : ""
              }
            >
              {journalView === "list" ? (
                <aside className="max-h-[780px] overflow-auto rounded-lg border border-white/15 bg-black/35 p-1">
                  {records.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => setSelectedJournalId(record.id)}
                      className={`mb-1 w-full rounded border p-2 text-left ${selectedJournal?.id === record.id ? "border-cyan-400/40 bg-cyan-950/25" : "border-white/5 bg-black/20 hover:border-white/20"}`}
                    >
                      <div className="truncate text-xs text-zinc-200">
                        {record.label}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-zinc-500">
                        <span>{record.snapshot.modality}</span>
                        <span>
                          · {record.latest_verification?.status ?? "unverified"}
                        </span>
                        <span>
                          · {record.snapshot.parameters.length} params
                        </span>
                        {record.latest_user_verdict ? (
                          <span className="text-emerald-300">
                            · {record.latest_user_verdict.decision}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </aside>
              ) : null}
              <div
                className={
                  journalView === "cards"
                    ? "grid gap-3 lg:grid-cols-2"
                    : "min-w-0"
                }
              >
                {displayedRecords.map((record) => {
                  const verification = record.latest_verification;
                  return (
                    <article
                      key={record.id}
                      className="overflow-hidden rounded-lg border border-white/15 bg-black/35"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
                        <div>
                          <div className="flex items-center gap-2 font-mono text-sm text-white">
                            {record.snapshot.modality === "audio" ? (
                              <AudioWaveform className="size-4 text-cyan-300" />
                            ) : record.snapshot.modality === "image" ? (
                              <ImageIcon className="size-4 text-fuchsia-300" />
                            ) : (
                              <Archive className="size-4 text-emerald-300" />
                            )}
                            {record.label}
                          </div>
                          <div className="mt-1 text-[10px] text-zinc-500">
                            {new Date(record.created_at).toLocaleString(
                              "ru-RU",
                            )}{" "}
                            · {record.id.slice(0, 12)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">
                            {record.snapshot.modality}
                          </Badge>
                          <Badge variant="outline">
                            {verification?.status ?? record.verification.status}
                          </Badge>
                          {record.latest_user_verdict ? (
                            <Badge
                              variant="outline"
                              className={
                                record.latest_user_verdict.decision ===
                                "approved"
                                  ? "border-emerald-400/40 text-emerald-300"
                                  : "border-red-400/40 text-red-300"
                              }
                            >
                              {record.latest_user_verdict.decision}
                            </Badge>
                          ) : null}
                          <V3Tooltip content="Удаляет запись и её историю проверок. Общий media asset сохраняется, пока на него ссылается другая запись.">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void remove(record)}
                              disabled={busy || Boolean(verifying)}
                            >
                              <Trash2 className="size-4 text-red-300" />
                            </Button>
                          </V3Tooltip>
                        </div>
                      </div>
                      {record.asset ? (
                        <div className="border-b border-white/10 bg-black/30 p-2">
                          {record.snapshot.modality === "image" ? (
                            <img
                              src={`/api/cross-modal/journal/${record.id}/asset`}
                              alt={record.label}
                              className="max-h-52 w-full object-contain"
                            />
                          ) : (
                            <audio
                              controls
                              preload="metadata"
                              className="w-full"
                              src={`/api/cross-modal/journal/${record.id}/asset`}
                            />
                          )}
                        </div>
                      ) : null}
                      <div className="space-y-2 p-3 text-xs">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary">
                            {record.snapshot.engine}
                          </Badge>
                          <Badge variant="secondary">
                            {record.snapshot.model.id}
                          </Badge>
                          <Badge variant="secondary">
                            {record.snapshot.parameters.length} parameters
                          </Badge>
                          <Badge variant="secondary">
                            {record.snapshot.dataset_version}
                          </Badge>
                        </div>
                        {record.query ? (
                          <div className="rounded border border-white/10 bg-black/30 p-2 text-zinc-300">
                            {record.query}
                          </div>
                        ) : null}
                        <div className="max-h-80 overflow-auto rounded border border-white/5 bg-black/20 p-2 font-mono text-[10px] text-zinc-500">
                          {record.snapshot.parameters.map((item) => (
                            <div key={item.technical_name}>
                              {item.rank}. {item.technical_name}:{" "}
                              {String(item.selected_value)} · score{" "}
                              {item.normalized_score.toFixed(3)}
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <V3Tooltip content="Создаёт обратное EN/RU-описание через chat-модель и независимо повторяет поиск V3 с тем же Top-K.">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void verify(record)}
                              disabled={Boolean(verifying)}
                            >
                              {verifying === record.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <RotateCcw className="size-4" />
                              )}
                              {verification
                                ? t("Проверить повторно")
                                : t("Проверить цикл")}
                            </Button>
                          </V3Tooltip>
                          {verifying === record.id ? (
                            <V3Tooltip content="Останавливает текущий запрос к chat-модели. Отменённая попытка останется в диагностической истории.">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void stop()}
                              >
                                <Square className="size-4" />
                                Остановить
                              </Button>
                            </V3Tooltip>
                          ) : null}
                          <V3Tooltip content="Копирует полный Clean macro этой записи.">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void copyText(
                                  `macro-${record.id}`,
                                  record.snapshot.parameters
                                    .map(
                                      (item) =>
                                        `${item.technical_name}: ${String(item.selected_value)}`,
                                    )
                                    .join("\n"),
                                )
                              }
                            >
                              <Copy className="size-4" />
                              {copyState === `macro-${record.id}`
                                ? "Скопировано"
                                : "Clean macro"}
                            </Button>
                          </V3Tooltip>
                          {verification?.reverse_query ? (
                            <V3Tooltip content="Копирует русский и английский Reverse Query.">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void copyText(
                                    `reverse-${record.id}`,
                                    `${verification.reverse_query!.query_ru}\n\n${verification.reverse_query!.query_en}`,
                                  )
                                }
                              >
                                <Copy className="size-4" />
                                {copyState === `reverse-${record.id}`
                                  ? "Скопировано"
                                  : "Reverse Query"}
                              </Button>
                            </V3Tooltip>
                          ) : null}
                          <V3Tooltip content="Ручное подтверждение сохраняется отдельно от машинного verification score и допускает запись в Bridge.">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-400/30 text-emerald-300"
                              onClick={() => void verdict(record, "approved")}
                              disabled={busy}
                            >
                              <Check className="size-4" />
                              {t("Подтвердить")}
                            </Button>
                          </V3Tooltip>
                          <V3Tooltip content="Сохраняет ручное отклонение отдельно от машинного результата.">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-400/30 text-red-300"
                              onClick={() => void verdict(record, "rejected")}
                              disabled={busy}
                            >
                              <X className="size-4" />
                              {t("Отклонить")}
                            </Button>
                          </V3Tooltip>
                        </div>
                        {verification ? (
                          <div className="space-y-2 rounded border border-cyan-400/20 bg-cyan-950/10 p-2">
                            <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
                              {verification.metrics
                                ? Object.entries(verification.metrics).map(
                                    ([key, value]) => (
                                      <div
                                        key={key}
                                        className="rounded bg-black/35 p-1"
                                      >
                                        <div className="text-[9px] text-zinc-500">
                                          {key}
                                        </div>
                                        <div className="font-mono text-cyan-200">
                                          {Number(value).toFixed(3)}
                                        </div>
                                      </div>
                                    ),
                                  )
                                : null}
                            </div>
                            {verification.reverse_query ? (
                              <details>
                                <summary className="cursor-pointer text-cyan-200">
                                  Reverse Query
                                </summary>
                                <div className="mt-1 space-y-1 text-zinc-300">
                                  <p>{verification.reverse_query.query_ru}</p>
                                  <p>{verification.reverse_query.query_en}</p>
                                  <p className="text-zinc-500">
                                    {verification.reverse_query.key_concepts.join(
                                      " · ",
                                    )}
                                  </p>
                                </div>
                              </details>
                            ) : null}
                            {verification.error ? (
                              <div className="text-red-300">
                                {verification.error}
                              </div>
                            ) : null}
                            <details>
                              <summary className="cursor-pointer text-zinc-400">
                                Raw LLM output
                              </summary>
                              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-zinc-500">
                                {verification.raw_response || "(empty)"}
                              </pre>
                            </details>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
