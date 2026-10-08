"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Atom, BookOpenText, Database, FileCheck2, FlaskConical, GitCompareArrows, PackageCheck, Play, RotateCcw, ShieldCheck, Sparkles, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PreviewCandidate {
  technical_name: string;
  parent_parameters: string[];
  structural_score: number;
  atom_semantic_score: number;
  query_similarity: number;
  selection_score: number;
  value_inference: {
    status: "auto_resolved" | "needs_review";
    confidence: number;
    quantity_kind: string;
    ui_element: string;
    unit: string;
    min_value?: number;
    max_value?: number;
    step?: number;
    default?: number | string;
    options?: string[];
    donor_parameters: string[];
    explanation: string[];
  };
}

interface PreviewResponse {
  mode: string;
  dataset_version: string;
  embedding_model: string;
  query: string;
  source_count: number;
  known_source_count: number;
  token_count: number;
  tokens: Array<{ token: string; frequency: number; roles: string[]; semantic_score?: number }>;
  ranked_atoms: Array<{ atom: string; role: string; similarity: number }>;
  generated_before_bge_rerank: number;
  auto_resolved_value_count: number;
  candidates: PreviewCandidate[];
  error?: string;
}

interface CollectionInspection {
  collection_protocol: string | null;
  batch_index: number | null;
  raw_sha256: string;
  parameters: Array<Record<string, unknown>>;
  valid_count: number;
  reference_overlap_count: number;
  errors: string[];
  warnings: string[];
  acceptable_for_import: boolean;
}

interface CollectionStats {
  available: boolean;
  batches_found: number;
  valid_batches: number;
  raw_occurrences: number;
  accepted_occurrences: number;
  rejected_occurrences: number;
  unique_exact_names: number;
  duplicate_occurrences: number;
  eligible_records: number | null;
  excluded_records: number | null;
  atom_count: number | null;
  semantic_candidate_pairs: number | null;
  semantic_model: string | null;
  auto_decision_counts: { same?: number; related?: number; distinct?: number } | null;
  semantic_group_count: number | null;
  semantic_draft_record_count: number | null;
  semantic_policy_version: string | null;
  frozen_version_id: string | null;
  frozen_content_sha256: string | null;
  frozen_publish_status: string | null;
  runtime_index_ready: boolean;
  runtime_index_atom_count: number | null;
  runtime_index_model: string | null;
  library_parameter_count: number | null;
  library_published_package_count: number;
  pipeline_last_run: PipelineRun | null;
  invalid_batch_details?: InvalidBatchDetail[];
}

interface SemanticPair {
  left: string;
  right: string;
  cosine_similarity: number;
  token_jaccard: number;
  same_unit_normalized: boolean;
  review_status: string;
  decision: "same" | "related" | "distinct" | null;
  auto_decision: "same" | "related" | "distinct" | null;
  auto_confidence: number | null;
  auto_reasons: string[] | null;
  effective_decision: "same" | "related" | "distinct" | null;
  decision_source: "auto" | "manual";
}

interface SemanticReview {
  available: boolean;
  total: number;
  decided: number;
  pairs: SemanticPair[];
}

interface CandidatePackage {
  package_id: string;
  created: boolean;
  package_path: string;
  publish_status: string;
  writes_to_v2: boolean;
  summary: {
    candidate_count: number;
    publishable_count: number;
    needs_review_count: number;
    stop_list_conflict_count: number;
    schema_error_count: number;
  };
}

interface PublishResult {
  package_id: string;
  dry_run: boolean;
  published: boolean;
  already_published: boolean;
  writes_to_library: boolean;
  writes_to_v2: boolean;
  library_before_count: number;
  proposed_addition_count: number;
  simulated_after_count: number;
  collisions: string[];
  schema_errors: string[];
  ready_for_library_publish: boolean;
  export_dir: string;
}

interface PipelineRun {
  status: "completed" | "failed" | "stopped";
  started_at: string;
  finished_at: string;
  inbox_files: string[];
  version_before: string | null;
  version_after: string | null;
  new_version_created: boolean;
  steps: Array<{ script: string; exit_code: number; stderr: string }>;
  error?: string;
}

interface PipelineJob {
  running: boolean;
  pid: number | null;
  exitCode: number | null;
  stopRequested: boolean;
  lastError: string | null;
  logTail: string[];
  progress: { step: string | null; current: number; total: number };
}

