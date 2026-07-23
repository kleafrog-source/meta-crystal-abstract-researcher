"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiPost } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import type { SidecarEvent } from "@/lib/engine/runner";
import { CheckCircle2, GitBranch, Layers, Loader2, Play, Terminal } from "@/components/icons";

interface EnrichResult {
  new_terms_count: number;
  isomorphisms_count: number;
  new_terms: string[];
  isomorphisms: Array<Record<string, unknown>>;
}

const DEFAULT_FORM = {
  categories_to_evolve: "математика, физика, логика, психология",
  iterations: 2,
  hybrid_count: 10,
  iso_threshold: 0.3,
  apply_phase_transition: true,
  seed: 42,
  max_terms_per_category: 20,
  min_word_length: 3,
  max_word_length: 40,
  deduplicate_cross_category: true,
};

export function Enrichment() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [events, setEvents] = useState<SidecarEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!taskId) return;
    const es = new EventSource(`/api/generate/stream/${taskId}`);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as SidecarEvent;
        setEvents((prev) => [...prev, evt]);
        if (evt.event === "done") {
          setRunning(false);
          setResult(evt.result as EnrichResult);
          es.close();
        }
        if (evt.event === "error") {
          setRunning(false);
          es.close();
          toast({ title: "Ошибка обогащения", description: evt.msg, variant: "destructive" });
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [taskId, toast]);

  const start = async () => {
    try {
      setEvents([]);
      setResult(null);
      setRunning(true);
      const response = await apiPost<{ taskId: string }>("/api/enrich", {
        ...form,
        categories_to_evolve: form.categories_to_evolve.split(",").map((x) => x.trim()).filter(Boolean),
      });
      setTaskId(response.taskId);
    } catch (error) {
      setRunning(false);
      toast({ title: "Не удалось запустить", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/30 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="text-glow-emerald">Обогащение</span>
              {running && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" />выполняется</Badge>}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Предсказуемый режим enrichment с параметрами, близкими к Python GUI.</p>
          </div>
          <Button onClick={start} disabled={running}><Play className="mr-1.5 h-3.5 w-3.5" />Запустить</Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden p-6">
        <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Параметры обогащения</CardTitle>
                <CardDescription>Категории, гибриды, изоморфизмы, seed и ограничения.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Категории через запятую</Label>
                  <Input value={form.categories_to_evolve} onChange={(e) => setForm((p) => ({ ...p, categories_to_evolve: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Итерации" value={form.iterations} onChange={(v) => setForm((p) => ({ ...p, iterations: v }))} />
                  <NumberField label="Гибридов" value={form.hybrid_count} onChange={(v) => setForm((p) => ({ ...p, hybrid_count: v }))} />
                  <NumberField label="Seed" value={form.seed} onChange={(v) => setForm((p) => ({ ...p, seed: v }))} />
                  <NumberField label="Макс. терминов" value={form.max_terms_per_category} onChange={(v) => setForm((p) => ({ ...p, max_terms_per_category: v }))} />
                  <NumberField label="Мин. длина" value={form.min_word_length} onChange={(v) => setForm((p) => ({ ...p, min_word_length: v }))} />
                  <NumberField label="Макс. длина" value={form.max_word_length} onChange={(v) => setForm((p) => ({ ...p, max_word_length: v }))} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Порог изоморфизма</Label>
                    <span className="font-mono text-xs text-emerald-300">{form.iso_threshold.toFixed(2)}</span>
                  </div>
                  <Slider value={[form.iso_threshold]} min={0} max={1} step={0.01} onValueChange={(v) => setForm((p) => ({ ...p, iso_threshold: v[0] }))} />
                </div>
                <ToggleField label="Применять фазовый переход" value={form.apply_phase_transition} onChange={(v) => setForm((p) => ({ ...p, apply_phase_transition: v }))} />
                <ToggleField label="Дедупликация между категориями" value={form.deduplicate_cross_category} onChange={(v) => setForm((p) => ({ ...p, deduplicate_cross_category: v }))} />
              </CardContent>
            </Card>

            {result && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Результат</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded border border-border bg-card/40 px-3 py-2">
                    <Layers className="mx-auto mb-1 h-4 w-4 text-cyan-400" />
                    <div className="font-mono text-cyan-300">{result.new_terms_count}</div>
                    <div className="text-[10px] text-muted-foreground">новых терминов</div>
                  </div>
                  <div className="rounded border border-border bg-card/40 px-3 py-2">
                    <GitBranch className="mx-auto mb-1 h-4 w-4 text-violet-400" />
                    <div className="font-mono text-violet-300">{result.isomorphisms_count}</div>
                    <div className="text-[10px] text-muted-foreground">изоморфизмов</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="flex flex-col lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Terminal className="h-4 w-4 text-emerald-400" />Лог выполнения</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full max-h-[60vh] rounded-b-lg log-terminal">
                <div className="space-y-0.5 p-4 font-mono text-xs">
                  {events.length === 0 ? (
                    <div className="italic text-muted-foreground">$ ожидание запуска enrichment…</div>
                  ) : (
                    events.map((e, i) => <LogLine key={i} event={e} />)
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LogLine({ event }: { event: SidecarEvent }) {
  if (event.event === "log") return <div className="text-cyan-300"><span className="opacity-50">[{event.ts?.slice(11, 19) ?? ""}]</span> {event.msg}</div>;
  if (event.event === "progress") return <div className="text-violet-300"><span className="opacity-50">[{event.ts?.slice(11, 19) ?? ""}]</span> {event.value}% — {event.step}</div>;
  if (event.event === "done") return <div className="font-bold text-emerald-300">done</div>;
  if (event.event === "error") return <div className="font-bold text-rose-300">{event.msg}</div>;
  return null;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="font-mono" />
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2.5">
      <Label className="text-xs">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
