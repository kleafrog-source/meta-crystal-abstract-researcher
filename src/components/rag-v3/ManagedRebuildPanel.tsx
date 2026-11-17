"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Loader2, RefreshCw, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { ArtifactKind, ArtifactStatus, ManagedJob, ManagedStage, QwenCandidateArtifactKind, RebuildKind } from "@/lib/rag-v3/managed-rebuild";
import { GEMMA_ARTIFACT_DIRECTORIES, gemmaCandidateRowsReadyForFinalize, type GemmaCandidateArtifactKind } from "@/lib/rag-v3/gemma-bundle";
import { useUiLanguage, useUiText } from "@/lib/ui-i18n";
import { useCapabilityEnabled } from "@/hooks/use-capability-registry";
import { V3InfoTip, V3Tooltip } from "./V3Tooltip";

interface RebuildAudit {
  artifacts: ArtifactStatus[];
  banks: Array<{ mode_id: string; input: string; encoder: string; value_policy: string; status: string; dependencies: string[]; reason?: string; value_domain_gaps?: Array<{ technical_name: string; ui_element: string }> }>;
  active_model: string;
  active_endpoint?: string;
  registry_sha256: string;
  active_parameters: number;
  active_version: string;
  source_snapshot_sha256: string;
  effective_catalogue_revision: string;
  tombstoned_live_count: number;
  excluded_live_count: number;
  active_corpus_ready: boolean;
  active_corpus_block_reason: string | null;
  corpus_candidates: Array<{
    version_id?: string;
    candidate_id?: string;
    candidate_path?: string;
    status?: string;
    prepare_status?: string;
    vectorization_status?: string;
    finalization_status?: string;
    qwen_bundle_status?: string;
    qwen_bundle_path?: string;
    runtime_atom_index_path?: string;
    source_revision?: string;
    source_snapshot_sha256?: string;
    source_record_count?: number;
    endpoint?: string;
    previous_active_version?: string | null;
    model?: string;
    runtime_atom_count?: number;
    runtime_atom_reused_count?: number | null;
    runtime_atom_embedded_count?: number | null;
    artifact_builds?: Record<string, string>;
    gemma_artifact_builds?: Record<string, string>;
    gemma_model?: string;
    gemma_endpoint?: string;
    gemma_bundle_status?: string;
    gemma_finalization_status?: string;
    gemma_connection_status?: string;
    gemma_bundle_path?: string;
    prepared_inputs?: string[];
    prepared_inputs_valid?: boolean;
  }>;
}

interface BuildPreflight {
  checked_at: string;
  source: { kind: string; revision: string; content_sha256: string; parameter_count: number; tombstoned_live_count: number; excluded_live_count: number; excluded_sha256: string };
  model: { endpoint: string; model: string; local_endpoint: boolean; installed: boolean; check_error: string | null };
  output_directory: string;
  output_writable: boolean;
  builder_dependencies: { ready: boolean; missing: string[] };
  available_memory_bytes: number;
  minimum_memory_bytes: number;
  active_corpus_current: boolean;
  active_corpus_version: string;
  legacy_routes: string;
  qwen_candidate: null | { version_id?: string; status?: string; bundle_status?: string; source_revision?: string; source_snapshot_sha256?: string; model?: string };
  can_build_candidate: boolean;
  can_prepare_candidate: boolean;
  can_vectorize_candidate: boolean;
  can_finalize_candidate: boolean;
  candidate_blockers: string[];
  dependent_indexes_build_with_candidate: boolean;
  can_build_dependent_indexes: boolean;
  dependent_index_reason: string | null;
  can_activate: boolean;
  activation_reason: string;
}

interface JobSnapshot {
  running: boolean;
  kind: RebuildKind | null;
  stage: ManagedStage | null;
  started_at: number;
  finished_at: number;
  exit_code: number | null;
  stop_requested: boolean;
  safe_to_stop: boolean;
  source_revision: string | null;
  source_snapshot_path?: string | null;
  source_snapshot_sha256?: string | null;
  excluded_sha256?: string | null;
  excluded_count?: number;
  candidate_version: string | null;
  last_error: string | null;
  log_tail: string[];
}

async function responseJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Service Bay returned HTTP ${response.status} without JSON${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json() as T & { error?: string; reason?: string };
  if (!response.ok) throw new Error(payload.error ?? payload.reason ?? `HTTP ${response.status}`);
  return payload;
}