interface InvalidBatchDetail {
  batch_id: string;
  source_file: string;
  source_label: string;
  parameter_count: number;
  errors: string[];
  invalid_parameters: Array<{
    parameter_index: number;
    technical_name: string | null;
    errors: string[];
  }>;
}

export function CombinatorialGenesisPage() {
  const [macro, setMacro] = useState("");
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState("0");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rawResponse, setRawResponse] = useState("");
  const [inspection, setInspection] = useState<CollectionInspection | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [collectionStats, setCollectionStats] = useState<CollectionStats | null>(null);
  const [semanticReview, setSemanticReview] = useState<SemanticReview | null>(null);
  const [savingPair, setSavingPair] = useState<string | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [candidatePackage, setCandidatePackage] = useState<CandidatePackage | null>(null);
  const [savingPackage, setSavingPackage] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [runningPublish, setRunningPublish] = useState<"dry-run" | "publish" | null>(null);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [pipelineJob, setPipelineJob] = useState<PipelineJob | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/combinatorial-genesis/collections/stats", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/combinatorial-genesis/semantic-review?limit=12", { cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([stats, review]: [CollectionStats, SemanticReview]) => {
        setCollectionStats(stats);
        setSemanticReview(review);
        setPipelineRun(stats.pipeline_last_run);
      })
      .catch(() => {
        setCollectionStats(null);
        setSemanticReview(null);
      });
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const refresh = async () => {
      try {
        const response = await fetch("/api/combinatorial-genesis/pipeline", { cache: "no-store" });
        const payload = await response.json() as { job: PipelineJob; report: PipelineRun | null };
        if (disposed) return;
        setPipelineJob(payload.job);
        if (payload.report) setPipelineRun(payload.report);
        if (!payload.job.running && timer) {
          clearInterval(timer);
          timer = null;
          const stats = await fetch("/api/combinatorial-genesis/collections/stats", { cache: "no-store" }).then(
            (statsResponse) => statsResponse.json() as Promise<CollectionStats>,
          );
          if (!disposed) setCollectionStats(stats);
        }
      } catch (caught) {
        if (!disposed) setPipelineError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void refresh().then(() => {
      if (!disposed && pipelineJob?.running && !timer) timer = setInterval(() => void refresh(), 1500);
    });
    if (pipelineJob?.running && !timer) timer = setInterval(() => void refresh(), 1500);
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
    };
  }, [pipelineJob?.running]);

  const saveSemanticDecision = async (
    pair: SemanticPair,
    decision: "same" | "related" | "distinct",
  ) => {
    const key = `${pair.left}:${pair.right}`;
    setSavingPair(key);
    setSemanticError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/semantic-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left: pair.left, right: pair.right, decision }),
      });
      const payload = await response.json() as { error?: string; decided?: number };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setSemanticReview((current) => current ? {
        ...current,
        decided: payload.decided ?? current.decided,
        pairs: current.pairs.map((item) => item.left === pair.left && item.right === pair.right
          ? { ...item, decision, effective_decision: decision, decision_source: "manual" }
          : item),
      } : current);
    } catch (caught) {
      setSemanticError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingPair(null);
    }
  };

  const inspectResponse = async () => {
    setInspecting(true);
    setInspectionError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/collections/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_response: rawResponse }),
      });
      const payload = (await response.json()) as CollectionInspection & { error?: string };
      if (!response.ok && !Array.isArray(payload.errors)) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setInspection(payload);
    } catch (caught) {
      setInspection(null);
      setInspectionError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setInspecting(false);
    }
  };

  const buildPreview = async () => {
    setLoading(true);
    setError(null);
    setCandidatePackage(null);
    setPublishResult(null);
    setPackageError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macro, query, seed: Number(seed) || 0, limit: 30 }),
      });
      const payload = (await response.json()) as PreviewResponse;
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setPreview(payload);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  const runPublish = async (dryRun: boolean) => {
    if (!candidatePackage) return;
    setRunningPublish(dryRun ? "dry-run" : "publish");
    setPackageError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: candidatePackage.package_id, dry_run: dryRun }),
      });
      const payload = await response.json() as PublishResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setPublishResult(payload);
      if (!dryRun) {
        const stats = await fetch("/api/combinatorial-genesis/collections/stats", { cache: "no-store" }).then(
          (statsResponse) => statsResponse.json() as Promise<CollectionStats>,
        );
        setCollectionStats(stats);
      }
    } catch (caught) {
      setPackageError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunningPublish(null);
    }
  };

  const runInboxPipeline = async () => {
    setPipelineError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json() as { job: PipelineJob; reason?: string };
      if (!response.ok) throw new Error(payload.reason ?? `Pipeline failed: HTTP ${response.status}`);
      setPipelineJob(payload.job);
    } catch (caught) {
      setPipelineError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const stopInboxPipeline = async () => {
    setPipelineError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/pipeline", { method: "DELETE" });
      const payload = await response.json() as { job: PipelineJob; reason?: string };
      if (!response.ok) throw new Error(payload.reason ?? `Stop failed: HTTP ${response.status}`);
      setPipelineJob(payload.job);
    } catch (caught) {
      setPipelineError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const restartInboxPipeline = async () => {
    setPipelineError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restart: true }),
      });
      const payload = await response.json() as { job: PipelineJob; reason?: string };
      if (!response.ok) throw new Error(payload.reason ?? `Restart failed: HTTP ${response.status}`);
      setPipelineJob(payload.job);
    } catch (caught) {
      setPipelineError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const showCollectionPrompt = async () => {
    setPromptOpen(true);
    if (promptText) return;
    setPromptError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/prompt", { cache: "no-store" });
      const payload = await response.json() as { content?: string; error?: string };
      if (!response.ok || !payload.content) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setPromptText(payload.content);
    } catch (caught) {
      setPromptError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const saveCandidatePackage = async () => {
    if (!preview) return;
    setSavingPackage(true);
    setPackageError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_version: preview.dataset_version,
          embedding_model: preview.embedding_model,
          query: preview.query,
          macro,
          seed: Number(seed) || 0,
          candidates: preview.candidates,
        }),
      });
      const payload = await response.json() as CandidatePackage & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setCandidatePackage(payload);
    } catch (caught) {
      setPackageError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingPackage(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-black/90 p-4">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <header className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Atom className="size-5 text-fuchsia-300" />
                <h1 className="font-mono text-lg font-semibold text-white">Combinatorial Genesis Engine</h1>
              </div>
              <p className="max-w-3xl text-sm text-zinc-400">
                Автономная лаборатория для сбора данных, атомизации параметров, построения новых
                комбинаций и сохранения проверенных результатов в собственную базу.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline"><ShieldCheck className="mr-1 size-3" />V2 isolated</Badge>
              <Badge variant="outline"><Database className="mr-1 size-3" />library: {collectionStats?.library_parameter_count ?? "—"}</Badge>
              <Badge variant="outline">published: {collectionStats?.library_published_package_count ?? 0}</Badge>
              <Badge variant="outline">frozen runtime + BGE</Badge>
              {collectionStats?.runtime_index_ready ? (
                <Badge variant="outline">atom index: {collectionStats.runtime_index_atom_count}</Badge>
              ) : null}
            </div>
          </div>
        </header>

        <section className="space-y-3 rounded-lg border border-emerald-400/20 bg-emerald-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-4 text-emerald-300" />
                <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-white">Dataset Lab · response inspector</h2>
              </div>
              <p className="mt-1 max-w-4xl text-xs text-zinc-400">
                Используйте один и тот же запрос во всех аккаунтах. {" "}
                <button
                  type="button"
                  className="font-mono text-emerald-300 underline decoration-dotted underline-offset-2 hover:text-emerald-200"
                  onClick={() => void showCollectionPrompt()}
                >
                  Открыть FLOWMUSIC_COLLECTION_PROMPT_V1.md
                </button>
                . {" "}
                Прикреплять датасет из 2733 параметров не нужно. Вставьте сюда полный JSON-ответ Flowmusic;
                проверка пока ничего не сохраняет.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">inspect only</Badge>
              {collectionStats?.available ? (
                <>
                  <Badge variant="secondary">batches: {collectionStats.valid_batches}/{collectionStats.batches_found}</Badge>
                  <Badge variant="secondary">raw: {collectionStats.raw_occurrences}</Badge>
                  <Badge variant="secondary">accepted: {collectionStats.accepted_occurrences}</Badge>
                  <Badge variant="secondary">quarantine: {collectionStats.rejected_occurrences}</Badge>
                  <Badge variant="secondary">exact unique: {collectionStats.unique_exact_names}</Badge>
                  <Badge variant="secondary">eligible: {collectionStats.eligible_records ?? "—"}</Badge>
                  <Badge variant="secondary">atoms: {collectionStats.atom_count ?? "—"}</Badge>
                </>
              ) : null}
            </div>
          </div>
          <div className="rounded border border-emerald-400/20 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-emerald-100">flowmusic-inbox → frozen dataset → BGE index</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Добавьте .txt/.md в data/combinatorial-genesis/flowmusic-inbox и запустите все этапы одной кнопкой.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void runInboxPipeline()} disabled={Boolean(pipelineJob?.running)}>
                <Play className="size-4" />
                {pipelineJob?.running ? "Обработка данных..." : "Обработать inbox"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void stopInboxPipeline()} disabled={!pipelineJob?.running}>
                <Square className="size-4" />
                Остановить
              </Button>
              <Button type="button" variant="outline" onClick={() => void restartInboxPipeline()}>
                <RotateCcw className="size-4" />
                Перезапустить
              </Button>
              </div>
            </div>
            {pipelineJob?.running ? (
              <div className="mt-2 text-xs text-cyan-200">
                Этап {pipelineJob.progress.current || "—"}/{pipelineJob.progress.total || "—"}: {pipelineJob.progress.step ?? "запуск"}
                {pipelineJob.pid ? ` · PID ${pipelineJob.pid}` : ""}
              </div>
            ) : null}
            {pipelineError ? <div className="mt-2 text-xs text-red-300">{pipelineError}</div> : null}
            {pipelineJob?.lastError && !pipelineJob.stopRequested ? <div className="mt-2 text-xs text-red-300">{pipelineJob.lastError}</div> : null}
            {pipelineJob?.logTail.length ? (
              <pre className="mt-2 max-h-32 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-[10px] text-zinc-400">
                {pipelineJob.logTail.join("\n")}
              </pre>
            ) : null}
            {pipelineRun ? (
              <div className={`mt-2 text-xs ${pipelineRun.status === "completed" ? "text-emerald-300" : "text-amber-300"}`}>
                {pipelineRun.status} · файлов: {pipelineRun.inbox_files.length} · версия: {pipelineRun.version_after ?? "—"}
                {pipelineRun.new_version_created ? " · создана новая версия" : " · данные не изменились"}
              </div>
            ) : null}
            {collectionStats?.invalid_batch_details?.length ? (
              <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded border border-amber-400/20 bg-amber-950/10 p-3 text-xs">
                <div className="font-medium text-amber-200">Причины карантина</div>
                {collectionStats.invalid_batch_details.map((batch) => (
                  <div key={batch.batch_id} className="rounded border border-white/10 bg-black/30 p-2">
                    <div className="font-mono text-zinc-300">{batch.source_file.split(/[\\/]/).pop()} · {batch.batch_id} · {batch.parameter_count} параметров</div>
                    {batch.invalid_parameters.map((parameter) => (
                      <div key={`${batch.batch_id}-${parameter.parameter_index}`} className="mt-1 text-amber-100">
                        [{parameter.parameter_index}] {parameter.technical_name ?? "без technical_name"}: {parameter.errors.join("; ")}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <Textarea
            value={rawResponse}
            onChange={(event) => setRawResponse(event.target.value)}
            rows={10}
            className="min-h-56 border-white/15 bg-black/60 font-mono text-xs"
            placeholder="Paste the complete Flowmusic JSON response..."
          />
          <Button variant="outline" onClick={() => void inspectResponse()} disabled={inspecting || !rawResponse.trim()}>
            <FileCheck2 className="size-4" />
            {inspecting ? "Inspecting..." : "Inspect response"}
          </Button>
          {inspectionError ? <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">{inspectionError}</div> : null}
          {inspection ? (
            <div className={`rounded border p-3 ${inspection.acceptable_for_import ? "border-emerald-400/30 bg-emerald-950/20" : "border-amber-400/30 bg-amber-950/20"}`}>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">batch: {inspection.batch_index ?? "invalid"}</Badge>
                <Badge variant="secondary">parameters: {inspection.parameters.length}</Badge>
                <Badge variant="secondary">valid: {inspection.valid_count}</Badge>
                <Badge variant="secondary">reference overlaps: {inspection.reference_overlap_count}</Badge>
                <Badge variant={inspection.acceptable_for_import ? "default" : "outline"}>
                  {inspection.acceptable_for_import ? "ready for import" : "correction required"}
                </Badge>
              </div>
              {inspection.errors.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs text-amber-200">
                  {inspection.errors.map((message, index) => (
                    <div key={`${index}-${message}`} className="flex gap-2"><AlertCircle className="mt-0.5 size-3 shrink-0" /><span>{message}</span></div>
                  ))}
                </div>
              ) : null}
              {inspection.warnings.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs text-cyan-200">
                  {inspection.warnings.map((message, index) => (
                    <div key={`${index}-${message}`}>{message}</div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 break-all font-mono text-[10px] text-zinc-500">sha256: {inspection.raw_sha256}</div>
            </div>
          ) : null}
        </section>

        {semanticReview?.available ? (
          <section className="space-y-3 rounded-lg border border-cyan-400/20 bg-cyan-950/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <GitCompareArrows className="size-4 text-cyan-300" />
                  <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-white">BGE semantic review</h2>
                </div>
                <p className="mt-1 max-w-4xl text-xs text-zinc-400">
                  Алгоритм сам классифицирует пары как same, related или distinct. Ручные кнопки оставлены
                  только как необязательный override; исходный корпус не изменяется.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">model: {collectionStats?.semantic_model ?? "bge-m3"}</Badge>
                <Badge variant="secondary">review pairs: {semanticReview.total}</Badge>
                <Badge variant="secondary">same: {collectionStats?.auto_decision_counts?.same ?? "—"}</Badge>
                <Badge variant="secondary">related: {collectionStats?.auto_decision_counts?.related ?? "—"}</Badge>
                <Badge variant="secondary">groups: {collectionStats?.semantic_group_count ?? "—"}</Badge>
                <Badge variant="secondary">draft: {collectionStats?.semantic_draft_record_count ?? "—"}</Badge>
                <Badge variant="secondary">version: {collectionStats?.frozen_version_id ?? "not frozen"}</Badge>
                <Badge variant="secondary">manual overrides: {semanticReview.decided}</Badge>
                <Badge variant="secondary">auto-merge: off</Badge>
              </div>
            </div>
            {semanticError ? <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">{semanticError}</div> : null}
            <div className="grid gap-2 xl:grid-cols-2">
              {semanticReview.pairs.map((pair) => (
                <article key={`${pair.left}:${pair.right}`} className="rounded border border-cyan-400/15 bg-black/40 p-3">
                  <div className="space-y-1 font-mono text-[11px] text-cyan-100">
                    <div className="break-all">{pair.left}</div>
                    <div className="break-all text-cyan-200/70">↔ {pair.right}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
                    <span>cosine {pair.cosine_similarity.toFixed(4)}</span>
                    <span>· lexical {pair.token_jaccard.toFixed(4)}</span>
                    <span>· unit {pair.same_unit_normalized ? "same" : "different"}</span>
                    <span>· decision {pair.effective_decision ?? pair.review_status}</span>
                    <span>· source {pair.decision_source}</span>
                    {pair.auto_confidence !== null ? <span>· confidence {pair.auto_confidence.toFixed(4)}</span> : null}
                  </div>
                  {pair.auto_reasons?.length ? (
                    <details className="mt-2 text-[10px] text-zinc-500">
                      <summary className="cursor-pointer">Why this classification</summary>
                      <ul className="mt-1 space-y-0.5 pl-4">
                        {pair.auto_reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    </details>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["same", "related", "distinct"] as const).map((decision) => (
                      <Button
                        key={decision}
                        type="button"
                        variant={pair.effective_decision === decision ? "default" : "outline"}
                        className="h-7 px-2 text-[10px]"
                        disabled={savingPair === `${pair.left}:${pair.right}`}
                        onClick={() => void saveSemanticDecision(pair, decision)}
                      >
                        {decision}{pair.decision === decision ? " · override" : ""}
                      </Button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3 rounded-lg border border-white/15 bg-white/[0.03] p-4">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-white">Structural preview</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Вставьте macro: по одному technical_name или строке name: value. Источники ищутся в автономной базе.
              </p>
            </div>
            <Textarea
              value={macro}
              onChange={(event) => setMacro(event.target.value)}
              rows={12}
              className="min-h-64 border-white/15 bg-black/60 font-mono text-xs"
              placeholder={"viscous_sub_bass_hydrodynamic_shear_strain_rate_sec: 145\ninfrasonic_shockwave_refraction_index_ratio: 1.45\nglottal_pulse_subharmonic_cascade_depth: 0.25"}
            />
            <label className="block space-y-1 text-xs text-zinc-400">
              <span>Intent/query for bge-m3 (optional; macro names are used when empty)</span>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="bg-black/60"
                placeholder="Например: вязкая инфразвуковая текстура с нестабильной спектральной плотностью"
              />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-xs text-zinc-400">
                <span>Deterministic seed</span>
                <Input value={seed} onChange={(event) => setSeed(event.target.value)} className="w-36 bg-black/60 font-mono" />
              </label>
              <Button onClick={() => void buildPreview()} disabled={loading || !macro.trim()}>
                <Sparkles className="size-4" />
                {loading ? "Building..." : "Build preview"}
              </Button>
            </div>
            {error ? <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">{error}</div> : null}
          </div>

          <aside className="space-y-3 rounded-lg border border-white/15 bg-white/[0.03] p-4">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-white">Safety boundary</h2>
            <div className="space-y-2 text-xs text-zinc-400">
              <p>1. Стартовые 2733 параметра скопированы в автономную библиотеку CG.</p>
              <p>2. Генерация, проверка дублей и значения больше не читают файлы V2.</p>
              <p>3. Frozen atom index и bge-m3 ранжируют атомы и готовые кандидаты.</p>
              <p>4. Flowmusic Genesis V2 и его retrieval index не изменяются.</p>
              <p>5. Публикация добавляет только auto-resolved кандидаты в собственную базу CG с резервной копией.</p>
            </div>
          </aside>
        </section>

        {preview ? (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">sources: {preview.source_count}</Badge>
              <Badge variant="secondary">known: {preview.known_source_count}</Badge>
              <Badge variant="secondary">tokens: {preview.token_count}</Badge>
              <Badge variant="secondary">version: {preview.dataset_version}</Badge>
              <Badge variant="secondary">model: {preview.embedding_model}</Badge>
              <Badge variant="secondary">pre-rerank: {preview.generated_before_bge_rerank}</Badge>
              <Badge variant="secondary">candidates: {preview.candidates.length}</Badge>
              <Badge variant="secondary">values resolved: {preview.auto_resolved_value_count}/{preview.candidates.length}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void saveCandidatePackage()} disabled={savingPackage}>
                <PackageCheck className="size-4" />
                {savingPackage ? "Saving dry-run..." : "Save experimental package"}
              </Button>
              <span className="text-xs text-zinc-500">Сохраняет неизменяемый draft; V2 не изменяется.</span>
            </div>
            {packageError ? <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">{packageError}</div> : null}
            {candidatePackage ? (
              <div className="rounded border border-emerald-400/30 bg-emerald-950/20 p-3 text-xs text-emerald-100">
                <div className="font-mono">{candidatePackage.package_id} · {candidatePackage.created ? "created" : "reused"}</div>
                <div className="mt-1">publishable: {candidatePackage.summary.publishable_count}/{candidatePackage.summary.candidate_count} · needs review: {candidatePackage.summary.needs_review_count} · V2 writes: {String(candidatePackage.writes_to_v2)}</div>
                <div className="mt-1 break-all text-emerald-200/60">{candidatePackage.package_path}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void runPublish(true)} disabled={runningPublish !== null}>
                    <ShieldCheck className="size-4" />
                    {runningPublish === "dry-run" ? "Проверка..." : "Проверить публикацию"}
                  </Button>
                  <Button type="button" onClick={() => void runPublish(false)} disabled={runningPublish !== null}>
                    <Database className="size-4" />
                    {runningPublish === "publish" ? "Сохранение..." : "Добавить готовые в базу CG"}
                  </Button>
                </div>
              </div>
            ) : null}
            {publishResult ? (
              <div className={`rounded border p-3 text-xs ${publishResult.ready_for_library_publish ? "border-cyan-400/30 bg-cyan-950/20 text-cyan-100" : "border-amber-400/30 bg-amber-950/20 text-amber-100"}`}>
                <div className="font-mono">
                  {publishResult.already_published ? "already published" : publishResult.published ? "published" : "dry-run"}
                  {" · "}{publishResult.ready_for_library_publish ? "ready" : "blocked"}
                </div>
                <div className="mt-1">CG library: {publishResult.library_before_count} → {publishResult.simulated_after_count} · additions {publishResult.proposed_addition_count}</div>
                <div>collisions: {publishResult.collisions.length} · schema errors: {publishResult.schema_errors.length} · writes to library: {String(publishResult.writes_to_library)} · writes to V2: {String(publishResult.writes_to_v2)}</div>
                <div className="mt-1 break-all opacity-60">{publishResult.export_dir}</div>
              </div>
            ) : null}
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-950/10 p-3">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-wide text-emerald-200">BGE-ranked frozen atoms</h3>
              <div className="flex flex-wrap gap-1.5">
                {preview.ranked_atoms.slice(0, 30).map((atom) => (
                  <span key={atom.atom} className="rounded border border-emerald-400/20 bg-black/40 px-2 py-1 font-mono text-[11px] text-emerald-100">
                    {atom.atom} · {atom.role} · {atom.similarity.toFixed(4)}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-950/10 p-3">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-wide text-cyan-200">Atomic token pool</h3>
              <div className="flex flex-wrap gap-1.5">
                {preview.tokens.map((token) => (
                  <span key={token.token} className="rounded border border-cyan-400/20 bg-black/40 px-2 py-1 font-mono text-[11px] text-cyan-100">
                    {token.token} · {token.roles.join("/")} · {token.semantic_score?.toFixed(3) ?? "local"}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {preview.candidates.map((candidate) => (
                <article key={candidate.technical_name} className="rounded-lg border border-fuchsia-400/20 bg-black/50 p-3">
                  <div className="mb-2 flex items-start gap-2">
                    <FlaskConical className="mt-0.5 size-4 shrink-0 text-fuchsia-300" />
                    <code className="break-all text-sm text-fuchsia-100">{candidate.technical_name}</code>
                  </div>
                  <div className="text-[11px] text-zinc-500">structural score: {candidate.structural_score}</div>
                  <div className="text-[11px] text-zinc-500">selection: {candidate.selection_score.toFixed(4)} · bge query: {candidate.query_similarity.toFixed(4)} · atom affinity: {candidate.atom_semantic_score.toFixed(4)}</div>
                  <div className="mt-2 rounded border border-white/10 bg-white/[0.03] p-2 text-[11px] text-zinc-400">
                    <div className="flex flex-wrap gap-2">
                      <span>{candidate.value_inference.status}</span>
                      <span>confidence {candidate.value_inference.confidence.toFixed(3)}</span>
                      <span>{candidate.value_inference.quantity_kind}</span>
                      <span>{candidate.value_inference.ui_element}</span>
                      <span>{candidate.value_inference.unit}</span>
                    </div>
                    {candidate.value_inference.ui_element === "Range" && candidate.value_inference.min_value !== undefined ? (
                      <div className="mt-1 font-mono">
                        {candidate.value_inference.min_value} … {candidate.value_inference.default} … {candidate.value_inference.max_value} · step {candidate.value_inference.step}
                      </div>
                    ) : null}
                  </div>
                  <details className="mt-2 text-xs text-zinc-400">
                    <summary className="cursor-pointer">Parent provenance</summary>
                    <ul className="mt-2 space-y-1 pl-4">
                      {candidate.parent_parameters.map((parent) => <li key={parent} className="break-all">{parent}</li>)}
                    </ul>
                  </details>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] border-emerald-400/30 bg-zinc-950 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-emerald-100">
              <BookOpenText className="size-5" />
              FLOWMUSIC_COLLECTION_PROMPT_V1.md
            </DialogTitle>
            <DialogDescription>
              Этот текст можно копировать в каждый аккаунт Flowmusic без поиска файла на диске.
            </DialogDescription>
          </DialogHeader>
          {promptError ? (
            <div className="text-sm text-red-300">{promptError}</div>
          ) : (
            <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/60 p-4 font-mono text-xs leading-relaxed text-zinc-200">
              {promptText || "Загрузка..."}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
