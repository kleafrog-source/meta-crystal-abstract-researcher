"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Atom, Database, FlaskConical, PackageCheck, Search, ShieldCheck, Sparkles } from "lucide-react";

import { SpeechInputButtons } from "@/components/SpeechInputButtons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Candidate {
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
  metadata: {
    name_ru: string;
    description_en: string;
    description_ru: string;
    category: string;
    sub_category: string;
    lyria_prompt_tags: string[];
    semantic_keywords: string[];
    review_status: "needs_review" | "approved";
  };
  llm_normalization?: {
    name_ru: string;
    description_en: string;
    description_ru: string;
    recommended: boolean;
    selection_reason: string;
    model: string;
  };
  source_metadata?: Candidate["metadata"];
}

interface Preview {
  dataset_version: string;
  embedding_model: string;
  query: string;
  source_count: number;
  known_source_count: number;
  generated_before_bge_rerank: number;
  auto_resolved_value_count: number;
  candidates: Candidate[];
  error?: string;
}

interface CandidatePackage {
  package_id: string;
  created: boolean;
  summary: { candidate_count: number; publishable_count: number; needs_review_count: number };
}

interface PublishResult {
  dry_run: boolean;
  published: boolean;
  already_published: boolean;
  ready_for_library_publish: boolean;
  proposed_addition_count: number;
  library_before_count: number;
  simulated_after_count: number;
  collisions: string[];
  schema_errors: string[];
}

interface V3SourceResult {
  technical_name: string;
  suggested_value?: number | string;
  current_value?: number | string;
  default?: number | string;
}