function preparedInputLabel(file: string, disposition: string, t: (source: string) => string): string {
  const sourcePackage = file.match(/^frozen\/([^/]+)\/(manifest|parameters|atoms)\.json$/);
  if (sourcePackage) return `${t("Pinned current-source package")} ${sourcePackage[1]} · ${sourcePackage[2]}.json (${t(disposition)})`;
  const canonicalPath = file.replace(/^artifacts\/qwen\//, "artifacts/qwen3/")
    .replace(/^prepared\/qwen\//, "prepared/qwen3/")
    .replace(/^artifacts\/gemma\//, "artifacts/embeddinggemma2/");
  return `${canonicalPath} (${t(disposition)})`;
}

export function candidateArtifactOutputLabel(kind: ArtifactKind): string {
  if (kind === "clap" || kind === "siglip") return "separate runtime index";
  if (kind === "embeddinggemma2_text" || kind.startsWith("gemma2_")) {
    return `artifacts/embeddinggemma2/${GEMMA_ARTIFACT_DIRECTORIES[kind as GemmaCandidateArtifactKind]}`;
  }
  const directory = kind === "composite" ? "composite-index" : kind === "atoms" ? "runtime-atoms"
    : kind === "anchors" ? "anchors" : kind === "relations" ? "relations" : "value-anchors";
  return `artifacts/qwen3/${directory}`;
}

const emptyJob: JobSnapshot = { running: false, kind: null, stage: null, started_at: 0, finished_at: 0, exit_code: null, stop_requested: false, safe_to_stop: false, source_revision: null, candidate_version: null, last_error: null, log_tail: [] };

export function ManagedRebuildPanel() {
  const t = useUiText();
  const reasonText = (source: string) => {
    const missingInputPrefix = "required builder input is missing: ";
    if (source.startsWith(missingInputPrefix)) return `${t("Missing builder input")}: ${source.slice(missingInputPrefix.length)}`;
    return t(source);
  };
  const language = useUiLanguage();
  const tf = (source: string, values: Record<string, string>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), t(source));
  const qwenEnabled = useCapabilityEnabled("text.qwen.resolved");
  const gemmaEnabled = useCapabilityEnabled("text.gemma.awtd");
  const clapEnabled = useCapabilityEnabled("audio.clap.resolved");
  const siglipEnabled = useCapabilityEnabled("spec.siglip.resolved");
  const [audit, setAudit] = useState<RebuildAudit | null>(null);
  const [preflight, setPreflight] = useState<BuildPreflight | null>(null);
  const [job, setJob] = useState<JobSnapshot>(emptyJob);
  const [externalJobs, setExternalJobs] = useState({ clap: "idle", siglip: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [operationStarted, setOperationStarted] = useState(false);
  const [confirmation, setConfirmation] = useState<{ action: string; row: string; model: boolean; onConfirm: () => Promise<void> } | null>(null);
  const wasRunning = useRef(false);

  const requestConfirmation = (details: { action: string; row: string; model: boolean; onConfirm: () => Promise<void> }) => {
    if (!loading && !job.running && !operationStarted) setConfirmation(details);
  };

  const confirmAction = async () => {
    const pending = confirmation;
    if (!pending || operationStarted) return;
    setOperationStarted(true);
    setConfirmation(null);
    try { await pending.onConfirm(); }
    finally { setOperationStarted(false); }
  };

  const refreshAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "audit" }), cache: "no-store" });
      const payload = await responseJson<RebuildAudit & { job: JobSnapshot }>(response);
      setAudit(payload);
      setJob(payload.job);
      const [clapResponse, siglipResponse] = await Promise.all([
        fetch("/api/audio/index?view=job", { cache: "no-store" }),
        fetch("/api/morpho/status?view=job", { cache: "no-store" }),
      ]);
      const [clapJob, siglipJob] = await Promise.all([
        responseJson<{ job?: { status?: string } | null }>(clapResponse),
        responseJson<{ job?: { running?: boolean } | null }>(siglipResponse),
      ]);
      setExternalJobs({
        clap: clapJob.job?.status === "running" ? "running" : clapJob.job?.status === "failed" ? "error" : clapJob.job ? "complete" : "idle",
        siglip: siglipJob.job?.running ? "running" : "idle",
      });
      wasRunning.current = payload.job.running;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPreflight = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await responseJson<BuildPreflight>(await fetch("/api/rag-v3/rebuild?view=preflight", { cache: "no-store" }));
      setPreflight(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoading(false); }
  }, []);

  const refreshJob = useCallback(async () => {
    const response = await fetch("/api/rag-v3/rebuild?view=job", { cache: "no-store" });
    const payload = await responseJson<{ job: JobSnapshot }>(response);
    setJob(payload.job);
    const [clapResponse, siglipResponse] = await Promise.all([
      fetch("/api/audio/index?view=job", { cache: "no-store" }),
      fetch("/api/morpho/status?view=job", { cache: "no-store" }),
    ]);
    const [clapJob, siglipJob] = await Promise.all([
      responseJson<{ job?: { status?: string } | null }>(clapResponse),
      responseJson<{ job?: { running?: boolean } | null }>(siglipResponse),
    ]);
    setExternalJobs({
      clap: clapJob.job?.status === "running" ? "running" : clapJob.job?.status === "failed" ? "error" : clapJob.job ? "complete" : "idle",
      siglip: siglipJob.job?.running ? "running" : "idle",
    });
    if (wasRunning.current && !payload.job.running) {
      wasRunning.current = false;
      await refreshAudit();
      await refreshPreflight();
      return;
    }
    wasRunning.current = payload.job.running;
  }, [refreshAudit, refreshPreflight]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const response = await fetch("/api/rag-v3/rebuild?view=job", { cache: "no-store" });
        const payload = await responseJson<{ job: JobSnapshot }>(response);
        if (!disposed) {
          wasRunning.current = payload.job.running;
          setJob((current) => ({ ...current, ...payload.job }));
        }
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    const refreshTimer = window.setTimeout(() => {
      void refreshAudit();
      void refreshPreflight();
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer);
    };
  }, [refreshAudit, refreshPreflight]);

  useEffect(() => {
    if (!job.running && externalJobs.clap !== "running" && externalJobs.siglip !== "running") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshJob().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job.running, externalJobs.clap, externalJobs.siglip, refreshJob]);

  useEffect(() => {
    wasRunning.current = job.running;
  }, [job.running]);

  const startExternal = async (kind: "clap" | "siglip", candidateId: string, stopJob = false) => {
    const title = kind === "clap" ? "CLAP" : "SigLIP2";
    requestConfirmation({
      action: stopJob ? `Остановить задачу ${title}; уже записанные файлы останутся без изменений.` : kind === "clap"
        ? "Векторизация только строки CLAP по закреплённому снимку. Будет вызвана модель CLAP; индекс записывается после проверки актуальности источника."
        : "Векторизация только строки SigLIP2 по закреплённому снимку. Будет загружена локальная модель SigLIP2; индекс записывается после проверки актуальности источника.",
      row: kind === "clap" ? "CLAP audio index" : "SigLIP / Morpho index", model: !stopJob,
      onConfirm: async () => {
        setLoading(true); setError(null);
        try {
          const response = await fetch(kind === "clap" ? "/api/audio/index" : "/api/morpho/index", {
            method: stopJob ? "DELETE" : "POST",
            ...(!stopJob ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate_id: candidateId }) } : {}),
          });
          await responseJson(response); await refreshAudit();
        } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
        finally { setLoading(false); }
      },
    });
  };

  const start = async (kind: RebuildKind, candidateVersion?: string, artifactKind?: QwenCandidateArtifactKind | GemmaCandidateArtifactKind) => {
    const action = kind === "corpus_candidate"
      ? t("Prepare all supported row inputs for the pinned snapshot and verify them by reading them back. No embedding or inference model is called; completed vectors and the active pointer are unchanged.")
      : kind === "qwen_component"
        ? tf("Vectorizes only the {artifact} artifact in candidate {candidate}. Dependencies: {dependencies} Output path: {output}. Only this artifact's files are written; active runtime files and other banks are unchanged.", { artifact: String(artifactKind), candidate: candidateVersion ?? "—", dependencies: artifactKind === "composite" ? "закреплённый снимок; совместимые готовые векторы могут быть повторно использованы, недостающие вычислит Qwen." : artifactKind === "atoms" ? "подготовленные строки атомов из закреплённого пакета; недостающие векторы вычислит Qwen." : artifactKind === "anchors" ? "строки и векторы текстового индекса, оси и калибровочные входы; Qwen векторизует запросы якорей." : artifactKind === "range" || artifactKind === "select" ? "строки и векторы текстового индекса, текущие значения/варианты параметров; Qwen векторизует недостающие прототипы." : "закреплённый снимок и определения связей; Qwen векторизует запросы связей.", output: (qwenWorkset?.candidate_path ?? "выбранный неактивный набор") + "/artifacts/qwen3/" + (artifactKind === "composite" ? "composite-index" : artifactKind === "atoms" ? "runtime-atoms" : artifactKind === "anchors" ? "anchors" : artifactKind === "range" || artifactKind === "select" ? "value-anchors" : "relations") })
      : kind === "gemma_component"
        ? tf("Vectorizes only Gemma artifact {artifact} in candidate {candidate}. Dependencies: {dependencies}. Local EmbeddingGemma inference will run. Output stays in the inactive Gemma-only candidate; Qwen files and pointers are untouched.", { artifact: String(artifactKind), candidate: candidateVersion ?? "—", dependencies: artifactKind === "embeddinggemma2_text" ? "подготовленные текстовые строки Gemma" : artifactKind === "gemma2_atoms" ? "подготовленные строки атомов и закреплённый пакет текущего источника" : artifactKind === "gemma2_anchors" || artifactKind === "gemma2_range" || artifactKind === "gemma2_select" ? "подготовленные входы и строка текстового индекса EmbeddingGemma 2" : "подготовленные определения связей" })
        : kind === "finalize_gemma_candidate"
          ? tf("Validate saved Gemma outputs and write the Gemma-only bundle manifest for candidate {candidate}. No model or vectorization is called; neither active pointer changes.", { candidate: candidateVersion ?? "—" })
      : kind === "vectorize_candidate"
        ? tf("Vectorizes the complete inactive Qwen set in candidate {candidate}: composite vectors, runtime atoms, anchors, Range/Select, and Relations. The configured local Qwen embedding model may be called; active runtime files and latest.json are not changed.", { candidate: candidateVersion ?? "—" })
        : kind === "finalize_candidate"
          ? tf("Finalize candidate {candidate}: validate saved files and write manifests. No model is called and active runtime files are not changed.", { candidate: candidateVersion ?? "—" })
          : tf("Run {kind}; this action may call a model and writes the output for this index family.", { kind });
    const row = kind === "corpus_candidate" ? "All supported rows (model-free source preparation)"
      : artifactKind ? buttonLabels[artifactKind] : kind === "finalize_candidate" ? "Qwen candidate completeness"
        : kind === "finalize_gemma_candidate" ? "Gemma candidate completeness"
        : kind === "vectorize_candidate" ? "Qwen candidate vectorization" : kind;
    const callsModel = kind === "qwen_component" || kind === "gemma_component" || kind === "vectorize_candidate" || (!(["corpus_candidate", "finalize_candidate", "finalize_gemma_candidate"].includes(kind)) && kind !== "catalogue");
    requestConfirmation({ action, row, model: callsModel, onConfirm: async () => {
      setLoading(true); setError(null);
      try {
        const response = await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, candidate_version: candidateVersion, artifact_kind: artifactKind }) });
        const payload = await responseJson<{ started?: boolean; reason?: string; job?: JobSnapshot }>(response);
        if (payload.job) setJob(payload.job);
      } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
      finally { setLoading(false); }
    }});
  };

  const candidateAction = async (action: "activate-candidate" | "rollback-candidate", candidateId: string) => {
    requestConfirmation({ action: action === "activate-candidate" ? `Подключить finalized candidate ${candidateId}; active pointer datasets/latest.json изменится.` : `Откатить ${candidateId} к сохранённой предыдущей версии.`, row: "Candidate connection", model: false, onConfirm: async () => {
      setLoading(true); setError(null);
      try {
        await responseJson(await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, candidate_id: candidateId }) }));
        await refreshAudit();
      } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
      finally { setLoading(false); }
    }});
  };

  const gemmaCandidateAction = async (candidateId: string) => {
    requestConfirmation({ action: `Подключить только Gemma bundle ${candidateId}; будет изменён datasets/embeddinggemma2-latest.json. Qwen datasets/latest.json не изменится.`, row: "Gemma candidate connection", model: false, onConfirm: async () => {
      setLoading(true); setError(null);
      try {
        await responseJson(await fetch("/api/rag-v3/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect-gemma-candidate", candidate_version: candidateId }) }));
        await refreshAudit();
      } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
      finally { setLoading(false); }
    }});
  };

  const stop = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/rag-v3/rebuild", { method: "DELETE" });
      const payload = await responseJson<{ job?: JobSnapshot; reason?: string }>(response);
      if (payload.job) setJob(payload.job);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  const qwenWorkset = audit?.corpus_candidates.find((candidate) =>
    candidate.source_revision === audit.effective_catalogue_revision
    && candidate.source_snapshot_sha256 === audit.source_snapshot_sha256
    && candidate.model === audit.active_model
    && candidate.endpoint === audit.active_endpoint
    && candidate.prepare_status === "complete"
    && typeof candidate.candidate_id === "string");
  const columnHeader = (label: string, hint: string) => <th className="p-2"><span className="inline-flex items-center gap-1">{t(label)}<V3InfoTip content={t(hint)} /></span></th>;

  return (
    <div className="space-y-3 rounded-lg border border-cyan-500/25 bg-cyan-950/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-cyan-300" />{t("Index coverage")}
            <V3InfoTip content={t("Read-only audit of local index files and source fingerprints. It does not load an embedding model.")} />
          </div>
          <div className="mt-1 text-xs text-zinc-500">{audit ? <>{t("Ollama")}: <code>{audit.active_endpoint ?? "—"}</code> · {t("active model")}: <code>{audit.active_model}</code> · {t("effective live parameters")}: {audit.active_parameters} · {t("tombstoned live")}: {audit.tombstoned_live_count} · {t("excluded live")}: {audit.excluded_live_count} · {t("active corpus")}: <code>{audit.active_version}</code> · {t("effective source revision")}: <code>{audit.effective_catalogue_revision.slice(0, 12)}</code> · {t("content fingerprint")}: <code>{audit.source_snapshot_sha256.slice(0, 12)}</code></> : t("Index status has not been checked")}</div>
        </div>
        {audit && !audit.active_corpus_ready ? <p role="status" className="w-full rounded border border-amber-500/30 bg-amber-950/20 p-2 text-xs text-amber-200">{audit.active_corpus_block_reason ? reasonText(audit.active_corpus_block_reason) : null}</p> : null}
        <div className="flex flex-wrap gap-2">
          <V3Tooltip content={t("Read-only check of the effective catalogue snapshot, local model availability, output path, jobs, and build dependencies. It does not run embeddings.")}><span className="inline-flex"><Button size="sm" variant="outline" onClick={() => void refreshPreflight()} disabled={loading || job.running}><Database className="size-3.5" />{t("Check build readiness")}</Button></span></V3Tooltip>
              <V3Tooltip content={t("Prepares and verifies all model-free inputs for supported table rows, including CLAP/SigLIP, Qwen, and Gemma row plans. No embedding/inference model is called; active runtime files and completed candidate vectors are untouched.")}><span className="inline-flex"><Button size="sm" variant="outline" onClick={() => void start("corpus_candidate")} disabled={loading || job.running || !preflight?.can_prepare_candidate} title={!preflight ? t("Check build readiness first") : undefined}>{t("Prepare source files · no model")}</Button></span></V3Tooltip>
          {(() => {
            const candidate = qwenWorkset;
            const candidateId = candidate?.candidate_id as string | undefined;
            const canFinalize = Boolean(candidateId && candidate?.finalization_status !== "complete" && preflight?.can_finalize_candidate);
            return <>
              <V3Tooltip content={t("Checks that every Qwen artifact row was built and validates saved files only. It never starts missing vectorization or calls a model.")}><span className="inline-flex"><Button size="sm" variant="outline" onClick={() => candidateId && void start("finalize_candidate", candidateId)} disabled={loading || job.running || !canFinalize}>{t("Finalize Qwen set")}</Button></span></V3Tooltip>
              {(() => {
                const ready = audit?.corpus_candidates.find((item) => item.source_revision === audit.effective_catalogue_revision && item.finalization_status === "complete" && item.qwen_bundle_status === "complete" && item.status === "ready_to_connect" && typeof item.version_id === "string" && typeof item.candidate_id === "string");
                return ready?.candidate_id ? <V3Tooltip content={t("Connects the finalized current-snapshot Qwen set. Changes only the Qwen active pointer; no model is called.")}><Button size="sm" disabled={loading || job.running || !preflight?.can_activate} title={preflight?.activation_reason} onClick={() => void candidateAction("activate-candidate", String(ready.candidate_id))}>{t("Connect finalized set")}</Button></V3Tooltip> : null;
              })()}
              {candidateId ? <V3Tooltip content={t("Checks saved Gemma outputs only. No model is called and no active pointer changes.")}><span className="inline-flex"><Button size="sm" variant="outline" disabled={loading || job.running || !gemmaCandidateRowsReadyForFinalize(candidate?.gemma_artifact_builds)} title={t("Gemma Finalize validates all six saved Gemma row outputs only; a fully vectorized runtime-atoms checkpoint is eligible; no model or active pointer is changed.")} onClick={() => void start("finalize_gemma_candidate", candidateId)}>{t("Finalize Gemma set")}</Button></span></V3Tooltip> : null}
              {candidateId && candidate?.gemma_finalization_status === "complete" && candidate?.gemma_bundle_status === "complete" ? <V3Tooltip content={t("Connects only the independent Gemma set. It does not switch Qwen.")}><span className="inline-flex"><Button size="sm" variant="outline" disabled={loading || job.running} title={t("Connect changes only the independent Gemma pointer; it does not switch Qwen.")} onClick={() => void gemmaCandidateAction(candidateId)}>{t("Connect Gemma set")}</Button></span></V3Tooltip> : null}
              {candidateId ? <span className="self-center text-[10px] text-zinc-500">{t("Working set")}: <code>{candidateId}</code> · {t(String(candidate?.status ?? "prepared"))}</span> : null}
            </>;
          })()}
          <V3Tooltip content={t(job.safe_to_stop ? "Stops an isolated runtime atom candidate; active files are untouched until validation." : "This operation writes active artifacts and cannot be stopped safely; wait for completion.")}><span className="inline-flex"><Button size="sm" variant="destructive" onClick={() => void stop()} disabled={!job.running || loading || !job.safe_to_stop}><Square className="size-3.5" />{t("Stop")}</Button></span></V3Tooltip>
          <V3Tooltip content={t("Refreshes local manifests and fingerprints on demand. Does not start a rebuild or load a model.")}><span className="inline-flex"><Button size="sm" variant="outline" onClick={() => void refreshAudit()} disabled={loading}><RefreshCw className="size-3.5" />{t("Refresh index status")}</Button></span></V3Tooltip>
        </div>
      </div>

      {preflight ? <div className="rounded border border-white/10 bg-black/25 p-2 text-xs" role="status">
        <div><strong>{t(preflight.can_prepare_candidate ? "Prepare can start without a model" : "Prepare is blocked")}</strong> · {t("source")}: <code>{t(preflight.source.kind)}</code> · {preflight.source.parameter_count} · {t("revision")}: <code>{preflight.source.revision.slice(0, 12)}</code> · {t("snapshot")}: <code>{preflight.source.content_sha256.slice(0, 12)}</code> · {t("tombstoned/excluded")}: <code>{preflight.source.tombstoned_live_count}/{preflight.source.excluded_live_count}</code> · {t("model")}: <code>{preflight.model.model}</code> ({preflight.model.installed ? t("installed") : t("unavailable")}) · {t("RAM")}: <code>{(preflight.available_memory_bytes / 1024 ** 3).toFixed(1)} GiB</code> / {t("minimum 2 GiB")} · {t("output")}: {preflight.output_writable ? t("writable") : t("unavailable")}</div>
        {preflight.candidate_blockers.length ? <div className="mt-1 text-amber-300">{preflight.candidate_blockers.map(reasonText).join("; ")}</div> : null}
        {!preflight.builder_dependencies.ready ? <div className="mt-1 text-amber-300">{t("Missing builder inputs")}: {preflight.builder_dependencies.missing.map(reasonText).join("; ")}</div> : null}
        <div className="mt-1">{t("Qwen row actions")}: {t("each Build button creates only its named artifact; dependent rows name their prerequisite row")}</div>
        <div className="mt-1">{t("Finalize")}: {preflight.can_finalize_candidate ? t("all Qwen artifact rows are present; technical validation only") : t("build each required Qwen artifact row first; Finalize never vectorizes missing outputs")}</div>
        <div className="mt-1">{t("Connection")}: {preflight.can_activate ? t("available for a finalized current-snapshot candidate") : reasonText(preflight.activation_reason)}</div>
        {preflight.qwen_candidate ? <div className="mt-1">{t("Current candidate")}: <code>{preflight.qwen_candidate.version_id}</code> · {t(preflight.qwen_candidate.bundle_status ?? "unknown")} · {t("revision")}: <code>{preflight.qwen_candidate.source_revision?.slice(0, 12)}</code> · {t("model")}: <code>{preflight.qwen_candidate.model}</code></div> : null}
        {preflight.model.check_error ? <div className="mt-1 text-amber-300">{reasonText(preflight.model.check_error)}</div> : null}
      </div> : null}

      <details className="rounded border border-white/10 bg-black/20 p-2 text-xs">
        <summary className="cursor-pointer font-medium">{t("Update order by index family")}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-300">
          <li><strong>Qwen3:</strong> {t("Prepare source files (no model) → build only the selected artifact row → Finalize validates already-built files only → connect separately. Anchors, Range, and Select name the Qwen3 text index row as a prerequisite.")}</li>
          <li><strong>Gemma:</strong> {t("Prepare stores snapshot-bound Gemma inputs. Build buttons write only their named artifact into the inactive Gemma candidate; Runtime atoms, text index, anchors, Range, Select, and relations are separate rows. Finalize validates saved outputs without vectorizing; Connect changes only the Gemma pointer.")}</li>
          <li><strong>CLAP:</strong> {t("Refresh the CLAP status, then use Build. Its builder captures one effective snapshot, reuses compatible CLAP vectors and checks source freshness before publishing its index. There is no separate comparison or latest activation for this independent modality index.")}</li>
          <li><strong>Morpho / SigLIP2:</strong> {t("Refresh the SigLIP status, then use Build. It captures the current effective snapshot, reuses matching row vectors, stages the index and swaps it after a freshness check. It is an independent modality index with no separate candidate comparison or latest activation.")}</li>
        </ol>
        <p className="mt-2 text-amber-200">{t("CLAP and SigLIP status checks are read-only. Their Build buttons perform real model inference when the user starts them.")}</p>
      </details>

      {audit ? <>
        <div className="overflow-x-auto rounded border border-white/10">
          <div className="mb-2 rounded border border-amber-500/25 bg-amber-950/10 p-2 text-[10px] text-amber-100">{t("The table below reports the files at each runtime read path. A prepared or finalized candidate is inactive and does not replace those files until separately connected.")} {t("Active runtime")}: <code>{audit.active_version}</code> · {t("source revision")}: <code>{audit.effective_catalogue_revision.slice(0, 12)}</code></div>
          <table className="w-full min-w-[1180px] text-left text-[11px]">
            <thead className="bg-white/5 text-zinc-400"><tr>
              {columnHeader("Artifact", "Artifact is the independently built output represented by this row; its model and runtime path are shown alongside.")}
              {columnHeader("Encoder", "Shows the exact model, vector dimension and execution provider used by this artifact.")}
              {columnHeader("Source", "Current means the artifact source fingerprint matches the effective catalogue snapshot. The status below describes file validity.")}
              {columnHeader("Vectors/files", "Readiness of the saved runtime vectors or files for this artifact; it is separate from prepared-input readiness.")}
              {columnHeader("Candidate output", "Status and output directory in the inactive workset. This does not mean the artifact is connected to runtime.")}
              {columnHeader("Job", "Last known job state for this artifact row. Running and error states are refreshed while jobs are active.")}
              {columnHeader("Runtime", "In use means runtime readers resolve this artifact through the active path; inactive outputs are not read.")}
              {columnHeader("Rows / expected", "Number of rows currently stored and the expected row count for this artifact.")}
              {columnHeader("Reused / computed", "Count of compatible saved vectors reused and new vectors computed in the latest build.")}
              {columnHeader("Reason / runtime path", "Build time, validation reason, actual runtime read path and data/vector fingerprints.")}
              {columnHeader("Prepare / dependencies", "Prepared input files are model-free. Missing inputs and prerequisite rows are listed here.")}
              {columnHeader("Action", "The button operates only on this row. Vectorization may call the model; preparation and finalization do not.")}
            </tr></thead>
            <tbody>{audit.artifacts.map((artifact) => (
              <tr key={artifact.kind} className="border-t border-white/5 align-top">
                <td className="p-2"><div className="font-medium">{t(artifact.label)}</div><div className="mt-0.5 max-w-64 text-[9px] text-zinc-500">{t(artifact.description)}</div></td>
                <td className="p-2">{artifact.model ?? "—"}<div className="text-zinc-500">{artifact.dimensions ?? "—"}D · {artifact.kind === "clap" || artifact.kind === "siglip" ? t("local / CPU") : t("Ollama")}</div></td>
                <td className="p-2"><Badge variant={artifact.source_freshness === "current" ? "secondary" : "outline"}>{t(artifact.source_freshness)}</Badge><div className="mt-1 text-[9px] text-zinc-500">{t(artifact.status)}</div></td>
                <td className="p-2"><Badge variant={artifact.vectors_ready ? "secondary" : "outline"}>{artifact.vectors_ready ? t("ready") : t("missing / invalid")}</Badge></td>
                <td className="p-2"><Badge variant={artifact.candidate_status === "complete" || artifact.candidate_status === "vectorization_complete" ? "secondary" : "outline"}>{t(artifact.candidate_status ?? (artifact.kind === "clap" || artifact.kind === "siglip" ? "separate runtime index" : "no prepared set"))}</Badge>{artifact.candidate_path ? <div className="max-w-40 break-all font-mono text-[9px] text-zinc-500">{artifact.kind === "clap" || artifact.kind === "siglip" ? t(candidateArtifactOutputLabel(artifact.kind)) : candidateArtifactOutputLabel(artifact.kind)}</div> : null}</td>
                <td className="p-2"><Badge variant={(artifact.kind === "clap" ? externalJobs.clap : artifact.kind === "siglip" ? externalJobs.siglip : artifact.job_status) === "error" ? "destructive" : (artifact.kind === "clap" ? externalJobs.clap : artifact.kind === "siglip" ? externalJobs.siglip : artifact.job_status) === "running" ? "outline" : "secondary"}>{t(artifact.kind === "clap" ? externalJobs.clap : artifact.kind === "siglip" ? externalJobs.siglip : artifact.job_status)}</Badge></td>
                <td className="p-2">{t(artifact.runtime_in_use ? "in use" : "inactive")}</td>
                <td className="p-2 font-mono">{artifact.row_count} / {artifact.expected_count}</td>
                <td className="p-2 font-mono">{artifact.embeddings_reused ?? "—"} / {artifact.embeddings_computed ?? "—"}</td>
                <td className="whitespace-nowrap p-2">{artifact.built_at ? new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : language === "de" ? "de-DE" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(artifact.built_at)) : "—"}</td>
                <td className="p-2 font-mono text-[9px] text-zinc-500">{artifact.reason ? reasonText(artifact.reason) : "—"}<br/><code title={artifact.runtime_path}>{artifact.runtime_path}</code><br/>D {artifact.data_fingerprint?.slice(0, 12) ?? "—"} · V {artifact.vector_fingerprint?.slice(0, 12) ?? "—"}</td>
                <td className="max-w-64 p-2 text-[9px]">
                  {(() => {
                    const gemmaRow = artifact.kind.startsWith("gemma2_") || artifact.kind === "embeddinggemma2_text";
                    const missingInputs = Object.entries(artifact.prepared_input_dispositions).filter(([, disposition]) => disposition === "missing").map(([file]) => file);
                    const otherBlockers = artifact.missing_dependencies.filter((dependency) => !missingInputs.includes(dependency) && !dependency.startsWith("prepared inputs failed"));
                    return <><div>{t("effective catalogue content SHA")}: <code>{artifact.preparation_fingerprint?.slice(0, 12) ?? "—"}</code></div><div>{t("serialized snapshot file SHA")}: <code>{artifact.snapshot_file_fingerprint?.slice(0, 12) ?? "—"}</code></div>
                      <div className="mt-1">{artifact.prepared_inputs.length ? artifact.prepared_inputs.map((file) => preparedInputLabel(file, artifact.prepared_input_dispositions[file] ?? "verified", t)).join(", ") : t("not prepared")}</div>
                      {artifact.prepared_inputs.length && !missingInputs.length ? <div className="mt-1 text-emerald-300">{t("inputs prepared and read-back verified")}</div> : <div className="mt-1 text-amber-300">{t("missing inputs")}: {missingInputs.join(", ") || t("not prepared")}</div>}
                      {gemmaRow ? <div className="mt-1 text-amber-300">{t(artifact.candidate_status === "complete" ? "Gemma output is saved in the inactive candidate; Gemma Connect remains separate." : "Gemma build writes only this row into the inactive Gemma candidate.")}</div> : null}
                      {otherBlockers.length ? <div className="mt-1 text-amber-300">{t("Action dependencies")}: {otherBlockers.map(reasonText).join(", ")}</div> : null}
                    </>;
                  })()}
                </td>
                <td className="p-2">{artifact.kind === "siglip" || artifact.kind === "clap"
                  ? <div className="flex flex-col gap-1">
                    <V3Tooltip content={t(artifact.kind === "clap" ? "Vectorizes only the CLAP row from prepared inputs and calls the CLAP model." : "Vectorizes only the SigLIP2 row from prepared inputs and loads the local SigLIP2 model.")}><span className="inline-flex"><Button size="sm" variant="outline" disabled={loading || !qwenWorkset?.candidate_id || !qwenWorkset.prepared_inputs_valid || artifact.missing_dependencies.length > 0 || (artifact.kind === "clap" ? externalJobs.clap === "running" || clapEnabled !== true : externalJobs.siglip === "running" || siglipEnabled !== true)} title={!qwenWorkset?.candidate_id ? t("Run Prepare source files first") : !qwenWorkset.prepared_inputs_valid ? t("Prepared row inputs failed read-back verification; run Prepare") : artifact.missing_dependencies.length ? artifact.missing_dependencies.map(reasonText).join("; ") : artifact.kind === "clap" ? clapEnabled === false ? t("Disabled in Settings") : t("Build only this row from the prepared snapshot; calls the CLAP model.") : siglipEnabled === false ? t("Disabled in Settings") : t("Build only this row from the prepared snapshot; loads local SigLIP2.")} onClick={() => qwenWorkset?.candidate_id && void startExternal(artifact.kind as "clap" | "siglip", String(qwenWorkset.candidate_id))}>{t(buttonLabels[artifact.kind])}</Button></span></V3Tooltip>
                    {(artifact.kind === "clap" ? externalJobs.clap : externalJobs.siglip) === "running" ? <V3Tooltip content={t("Requests stopping this row job; the active artifact is not replaced until the builder's publication step.")}><span className="inline-flex"><Button size="sm" variant="destructive" disabled={loading} onClick={() => void startExternal(artifact.kind as "clap" | "siglip", String(qwenWorkset?.candidate_id ?? ""), true)}>{t("Stop")}</Button></span></V3Tooltip> : null}
                  </div>
                  : (() => {
                    const qwenRow = ["composite", "atoms", "anchors", "range", "select", "relations"].includes(artifact.kind);
                    const gemmaRow = artifact.kind === "embeddinggemma2_text" || artifact.kind.startsWith("gemma2_");
                    const compositeReady = qwenWorkset?.artifact_builds?.composite === "complete";
                    const finalizedWorkset = qwenWorkset?.status === "ready_to_connect" || qwenWorkset?.status === "active";
                    const missingRowDependency = ["anchors", "range", "select"].includes(artifact.kind) && !compositeReady ? t("Build Qwen3 text index row first") : "";
                    const blocked = qwenRow && (!qwenWorkset?.candidate_id || finalizedWorkset || !qwenWorkset.prepared_inputs_valid || qwenEnabled !== true || artifact.missing_dependencies.length > 0 || Boolean(missingRowDependency));
                    const reason = missingRowDependency || artifact.missing_dependencies.map(reasonText).join("; ") || (!qwenWorkset?.candidate_id ? t("Prepare source files first") : !qwenWorkset.prepared_inputs_valid ? t("Prepared row inputs failed read-back verification; run Prepare") : qwenEnabled !== true ? t("Disabled in Settings") : t("Build only this artifact row into the prepared inactive candidate; model inference may run."));
                    const gemmaReadyInputs = Boolean(qwenWorkset?.candidate_id && qwenWorkset.prepared_inputs_valid && artifact.prepared_inputs.length > 0 && !artifact.missing_dependencies.some((dependency) => dependency.includes("missing") || dependency.includes("failed")));
                    const gemmaBlocked = finalizedWorkset || !gemmaReadyInputs || gemmaEnabled !== true || artifact.missing_dependencies.some((dependency) => dependency.includes("missing") || dependency.includes("failed") || dependency.startsWith("Build "));
                    return <V3Tooltip content={t(gemmaRow ? "Vectorizes only this Gemma row in the inactive Gemma workset. Uses EmbeddingGemma 2; Qwen outputs are not changed." : "Vectorizes only this row into the inactive Qwen workset. The model may be called; other rows are not built automatically.")}><span className="inline-flex"><Button size="sm" variant="outline" disabled={loading || job.running || (gemmaRow ? gemmaBlocked : blocked)} title={gemmaRow ? (finalizedWorkset ? t("This current-source candidate is finalized; prepare a new workset before rebuilding a row.") : artifact.missing_dependencies.map(reasonText).join("; ") || (!gemmaReadyInputs ? t("Run Prepare source files first") : gemmaEnabled !== true ? t("Disabled in Settings") : t("Build only this Gemma artifact row in the inactive Gemma candidate; local EmbeddingGemma inference runs."))) : reason || t("Action unavailable")} onClick={() => qwenRow ? void start("qwen_component", String(qwenWorkset?.candidate_id), artifact.kind as QwenCandidateArtifactKind) : gemmaRow ? void start("gemma_component", String(qwenWorkset?.candidate_id), artifact.kind as GemmaCandidateArtifactKind) : void start(artifact.kind as RebuildKind)}>{job.running && job.stage === artifact.kind ? <Loader2 className="size-3.5 animate-spin" /> : null}{t(buttonLabels[artifact.kind])}</Button></span></V3Tooltip>;
                  })()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[680px] text-left text-[10px]">
            <thead className="bg-white/5 text-zinc-400"><tr>
              {columnHeader("Mode / bank", "The mode ID is a stable runtime capability key. It is not a build command.")}
              {columnHeader("Input", "Input modality consumed by the retrieval mode.")}
              {columnHeader("Encoder", "Model family used for this mode; exact active models are shown in the artifact table above.")}
              {columnHeader("Value policy", "How this mode supplies parameter values after retrieval.")}
              {columnHeader("Readiness", "Runtime capability status. Ready does not by itself mean every optional modality is implemented.")}
              {columnHeader("Dependencies", "Artifact rows required by this mode. IDs are kept literal so they match the runtime registry.")}
            </tr></thead>
            <tbody>{audit.banks.map((bank) => <tr key={bank.mode_id} className="border-t border-white/5"><td className="p-2 font-mono">{bank.mode_id}</td><td className="p-2">{t(bank.input)}</td><td className="p-2">{t(bank.encoder)}</td><td className="p-2">{t(bank.value_policy)}</td><td className="p-2"><Badge variant={bank.status === "ready" ? "secondary" : "outline"}>{t(bank.status)}</Badge></td><td className="p-2 text-zinc-500"><div>{bank.dependencies.join(" · ")}</div>{bank.reason ? <p className="mt-1 max-w-xl text-amber-300">{bank.reason}{bank.value_domain_gaps?.length ? <span className="mt-1 block font-mono">{bank.value_domain_gaps.map((item) => `${item.ui_element}:${item.technical_name}`).join(", ")}</span> : null}</p> : null}</td></tr>)}</tbody>
          </table>
        </div>
      </> : <div className="rounded border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">{t("Use Refresh index status to inspect local artifact coverage.")}</div>}

      {job.running ? <div role="status" aria-live="polite" className="text-xs text-cyan-200"><Loader2 className="mr-1 inline size-3.5 animate-spin" />{t("Running")}: {t(job.stage ?? job.kind ?? "unknown")}{job.safe_to_stop ? ` · ${t("safe to stop; staged output")}` : ` · ${t("not safely interruptible")}`}</div> : job.finished_at > 0 ? <div role={job.exit_code === 0 || job.exit_code === 130 ? "status" : "alert"} aria-live="polite" className="text-xs text-muted-foreground">{job.exit_code === 0 ? job.kind === "corpus_candidate" ? t("Prepare complete; no embedding model was called") : job.kind === "vectorize_candidate" ? t("Vectorization complete; Finalize is still required") : job.kind === "finalize_candidate" ? t("Technical finalization complete; candidate remains inactive") : t("Last job completed and artifact audit passed") : job.exit_code === 130 ? t("Last job cancelled; active artifacts unchanged") : t("Last job failed; completed candidate files and vector batches remain available")}: {t(job.kind ?? "unknown")} · {t("exit")}: {job.exit_code ?? "—"}{job.last_error ? ` · ${reasonText(job.last_error)}` : ""}</div> : null}
      {job.source_revision ? <div className="text-[10px] text-zinc-500">{t("Captured source revision")}: <code>{job.source_revision}</code>{job.source_snapshot_sha256 ? <> · {t("snapshot")}: <code>{job.source_snapshot_sha256.slice(0, 12)}</code></> : null}{job.source_snapshot_path ? <> · {t("input")}: <code title={job.source_snapshot_path}>{job.source_snapshot_path.split(/[\\/]/).slice(-2).join("/")}</code></> : null}{job.excluded_count !== undefined ? <> · {t("exclusions")}: {job.excluded_count} / <code>{job.excluded_sha256?.slice(0, 12) ?? "—"}</code></> : null}{job.candidate_version ? <> · {t("candidate version")}: <code>{job.candidate_version}</code> · {t("not activated")}</> : null}</div> : null}
      {job.log_tail.length ? <pre role="log" aria-live="polite" className="max-h-36 overflow-auto rounded border border-white/10 bg-black/50 p-2 text-[10px] text-zinc-400">{job.log_tail.join("\n")}</pre> : job.running ? <p role="status" aria-live="polite" className="text-[10px] text-zinc-500">{t("Job is running; progress output will appear here as soon as the first update arrives.")}</p> : null}
      {error ? <div role="alert" className="text-xs text-red-300">{error}</div> : null}
      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{t("Подтвердите действие")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p><strong>{t("Действие:")}</strong> {confirmation?.action}</p>
                <p><strong>{t("Строка таблицы:")}</strong> {confirmation?.row ? t(confirmation.row) : "—"}</p>
                <p><strong>{t("Вызов модели:")}</strong> {confirmation?.model ? t("да") : t("нет")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading || operationStarted}>{t("Отмена")}</AlertDialogCancel>
            <AlertDialogAction disabled={loading || operationStarted} onClick={(event) => { event.preventDefault(); void confirmAction(); }}>{t("ОК")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const buttonLabels: Record<ArtifactKind, string> = {
  composite: "Vectorize Qwen3 text index", embeddinggemma2_text: "Vectorize EmbeddingGemma 2 text index", atoms: "Vectorize Qwen runtime atoms", anchors: "Vectorize Qwen live axes / anchors",
  range: "Vectorize Qwen Range anchors", select: "Vectorize Qwen Select options", relations: "Vectorize Qwen relation anchors", clap: "Vectorize CLAP audio index",
  gemma2_atoms: "Vectorize Gemma runtime atoms", gemma2_anchors: "Vectorize Gemma live axes / anchors", gemma2_range: "Vectorize Gemma Range anchors",
  gemma2_select: "Vectorize Gemma Select anchors", gemma2_relations: "Vectorize Gemma relation anchors",
  siglip: "Vectorize SigLIP2 index",
};
