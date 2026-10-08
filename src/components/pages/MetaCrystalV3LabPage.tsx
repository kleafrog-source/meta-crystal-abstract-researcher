"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Database, FlaskConical, PackageCheck, ShieldCheck, Square, ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PackageCandidate {
  technical_name: string;
  parent_parameters: string[];
  query_similarity: number;
  selection_score: number;
  value_inference: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

interface LabCandidate {
  parameter: Record<string, unknown>;
  package_candidate: PackageCandidate;
  errors: string[];
  warnings: string[];
}

interface Proposal {
  query: string;
  dataset_version: string;
  embedding_model: string;
  chat_model: string;
  candidates: LabCandidate[];
  meta_crystal_context: Array<{ kind: string; name: string; score: number; snippet: string }>;
  v3_neighbours: Array<{ technical_name: string; similarity: number }>;
  error?: string;
}

interface PackageResult {
  package_id: string;
  summary: { candidate_count: number; publishable_count: number; needs_review_count: number };
  error?: string;
}

interface PublishResult {
  dry_run: boolean;
  published: boolean;
  already_published: boolean;
  ready_for_library_publish: boolean;
  library_before_count: number;
  simulated_after_count: number;
  proposed_addition_count: number;
  collisions: string[];
  schema_errors: string[];
  error?: string;
}

function Help({ children }: { children: string }) {
  return <Tooltip><TooltipTrigger asChild><span className="inline-flex size-4 cursor-help items-center justify-center rounded-full border border-violet-400/30 text-[10px] text-violet-300">?</span></TooltipTrigger><TooltipContent className="max-w-sm">{children}</TooltipContent></Tooltip>;
}