export function CombinatorialSynthesisPage() {
  const [model, setModel] = useState<string>("—");
  const [chatModel, setChatModel] = useState<string>("—");
  const [indexModel, setIndexModel] = useState<string>("—");
  const [macro, setMacro] = useState("");
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState("0");
  const [limit, setLimit] = useState("30");
  const [sourceCount, setSourceCount] = useState("3");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [candidatePackage, setCandidatePackage] = useState<CandidatePackage | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [busy, setBusy] = useState<"generate" | "package" | "check" | "publish" | "llm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<Record<string, string>>({});
  const [llmProgress, setLlmProgress] = useState({ current: 0, total: 0 });
  const llmAbortRef = useRef<AbortController | null>(null);
  const normalizationJobRef = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/combinatorial-genesis/collections/stats", { cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([settings, stats]: [{ llm?: { embedModel?: string; chatModel?: string } }, { runtime_index_model?: string }]) => {
        setModel(settings.llm?.embedModel || "—");
        setChatModel(settings.llm?.chatModel || "—");
        setIndexModel(stats.runtime_index_model || "—");
      })
      .catch(() => { setModel("—"); setIndexModel("—"); });
  }, []);

  const selectedCandidates = useMemo(
    () => preview?.candidates.filter((candidate) => selected.has(candidate.technical_name)) ?? [],
    [preview, selected],
  );

  const selectSources = async () => {
    const semanticGoal = query.trim();
    if (!semanticGoal) {
      setError("Сначала заполните поле «Семантическая цель».");
      return;
    }
    const count = Math.max(3, Math.min(30, Math.trunc(Number(sourceCount) || 3)));
    setSourceCount(String(count));
    setSourceBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rag-v3/propose-parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: semanticGoal,
          top_k: count,
          current_values: {},
          instruction_context: [],
          sources: { library: true, frozen: true, atoms: true, generated: true },
        }),
      });
      const payload = await response.json() as { results?: V3SourceResult[]; error?: string };
      if (!response.ok || !Array.isArray(payload.results)) throw new Error(payload.error ?? `HTTP ${response.status}`);
      const lines = payload.results.slice(0, count).map((item) => {
        const value = item.suggested_value ?? item.current_value ?? item.default ?? 0.5;
        return `${item.technical_name}: ${String(value).replace(/\s+/g, " ").trim()}`;
      });
      if (lines.length < 3) throw new Error(`V3 вернул только ${lines.length} структурных источника.`);
      setMacro(lines.join("\n"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSourceBusy(false);
    }
  };

  const generate = async () => {
    setBusy("generate");
    setError(null);
    setCandidatePackage(null);
    setPublishResult(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macro, query, seed: Number(seed) || 0, limit: Number(limit) || 30 }),
      });
      const payload = await response.json() as Preview;
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setPreview({ ...payload, candidates: payload.candidates.map((candidate) => ({ ...candidate, source_metadata: structuredClone(candidate.metadata) })) });
      setSelected(new Set());
    } catch (caught) {
      setPreview(null);
      setSelected(new Set());
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const savePackage = async () => {
    if (!preview || selectedCandidates.length === 0) return;
    setBusy("package");
    setError(null);
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
          candidates: selectedCandidates,
        }),
      });
      const payload = await response.json() as CandidatePackage & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setCandidatePackage(payload);
      setPublishResult(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const publish = async (dryRun: boolean) => {
    if (!candidatePackage) return;
    setBusy(dryRun ? "check" : "publish");
    setError(null);
    try {
      const response = await fetch("/api/combinatorial-genesis/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: candidatePackage.package_id, dry_run: dryRun }),
      });
      const payload = await response.json() as PublishResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setPublishResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (name: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const updateCandidate = (name: string, update: (candidate: Candidate) => Candidate) => {
    setPreview((current) => current ? {
      ...current,
      candidates: current.candidates.map((candidate) => candidate.technical_name === name ? update(candidate) : candidate),
    } : current);
  };

  const updateMetadata = (candidate: Candidate, field: keyof Candidate["metadata"], value: string | string[]) => {
    updateCandidate(candidate.technical_name, (current) => ({
      ...current,
      metadata: { ...current.metadata, [field]: value, review_status: "needs_review" },
    }));
  };

  const updateInference = (candidate: Candidate, field: keyof Candidate["value_inference"], value: string | number | string[]) => {
    updateCandidate(candidate.technical_name, (current) => ({
      ...current,
      value_inference: { ...current.value_inference, [field]: value, status: "needs_review" },
    }));
  };

  const approveReview = (candidate: Candidate) => {
    const metadata = candidate.metadata;
    const missingMetadata = [metadata.name_ru, metadata.description_en, metadata.description_ru, metadata.category, metadata.sub_category].some((value) => !value.trim());
    if (missingMetadata || metadata.lyria_prompt_tags.length !== 3 || metadata.semantic_keywords.length !== 7) {
      setReviewMessage((current) => ({ ...current, [candidate.technical_name]: "Заполните все metadata, ровно 3 lyria tags и 7 semantic keywords." }));
      return;
    }
    const inference = candidate.value_inference;
    if (!inference.unit.trim()) {
      setReviewMessage((current) => ({ ...current, [candidate.technical_name]: "Укажите unit." }));
      return;
    }
    if (inference.ui_element === "Range") {
      const values = [inference.min_value, inference.max_value, inference.step, inference.default];
      if (!values.every((value) => typeof value === "number" && Number.isFinite(value)) || Number(inference.min_value) > Number(inference.max_value) || Number(inference.step) <= 0 || Number(inference.default) < Number(inference.min_value) || Number(inference.default) > Number(inference.max_value)) {
        setReviewMessage((current) => ({ ...current, [candidate.technical_name]: "Проверьте числовые min, max, step и default для Range." }));
        return;
      }
    }
    if (inference.ui_element === "Select" && (!inference.options?.length || !inference.options.includes(String(inference.default ?? "")))) {
      setReviewMessage((current) => ({ ...current, [candidate.technical_name]: "Для Select нужны options и default, совпадающий с одной из options." }));
      return;
    }
    updateCandidate(candidate.technical_name, (current) => ({
      ...current,
      value_inference: { ...current.value_inference, status: "auto_resolved", confidence: 1, explanation: [...current.value_inference.explanation, "Manually reviewed in Combinatorial Synthesis."] },
      metadata: { ...current.metadata, review_status: "approved" },
    }));
    setSelected((current) => new Set(current).add(candidate.technical_name));
    setReviewMessage((current) => ({ ...current, [candidate.technical_name]: "Проверка подтверждена; кандидат готов к включению в draft." }));
  };

  const normalizeWithLlm = async () => {
    if (!preview) return;
    const pending = preview.candidates.filter((candidate) => !candidate.llm_normalization);
    const targets = pending.length > 0 ? pending : preview.candidates;
    setBusy("llm");
    setError(null);
    setLlmProgress({ current: 0, total: targets.length });
    const controller = new AbortController();
    llmAbortRef.current = controller;
    try {
      const snapshotResponse = await fetch("/api/combinatorial-genesis/normalization-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: preview.candidates, model: chatModel }),
        signal: controller.signal,
      });
      const snapshot = await snapshotResponse.json() as { job_id?: string; error?: string };
      if (!snapshotResponse.ok || !snapshot.job_id) throw new Error(snapshot.error ?? `Snapshot HTTP ${snapshotResponse.status}`);
      normalizationJobRef.current = snapshot.job_id;
      for (let start = 0; start < targets.length; start += 1) {
        const batch = targets.slice(start, start + 1);
        const response = await fetch("/api/combinatorial-genesis/normalize-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidates: batch }),
          signal: controller.signal,
        });
        const payload = await response.json() as { model?: string; candidates?: Array<Omit<NonNullable<Candidate["llm_normalization"]>, "model"> & { technical_name: string }>; error?: string };
        if (!response.ok || !payload.candidates || !payload.model) throw new Error(payload.error ?? `HTTP ${response.status}`);
        const normalized = new Map(payload.candidates.map((item) => [item.technical_name, item]));
        setPreview((current) => current ? {
          ...current,
          candidates: current.candidates.map((candidate) => {
            const item = normalized.get(candidate.technical_name);
            return item ? {
              ...candidate,
              llm_normalization: { ...item, model: payload.model! },
              metadata: {
                ...candidate.metadata,
                name_ru: item.name_ru,
                description_en: item.description_en,
                description_ru: item.description_ru,
                review_status: item.recommended && candidate.value_inference.status === "auto_resolved" ? "approved" : "needs_review",
              },
            } : candidate;
          }),
        } : current);
        setSelected((current) => {
          const next = new Set(current);
          for (const item of payload.candidates!) {
            const candidate = batch.find((entry) => entry.technical_name === item.technical_name);
            if (item.recommended && candidate?.value_inference.status === "auto_resolved") next.add(item.technical_name);
          }
          return next;
        });
        await fetch("/api/combinatorial-genesis/normalization-snapshot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: snapshot.job_id, results: payload.candidates, status: "running" }),
          signal: controller.signal,
        });
        setLlmProgress({ current: Math.min(start + batch.length, targets.length), total: targets.length });
      }
      await fetch("/api/combinatorial-genesis/normalization-snapshot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: snapshot.job_id, results: [], status: "completed" }),
      });
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      llmAbortRef.current = null;
      setBusy(null);
    }
  };

  const stopLlm = () => {
    llmAbortRef.current?.abort();
    if (normalizationJobRef.current) {
      void fetch("/api/combinatorial-genesis/normalization-snapshot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: normalizationJobRef.current, results: [], status: "stopped" }),
      });
    }
    setBusy(null);
  };

  const updateLlmText = (candidate: Candidate, field: "name_ru" | "description_en" | "description_ru", value: string) => {
    updateCandidate(candidate.technical_name, (current) => current.llm_normalization ? {
      ...current,
      llm_normalization: { ...current.llm_normalization, [field]: value },
    } : current);
  };

  const applyLlmSelection = () => {
    if (!preview) return;
    const accepted = new Set<string>();
    setPreview((current) => current ? {
      ...current,
      candidates: current.candidates.map((candidate) => {
        const normalized = candidate.llm_normalization;
        const textValid = Boolean(normalized && normalized.name_ru.trim() && normalized.description_en.trim() && normalized.description_ru.trim());
        const canSelect = Boolean(normalized?.recommended && textValid && candidate.value_inference.status === "auto_resolved");
        if (canSelect) accepted.add(candidate.technical_name);
        return normalized ? {
          ...candidate,
          metadata: {
            ...candidate.metadata,
            name_ru: normalized.name_ru,
            description_en: normalized.description_en,
            description_ru: normalized.description_ru,
            review_status: canSelect ? "approved" : "needs_review",
          },
        } : candidate;
      }),
    } : current);
    setSelected(accepted);
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-black/90 p-4">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <header className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="size-5 text-fuchsia-300" /><h1 className="font-mono text-lg font-semibold">Combinatorial Parameter Synthesis</h1></div>
              <p className="mt-2 max-w-4xl text-sm text-zinc-400">Создание новых technical_name из frozen atoms, BGE-ранжирование без LLM, ручной отбор и контролируемая публикация в автономную библиотеку Genesis.</p>
            </div>
            <div className="flex flex-wrap gap-2"><Badge variant="outline">BGE generation: {model}</Badge><Badge variant="outline">description normalization: {chatModel}</Badge><Badge variant="outline">index: {indexModel}</Badge><Badge variant="outline">V2 isolated</Badge></div>
          </div>
        </header>

        {model !== "—" && indexModel !== "—" && model !== indexModel ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-950/20 p-4 text-sm text-amber-100"><div><div className="font-semibold">Индекс построен другой embedding-моделью</div><div className="mt-1 text-xs text-amber-200/70">Активная модель: {model}; индекс: {indexModel}. Сначала перестройте inbox/index, иначе BGE-сравнение векторов запрещено.</div></div><Button variant="outline" asChild><a href="/combinatorial-genesis">Открыть управление индексом</a></Button></div> : null}

        <section className="space-y-3 rounded-lg border border-cyan-400/20 bg-cyan-950/10 p-4">
          <div><h2 className="font-mono text-sm font-semibold uppercase tracking-wide">1 · Источники и семантическая цель</h2><p className="mt-1 text-xs text-zinc-400">Вставьте минимум три существующих technical_name из V3 macro output. Они задают структурные источники; запрос задаёт смысловое направление BGE.</p></div>
          <div className="grid gap-1.5">
            <FieldLabel label="Структурные источники" hint="Минимум три technical_name из датасета V3, по одному на строку. Значения после двоеточия можно редактировать вручную." />
            <Textarea value={macro} onChange={(event) => setMacro(event.target.value)} rows={7} className="font-mono text-xs" placeholder={"spectral_flux_density_ratio: 0.4\ngranular_texture_variance: 0.6\nspatial_reflection_diffusion: 0.5"} />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel label="Семантическая цель" hint="Опишите желаемое звучание на русском, английском или смешанно. Цель используется BGE-моделью для поиска источников и создания комбинаций." />
            <div className="flex items-start gap-1.5">
              <Input className="min-w-0 flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: unstable organic granular space with slowly dispersing reflections" />
              <SpeechInputButtons value={query} onChange={setQuery} label="Семантическая цель" />
              <FieldHint hint="Верхняя кнопка добавляет распознанную речь к цели, нижняя полностью заменяет её. Запись остановится после трёх секунд тишины." />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded border border-white/10 bg-black/20 p-2.5">
            <div className="grid gap-1">
              <FieldLabel label="Количество источников" hint="Сколько наиболее близких параметров V3 подставить в поле структурных источников. Допустимо от 3 до 30." />
              <Input className="w-28" type="number" min={3} max={30} value={sourceCount} onChange={(event) => setSourceCount(event.target.value)} onBlur={() => setSourceCount(String(Math.max(3, Math.min(30, Math.trunc(Number(sourceCount) || 3)))))} />
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" onClick={() => void selectSources()} disabled={sourceBusy || !query.trim()}><Search className="size-4" />{sourceBusy ? "Подбор..." : "Подбор источников"}</Button>
              <FieldHint hint="Ищет по семантической цели наиболее близкие structural sources во всём активном датасете V3 и заменяет ими содержимое поля источников." />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1"><FieldLabel label="Seed" hint="Фиксирует случайный выбор атомов, чтобы одинаковый ввод воспроизводил тот же набор кандидатов." /><Input className="w-28" type="number" value={seed} onChange={(event) => setSeed(event.target.value)} /></div>
            <div className="grid gap-1"><FieldLabel label="Количество" hint="Максимальное число кандидатов, которое будет показано после BGE-переранжирования." /><Input className="w-28" type="number" min={1} max={50} value={limit} onChange={(event) => setLimit(event.target.value)} /></div>
            <div className="flex items-center gap-1"><Button onClick={() => void generate()} disabled={busy !== null}><Atom className="size-4" />{busy === "generate" ? "Генерация..." : "Создать комбинации"}</Button><FieldHint hint="Создаёт новые technical_name из выбранных источников и ранжирует кандидатов embedding-моделью относительно семантической цели." /></div>
          </div>
          {error ? <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">{error}</div> : null}
        </section>

        {preview ? <section className="space-y-3 rounded-lg border border-fuchsia-400/20 bg-fuchsia-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-mono text-sm font-semibold uppercase tracking-wide">2 · Ручная проверка и отбор</h2><p className="mt-1 text-xs text-zinc-400">Откройте «Проверить control values и metadata» в карточке. Публикация разрешается только после подтверждения полной схемы и текстовых полей.</p></div>
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">dataset: {preview.dataset_version}</Badge><Badge variant="secondary">model: {preview.embedding_model}</Badge><Badge variant="secondary">generated: {preview.generated_before_bge_rerank}</Badge><Badge variant="secondary">selected: {selected.size}</Badge></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void normalizeWithLlm()} disabled={busy !== null}>{busy === "llm" ? `LLM ${llmProgress.current}/${llmProgress.total}` : `Нормализовать описания через ${chatModel}`}</Button>
            <Button variant="destructive" size="sm" onClick={stopLlm} disabled={busy !== "llm"}>Остановить LLM</Button>
            <Button variant="outline" size="sm" onClick={applyLlmSelection} disabled={busy !== null || !preview.candidates.some((item) => item.llm_normalization)}>Применить LLM-отбор</Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set(preview.candidates.filter((item) => item.value_inference.status === "auto_resolved" && item.metadata.review_status === "approved").map((item) => item.technical_name)))}>Выбрать все проверенные</Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Снять выбор</Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {preview.candidates.map((candidate) => <article key={candidate.technical_name} className={`rounded-lg border p-3 ${selected.has(candidate.technical_name) ? "border-fuchsia-400/50 bg-fuchsia-950/20" : "border-white/10 bg-black/40"}`}>
              <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 accent-fuchsia-500 disabled:opacity-30" checked={selected.has(candidate.technical_name)} disabled={candidate.metadata.review_status !== "approved" || candidate.value_inference.status !== "auto_resolved"} onChange={() => toggle(candidate.technical_name)} /><div className="min-w-0 flex-1"><code className="break-all text-sm text-fuchsia-100">{candidate.technical_name}</code><div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-500"><span>BGE {candidate.query_similarity.toFixed(4)}</span><span>selection {candidate.selection_score.toFixed(4)}</span><span>{candidate.value_inference.status}</span><span>metadata: {candidate.metadata.review_status}</span><span>confidence {candidate.value_inference.confidence.toFixed(3)}</span></div></div></label>
              <div className="mt-2 rounded border border-white/10 bg-black/30 p-2 text-xs text-zinc-400"><span>{candidate.value_inference.ui_element}</span> · <span>{candidate.value_inference.unit}</span> · <span>{candidate.value_inference.quantity_kind}</span>{candidate.value_inference.ui_element === "Range" ? <div className="mt-1 font-mono">{candidate.value_inference.min_value} … {candidate.value_inference.default} … {candidate.value_inference.max_value} · step {candidate.value_inference.step}</div> : null}</div>
              <div className="mt-3 grid gap-2 xl:grid-cols-2">
                <div className="rounded border border-cyan-400/20 bg-cyan-950/10 p-2 text-xs"><div className="mb-2 font-mono font-semibold uppercase tracking-wide text-cyan-300">BGE + donors · исходное</div><div className="space-y-2 text-zinc-400"><div><span className="text-zinc-600">name_ru:</span> {(candidate.source_metadata ?? candidate.metadata).name_ru}</div><div><span className="text-zinc-600">description_en:</span> {(candidate.source_metadata ?? candidate.metadata).description_en}</div><div><span className="text-zinc-600">description_ru:</span> {(candidate.source_metadata ?? candidate.metadata).description_ru}</div></div></div>
                <div className="rounded border border-violet-400/30 bg-violet-950/15 p-2 text-xs"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono font-semibold uppercase tracking-wide text-violet-300"><span>LLM · {candidate.llm_normalization?.model ?? chatModel}</span>{candidate.llm_normalization ? <span className={candidate.llm_normalization.recommended ? "text-emerald-300" : "text-amber-300"}>{candidate.llm_normalization.recommended ? "recommended" : "manual review"}</span> : null}</div>{candidate.llm_normalization ? <div className="grid gap-2"><label className="grid gap-1 text-violet-200">name_ru<Input className="border-violet-400/20 text-violet-100" value={candidate.llm_normalization.name_ru} onChange={(event) => updateLlmText(candidate, "name_ru", event.target.value)} /></label><label className="grid gap-1 text-violet-200">description_en<Textarea className="border-violet-400/20 text-violet-100" rows={3} value={candidate.llm_normalization.description_en} onChange={(event) => updateLlmText(candidate, "description_en", event.target.value)} /></label><label className="grid gap-1 text-violet-200">description_ru<Textarea className="border-violet-400/20 text-violet-100" rows={3} value={candidate.llm_normalization.description_ru} onChange={(event) => updateLlmText(candidate, "description_ru", event.target.value)} /></label><div className="text-[11px] text-violet-300/70">{candidate.llm_normalization.selection_reason}</div></div> : <div className="py-4 text-center text-violet-300/50">Запустите пакетную нормализацию описаний.</div>}</div>
              </div>
              <details className="mt-2 text-xs text-zinc-500"><summary className="cursor-pointer">Происхождение</summary><div className="mt-1 break-all">{candidate.parent_parameters.join(" · ")}</div></details>
              <details className="mt-3 rounded border border-amber-400/20 bg-amber-950/10 p-2 text-xs text-zinc-300">
                <summary className="cursor-pointer font-semibold text-amber-200">Проверить control values и metadata</summary>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="grid gap-1">UI element<select className="h-9 rounded border border-white/10 bg-black px-2" value={candidate.value_inference.ui_element} onChange={(event) => {
                      const ui = event.target.value;
                      updateCandidate(candidate.technical_name, (current) => ({ ...current, value_inference: { ...current.value_inference, ui_element: ui, status: "needs_review", ...(ui === "Toggle" ? { min_value: 0, max_value: 1, step: 1, default: 0, unit: "boolean" } : {}) } }));
                    }}><option>Range</option><option>Select</option><option>Toggle</option><option>Text</option><option>String</option><option>Array</option></select></label>
                    <label className="grid gap-1">Unit<Input value={candidate.value_inference.unit} onChange={(event) => updateInference(candidate, "unit", event.target.value)} /></label>
                    <label className="grid gap-1">Quantity kind<Input value={candidate.value_inference.quantity_kind} onChange={(event) => updateInference(candidate, "quantity_kind", event.target.value)} /></label>
                  </div>
                  {candidate.value_inference.ui_element === "Range" || candidate.value_inference.ui_element === "Toggle" ? <div className="grid gap-2 sm:grid-cols-4">
                    {(["min_value", "max_value", "step", "default"] as const).map((field) => <label key={field} className="grid gap-1">{field}<Input type="number" value={String(candidate.value_inference[field] ?? "")} onChange={(event) => updateInference(candidate, field, Number(event.target.value))} /></label>)}
                  </div> : null}
                  {candidate.value_inference.ui_element === "Select" ? <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1">Options, через запятую<Input value={(candidate.value_inference.options ?? []).join(", ")} onChange={(event) => updateInference(candidate, "options", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label><label className="grid gap-1">Default<Input value={String(candidate.value_inference.default ?? "")} onChange={(event) => updateInference(candidate, "default", event.target.value)} /></label></div> : null}
                  {!(["Range", "Select", "Toggle"] as string[]).includes(candidate.value_inference.ui_element) ? <label className="grid gap-1">Default<Input value={String(candidate.value_inference.default ?? "")} onChange={(event) => updateInference(candidate, "default", event.target.value)} /></label> : null}
                  <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1">name_ru<Input value={candidate.metadata.name_ru} onChange={(event) => updateMetadata(candidate, "name_ru", event.target.value)} /></label><label className="grid gap-1">Category<Input value={candidate.metadata.category} onChange={(event) => updateMetadata(candidate, "category", event.target.value)} /></label></div>
                  <label className="grid gap-1">description_en<Textarea rows={3} value={candidate.metadata.description_en} onChange={(event) => updateMetadata(candidate, "description_en", event.target.value)} /></label>
                  <label className="grid gap-1">description_ru<Textarea rows={3} value={candidate.metadata.description_ru} onChange={(event) => updateMetadata(candidate, "description_ru", event.target.value)} /></label>
                  <label className="grid gap-1">Sub-category<Input value={candidate.metadata.sub_category} onChange={(event) => updateMetadata(candidate, "sub_category", event.target.value)} /></label>
                  <label className="grid gap-1">Lyria prompt tags — ровно 3, по одному на строку<Textarea rows={3} value={candidate.metadata.lyria_prompt_tags.join("\n")} onChange={(event) => updateMetadata(candidate, "lyria_prompt_tags", event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} /></label>
                  <label className="grid gap-1">Semantic keywords — ровно 7, по одному на строку<Textarea rows={7} value={candidate.metadata.semantic_keywords.join("\n")} onChange={(event) => updateMetadata(candidate, "semantic_keywords", event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} /></label>
                  <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" onClick={() => approveReview(candidate)}><ShieldCheck className="size-4" />Подтвердить ручную проверку</Button>{reviewMessage[candidate.technical_name] ? <span className={candidate.metadata.review_status === "approved" ? "text-emerald-300" : "text-amber-300"}>{reviewMessage[candidate.technical_name]}</span> : null}</div>
                </div>
              </details>
            </article>)}
          </div>
          <Button onClick={() => void savePackage()} disabled={busy !== null || selectedCandidates.length === 0}><PackageCheck className="size-4" />{busy === "package" ? "Сохранение..." : `Сохранить пакет из ${selectedCandidates.length}`}</Button>
        </section> : null}

        {candidatePackage ? <section className="space-y-3 rounded-lg border border-emerald-400/20 bg-emerald-950/10 p-4">
          <div><h2 className="font-mono text-sm font-semibold uppercase tracking-wide">3 · Проверка и пополнение базы</h2><p className="mt-1 text-xs text-zinc-400">Сначала выполните dry-run. Публикация пишет только в автономную CG library и не изменяет Genesis V2.</p></div>
          <div className="rounded border border-emerald-400/20 bg-black/30 p-3 text-xs"><div className="font-mono text-emerald-200">{candidatePackage.package_id}</div><div className="mt-1 text-zinc-400">publishable {candidatePackage.summary.publishable_count}/{candidatePackage.summary.candidate_count} · needs review {candidatePackage.summary.needs_review_count}</div></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void publish(true)} disabled={busy !== null}><ShieldCheck className="size-4" />{busy === "check" ? "Проверка..." : "Проверить публикацию"}</Button><Button onClick={() => void publish(false)} disabled={busy !== null || !publishResult?.ready_for_library_publish}><Database className="size-4" />{busy === "publish" ? "Публикация..." : "Добавить в базу CG"}</Button></div>
          {publishResult ? <div className={`rounded border p-3 text-xs ${publishResult.ready_for_library_publish ? "border-cyan-400/30 bg-cyan-950/20 text-cyan-100" : "border-amber-400/30 bg-amber-950/20 text-amber-100"}`}><div className="font-mono">{publishResult.published ? "published" : publishResult.already_published ? "already published" : publishResult.dry_run ? "dry-run" : "blocked"}</div><div className="mt-1">library {publishResult.library_before_count} → {publishResult.simulated_after_count} · additions {publishResult.proposed_addition_count}</div><div>collisions {publishResult.collisions.length} · schema errors {publishResult.schema_errors.length}</div>{publishResult.published ? <div className="mt-2 text-zinc-300">Параметры сохранены. Перестройте V3 composite index и live anchors, чтобы они появились в поиске и Anchored control bank.</div> : null}</div> : null}
        </section> : null}
      </div>
    </div>
  );
}