export function MetaCrystalV3LabPage() {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState("3");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [edits, setEdits] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<Record<number, "up" | "down">>({});
  const [busy, setBusy] = useState<"propose" | "validate" | "package" | "check" | "publish" | null>(null);
  const [error, setError] = useState("");
  const [candidatePackage, setCandidatePackage] = useState<PackageResult | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const propose = async () => {
    if (!query.trim()) return;
    setBusy("propose"); setError(""); setProposal(null); setCandidatePackage(null); setPublishResult(null); setSelected(new Set()); setDirty(new Set());
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch("/api/meta-crystal-v3-lab/propose", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ query, count: Math.max(1, Math.min(8, Math.trunc(Number(count) || 3))) }),
      });
      const value = await response.json() as Proposal;
      if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
      setProposal(value); setEdits(value.candidates.map((item) => JSON.stringify(item.parameter, null, 2)));
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : String(caught));
    } finally { abortRef.current = null; setBusy(null); }
  };

  const validate = async () => {
    if (!proposal) return;
    setBusy("validate"); setError(""); setSelected(new Set()); setCandidatePackage(null); setPublishResult(null);
    try {
      const parameters = edits.map((value, index) => { try { return JSON.parse(value) as Record<string, unknown>; } catch { throw new Error(`Кандидат ${index + 1}: JSON не читается.`); } });
      const response = await fetch("/api/meta-crystal-v3-lab/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameters, parent_parameters: proposal.meta_crystal_context.filter((item) => item.kind === "crystal").map((item) => item.name) }) });
      const value = await response.json() as { dataset_version: string; candidates: LabCandidate[]; error?: string };
      if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
      setProposal({ ...proposal, dataset_version: value.dataset_version, candidates: value.candidates });
      setEdits(value.candidates.map((item) => JSON.stringify(item.parameter, null, 2)));
      setDirty(new Set());
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const approve = (index: number) => {
    if (!proposal || proposal.candidates[index].errors.length) return;
    const candidates = proposal.candidates.map((item, position) => position === index ? { ...item, package_candidate: { ...item.package_candidate, metadata: { ...item.package_candidate.metadata, review_status: "approved" } } } : item);
    setProposal({ ...proposal, candidates });
    setSelected((current) => new Set(current).add(index));
  };

  const rate = async (index: number, rating: "up" | "down") => {
    if (!proposal) return;
    setRatings((current) => ({ ...current, [index]: rating }));
    await fetch("/api/meta-crystal-v3-lab/rating", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ technical_name: proposal.candidates[index].package_candidate.technical_name, rating, query }) }).catch(() => undefined);
  };

  const savePackage = async () => {
    if (!proposal) return;
    const candidates = [...selected].sort((a, b) => a - b).map((index) => proposal.candidates[index].package_candidate);
    if (!candidates.length) return;
    setBusy("package"); setError(""); setPublishResult(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset_version: proposal.dataset_version, embedding_model: proposal.embedding_model, query, macro: "meta-crystal-v3-lab", seed: 0, candidates }) });
      const value = await response.json() as PackageResult;
      if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
      setCandidatePackage(value);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const publish = async (dryRun: boolean) => {
    if (!candidatePackage) return;
    setBusy(dryRun ? "check" : "publish"); setError("");
    try {
      const response = await fetch("/api/combinatorial-genesis/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ package_id: candidatePackage.package_id, dry_run: dryRun }) });
      const value = await response.json() as PublishResult;
      if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
      setPublishResult(value);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  return (
    <div className="flowmusic-console min-h-full overflow-auto p-4 text-zinc-100">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <header className="rounded-lg border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4 text-violet-300">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><FlaskConical className="size-5" /><h1 className="font-mono text-lg font-semibold">Meta-Crystal V3 Lab</h1></div><p className="mt-2 max-w-4xl text-sm text-violet-200/70">Локальная LLM читает RAG-контекст Мета-Кристаллов и ближайшие параметры V3, формирует новые записи по протоколу коллекции, но не публикует их без вашей проверки.</p></div><div className="flex gap-2"><Badge variant="outline">Meta-Crystal RAG</Badge><Badge variant="outline">V3 collision context</Badge><Badge variant="outline">manual publish</Badge></div></div>
        </header>

        <section className="space-y-3 rounded-lg border border-cyan-400/20 bg-cyan-950/10 p-4">
          <div className="flex items-center gap-2"><h2 className="font-mono text-sm font-semibold uppercase">1 · Задача куратору</h2><Help>Опишите пробел в базе или тип звучания. Запрос используется независимо и не продолжает предыдущий результат.</Help></div>
          <Textarea rows={5} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: найти в Мета-Кристаллах идеи для независимых параметров нестабильной резонансной микродинамики, которых ещё нет в V3" />
          <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs"><span className="flex items-center gap-1">Кандидатов <Help>За один ответ запрашивается от 1 до 8 параметров. Небольшой пакет надёжнее для локальной LLM.</Help></span><Input className="w-24" type="number" min={1} max={8} value={count} onChange={(event) => setCount(event.target.value)} /></label><Button onClick={() => void propose()} disabled={busy !== null || !query.trim()}><FlaskConical className="size-4" />{busy === "propose" ? "Анализ..." : "Найти и предложить"}</Button><Button variant="outline" onClick={() => abortRef.current?.abort()} disabled={busy !== "propose"}><Square className="size-4" />Остановить</Button></div>
          {error ? <div className="rounded border border-red-400/30 bg-red-950/20 p-3 text-sm text-red-200">{error}</div> : null}
        </section>

        {proposal ? <section className="space-y-3 rounded-lg border border-fuchsia-400/20 bg-fuchsia-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-mono text-sm font-semibold uppercase">2 · Проверка и ручной отбор</h2><p className="mt-1 text-xs text-zinc-400">JSON можно исправить вручную. После изменений снова нажмите «Проверить схему», затем подтвердите только качественные записи.</p></div><div className="flex gap-2"><Badge variant="outline">chat: {proposal.chat_model}</Badge><Badge variant="outline">embedding: {proposal.embedding_model}</Badge><Badge variant="outline">dataset: {proposal.dataset_version}</Badge></div></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void validate()} disabled={busy !== null}><ShieldCheck className="size-4" />{busy === "validate" ? "Проверка..." : "Проверить схему"}</Button><Button onClick={() => void savePackage()} disabled={busy !== null || selected.size === 0}><PackageCheck className="size-4" />{busy === "package" ? "Сохранение..." : `Сохранить пакет (${selected.size})`}</Button></div>
          <div className="grid gap-3 lg:grid-cols-2">{proposal.candidates.map((candidate, index) => {
            const approved = candidate.package_candidate.metadata.review_status === "approved" && !dirty.has(index);
            return <article key={`${candidate.package_candidate.technical_name}-${index}`} className={`rounded-lg border p-3 ${selected.has(index) ? "border-emerald-400/40 bg-emerald-950/15" : "border-white/10 bg-black/40"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div><code className="break-all text-sm text-fuchsia-200">{candidate.package_candidate.technical_name || `candidate-${index + 1}`}</code><div className="mt-1 text-[11px] text-zinc-500">{candidate.errors.length ? `${candidate.errors.length} ошибок` : approved ? "проверен и выбран" : "схема корректна · ожидает подтверждения"}</div></div><div className="flex gap-1"><Button size="icon" variant="outline" className={ratings[index] === "up" ? "ring-1 ring-emerald-400" : ""} onClick={() => void rate(index, "up")} aria-label="Полезный кандидат"><ThumbsUp className="size-4" /></Button><Button size="icon" variant="outline" className={ratings[index] === "down" ? "ring-1 ring-red-400" : ""} onClick={() => void rate(index, "down")} aria-label="Слабый кандидат"><ThumbsDown className="size-4" /></Button></div></div>
              {candidate.errors.length ? <ul className="mt-2 space-y-1 rounded border border-red-400/20 bg-red-950/20 p-2 text-xs text-red-200">{candidate.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {candidate.warnings.length ? <ul className="mt-2 space-y-1 rounded border border-amber-400/20 bg-amber-950/20 p-2 text-xs text-amber-200">{candidate.warnings.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              <Textarea className="mt-3 min-h-96 font-mono text-xs" value={edits[index] ?? ""} onChange={(event) => { const next = [...edits]; next[index] = event.target.value; setEdits(next); setDirty((current) => new Set(current).add(index)); setSelected((current) => { const value = new Set(current); value.delete(index); return value; }); }} />
              <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => approve(index)} disabled={candidate.errors.length > 0 || approved || dirty.has(index)}><CheckCircle2 className="size-4" />{dirty.has(index) ? "Сначала проверить схему" : approved ? "Подтверждено" : "Подтвердить параметр"}</Button>{approved ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected((current) => { const value = new Set(current); if (value.has(index)) value.delete(index); else value.add(index); return value; })} />В пакет</label> : null}</div>
            </article>;
          })}</div>
          <details className="text-xs text-zinc-400"><summary className="cursor-pointer">Показать использованный контекст</summary><div className="mt-2 grid gap-3 lg:grid-cols-2"><div><div className="mb-1 text-violet-300">Мета-Кристаллы</div>{proposal.meta_crystal_context.map((item) => <div key={`${item.kind}-${item.name}`}>{item.kind} · {item.name} · {item.score.toFixed(3)}</div>)}</div><div><div className="mb-1 text-violet-300">Ближайшие V3</div>{proposal.v3_neighbours.map((item) => <div key={item.technical_name}>{item.technical_name} · {item.similarity.toFixed(3)}</div>)}</div></div></details>
        </section> : null}

        {candidatePackage ? <section className="space-y-3 rounded-lg border border-emerald-400/20 bg-emerald-950/10 p-4"><h2 className="font-mono text-sm font-semibold uppercase">3 · Контролируемая публикация</h2><div className="text-xs text-zinc-300"><code>{candidatePackage.package_id}</code> · publishable {candidatePackage.summary.publishable_count}/{candidatePackage.summary.candidate_count}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void publish(true)} disabled={busy !== null}><ShieldCheck className="size-4" />{busy === "check" ? "Проверка..." : "Dry-run публикации"}</Button><Button onClick={() => void publish(false)} disabled={busy !== null || !publishResult?.ready_for_library_publish}><Database className="size-4" />{busy === "publish" ? "Публикация..." : "Добавить в автономную V3 library"}</Button></div>{publishResult ? <div className="rounded border border-white/10 bg-black/30 p-3 text-xs">{publishResult.published ? "Опубликовано" : publishResult.ready_for_library_publish ? "Dry-run успешен" : "Публикация заблокирована"} · library {publishResult.library_before_count} → {publishResult.simulated_after_count} · collisions {publishResult.collisions.length} · schema errors {publishResult.schema_errors.length}{publishResult.published ? <div className="mt-2 text-amber-200">Для участия новых параметров в поиске затем запустите Managed Rebuild V3. Автоматическая GPU-переиндексация здесь намеренно не запускается.</div> : null}</div> : null}</section> : null}
      </div>
    </div>
  );
}
