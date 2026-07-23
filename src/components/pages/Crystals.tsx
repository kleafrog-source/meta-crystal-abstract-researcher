"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Star,
  Brain,
  RefreshCw,
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiPost, apiDelete } from "@/hooks/use-fetch";

interface CrystalListItem {
  id: string;
  code: string;
  type: string;
  category: string | null;
  focus: string | null;
  pattern: string | null;
  combination: string;
  combinationShort: string;
  qualityScore: number | null;
  complexity: number | null;
  counter: number;
  step: number | null;
  isFavourite: boolean;
  createdAt: string;
  similarity?: number;
}

interface CrystalsList {
  ok: boolean;
  total: number;
  latestCounter?: number | null;
  page: number;
  pageSize: number;
  items: CrystalListItem[];
}

interface CrystalDetail {
  ok: boolean;
  crystal: {
    id: string;
    code: string;
    type: string;
    focus: string | null;
    pattern: string | null;
    combination: string;
    elements: unknown[];
    operators: unknown[];
    metrics: Record<string, number>;
    reasons: string[];
    metadata: Record<string, unknown>;
    qualityScore: number | null;
    complexity: number | null;
    counter: number;
    step: number | null;
    filepath: string;
    createdAt: string;
    llmMicroNote: string | null;
    vectorDirection: string | null;
    mutationProbabilities: string[];
    llmSynthesisReasoning: string | null;
    fullFile: Record<string, unknown> | null;
  };
}

const PAGE_SIZE = 25;
const TYPE_OPTIONS = [
  { value: "hybrid", label: "Гибрид" },
  { value: "paradox", label: "Парадокс" },
  { value: "cryptography", label: "Криптография" },
  { value: "emerald", label: "Изумруд" },
  { value: "diamond", label: "Алмаз" },
  { value: "principle", label: "Принцип" },
  { value: "quantum", label: "Квантовый" },
  { value: "fractal", label: "Фрактальный" },
  { value: "linguistic", label: "Лингвистический" },
  { value: "system", label: "Системный" },
];

export function Crystals() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [favouriteOnly, setFavouriteOnly] = useState(false);
  const [data, setData] = useState<CrystalsList | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrystalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) {
        params.set("search", search);
        if (semantic) params.set("semantic", "1");
      }
      if (typeFilter) params.set("type", typeFilter);
      if (favouriteOnly) params.set("favourite", "1");
      const r = await fetch(`/api/crystals?${params}`);
      setData(await r.json());
    } catch (error) {
      toast({
        title: "Ошибка загрузки",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, semantic, typeFilter, favouriteOnly, toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setInterpretation(null);
      return;
    }
    setDetailLoading(true);
    setInterpretation(null);
    fetch(`/api/crystals/${selectedId}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch((error) =>
        toast({
          title: "Ошибка загрузки детали",
          description: (error as Error).message,
          variant: "destructive",
        }),
      )
      .finally(() => setDetailLoading(false));
  }, [selectedId, toast]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await apiPost("/api/crystals?refresh=1&page=1&pageSize=1", {});
      await fetchList();
      toast({ title: "Индекс синхронизирован" });
    } catch (error) {
      toast({
        title: "Ошибка синхронизации",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const toggleFavourite = async (id: string, current: boolean) => {
    try {
      await apiPost(`/api/crystals/${id}/favourite`, { favourite: !current });
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === id ? { ...item, isFavourite: !current } : item,
              ),
            }
          : prev,
      );
    } catch (error) {
      toast({
        title: "Ошибка",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить кристалл из базы?")) return;
    try {
      await apiDelete(`/api/crystals/${id}`);
      toast({ title: "Кристалл удалён" });
      setSelectedId(null);
      fetchList();
    } catch (error) {
      toast({
        title: "Ошибка удаления",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleInterpret = async () => {
    if (!selectedId) return;
    setInterpreting(true);
    setInterpretation(null);
    try {
      const r = await apiPost<{ interpretation: string }>(`/api/llm/interpret/${selectedId}`, {});
      setInterpretation(r.interpretation);
    } catch (error) {
      toast({
        title: "Ошибка интерпретации",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setInterpreting(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const decodedCode = detail ? decodeCrystalCodeV2(detail.crystal.code) : [];

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-5 border-b border-border bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <span className="text-glow-emerald">Библиотека кристаллов</span>
              {data && <Badge variant="outline" className="font-mono">{data.total.toLocaleString("ru-RU")}</Badge>}
              {data?.latestCounter != null && <Badge variant="outline" className="font-mono">last #{data.latestCounter}</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Просмотр, поиск и интерпретация сгенерированных кристаллов
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Синхронизировать
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[280px] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={semantic ? "Семантический поиск..." : "Поиск по тексту, коду, фокусу..."}
                className="pl-8 font-mono text-sm"
              />
            </div>
            <Button size="sm" onClick={handleSearch}>
              <Search className="h-3.5 w-3.5 mr-1" />
              Найти
            </Button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card/40">
            <Brain className="h-3.5 w-3.5 text-violet-400" />
            <Label className="text-xs">Семантический</Label>
            <Switch checked={semantic} onCheckedChange={setSemantic} />
          </div>

          <Select
            value={typeFilter || "all"}
            onValueChange={(value) => {
              setTypeFilter(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {TYPE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card/40">
            <Star className="h-3.5 w-3.5 text-amber-400" />
            <Label className="text-xs">Избранное</Label>
            <Switch
              checked={favouriteOnly}
              onCheckedChange={(value) => {
                setFavouriteOnly(value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Кристаллы не найдены</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-6 py-3">
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-card/60 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 w-12" />
                      <th className="text-left px-3 py-2">Тип</th>
                      <th className="text-left px-3 py-2">Код</th>
                      <th className="text-left px-3 py-2">Фокус</th>
                      <th className="text-left px-3 py-2 hidden lg:table-cell">Комбинация</th>
                      <th className="text-right px-3 py-2">Q</th>
                      <th className="text-right px-3 py-2 hidden md:table-cell">Cmplx</th>
                      <th className="text-right px-3 py-2">#</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`cursor-pointer hover:bg-accent/30 ${selectedId === item.id ? "bg-accent/40" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavourite(item.id, item.isFavourite);
                            }}
                            className="text-muted-foreground hover:text-amber-400"
                          >
                            <Star className={`h-3.5 w-3.5 ${item.isFavourite ? "fill-amber-400 text-amber-400" : ""}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2"><CrystalTypeBadge type={item.type} /></td>
                        <td className="px-3 py-2">
                          <code className="text-xs font-mono">{item.code}</code>
                          {item.similarity != null && (
                            <div className="text-[10px] text-violet-300 font-mono">sim: {item.similarity.toFixed(3)}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[180px]">{item.focus ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground/80 truncate max-w-[400px] hidden lg:table-cell">
                          {item.combinationShort}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.qualityScore != null ? (
                            <span className="font-mono text-emerald-300 text-xs">{item.qualityScore.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right hidden md:table-cell">
                          {item.complexity != null ? <span className="font-mono text-xs">{item.complexity}</span> : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-mono text-muted-foreground">{item.counter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-muted-foreground">
                  Страница {data.page} из {totalPages} · всего {data.total}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {detail?.crystal && <CrystalTypeBadge type={detail.crystal.type} />}
              <code className="font-mono">{detail?.crystal.code ?? "..."}</code>
            </SheetTitle>
            <SheetDescription>
              Кристалл #{detail?.crystal.counter ?? "..."}{detail?.crystal.focus ? ` • ${detail.crystal.focus}` : ""}
            </SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="space-y-4 mt-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleInterpret} disabled={interpreting}>
                  {interpreting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1.5" />}
                  Интерпретировать
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleFavourite(detail.crystal.id, false)}>
                  <Star className="h-3.5 w-3.5 mr-1.5" />
                  В избранное
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(detail.crystal.id)}>
                  Удалить
                </Button>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Комбинация</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {detail.crystal.llmMicroNote && (
                      <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/10">
                        note: {detail.crystal.llmMicroNote}
                      </Badge>
                    )}
                    {detail.crystal.vectorDirection && (
                      <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/10 whitespace-normal text-left">
                        vector: {detail.crystal.vectorDirection}
                      </Badge>
                    )}
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground/90">{detail.crystal.combination}</pre>
                </CardContent>
              </Card>

              {(detail.crystal.mutationProbabilities.length > 0 || detail.crystal.llmSynthesisReasoning) && (
                <Card className="border-cyan-500/20 bg-cyan-500/5">
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-cyan-300">Manifestation</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {detail.crystal.mutationProbabilities.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Точки мутации</div>
                        <div className="flex flex-wrap gap-1.5">
                          {detail.crystal.mutationProbabilities.map((item, index) => (
                            <Badge key={`${item}-${index}`} variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-200">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {detail.crystal.llmSynthesisReasoning && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Причина синтеза</div>
                        <pre className="text-xs whitespace-pre-wrap break-words text-foreground/90 font-sans">
                          {detail.crystal.llmSynthesisReasoning}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {decodedCode.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Расшифровка кода</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {decodedCode.map((item) => (
                        <div key={`${item.label}-${item.code}`} className="grid grid-cols-[96px_72px_1fr] gap-2 text-xs">
                          <div className="text-muted-foreground">{item.label}</div>
                          <code className="font-mono text-cyan-300">{item.code}</code>
                          <div className="text-foreground/80">{item.description}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {Object.keys(detail.crystal.metrics).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Метрики MMSS</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {Object.entries(detail.crystal.metrics).map(([key, value]) => (
                        <div key={key} className="px-2 py-1.5 rounded border border-border bg-card/40 text-center">
                          <div className="text-[10px] text-muted-foreground uppercase">{key}</div>
                          <div className="text-sm font-mono text-emerald-300">{typeof value === "number" ? value.toFixed(3) : String(value)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Элементы ({detail.crystal.elements.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {detail.crystal.elements.map((item, index) => (
                        <Badge key={index} variant="outline" className="text-[10px] font-mono">{renderCrystalToken(item)}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Операторы ({detail.crystal.operators.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {detail.crystal.operators.map((item, index) => (
                        <Badge key={index} variant="outline" className="text-[10px] font-mono">{renderCrystalToken(item)}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {detail.crystal.reasons.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Причины классификации</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-xs">
                      {detail.crystal.reasons.map((reason, index) => (
                        <li key={index} className="text-foreground/80">• {reason}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {interpretation && (
                <Card className="border-violet-500/30 bg-violet-500/5">
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-violet-300">LLM-интерпретация</CardTitle></CardHeader>
                  <CardContent>
                    <pre className="text-xs whitespace-pre-wrap break-words text-foreground/90 font-sans">{interpretation}</pre>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Метаданные</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-[11px] text-muted-foreground font-mono">
                  <div>filepath: {detail.crystal.filepath}</div>
                  <div>createdAt: {new Date(detail.crystal.createdAt).toLocaleString("ru-RU")}</div>
                  {detail.crystal.step != null && <div>step: {detail.crystal.step}</div>}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CrystalTypeBadge({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    diamond: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    principle: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    hybrid: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    paradox: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    quantum: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    fractal: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    cryptography: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  };
  const cls = colors[normalized] ?? "bg-muted/40 text-muted-foreground border-border";
  return <span className={`inline-flex items-center justify-center h-6 px-2 rounded text-[10px] font-mono font-semibold border ${cls}`}>{getCrystalTypeLabel(type)}</span>;
}

function getCrystalTypeLabel(type: string) {
  const map: Record<string, string> = {
    hybrid: "Гибрид",
    paradox: "Парадокс",
    cryptography: "Крипто",
    emerald: "Изумруд",
    diamond: "Алмаз",
    principle: "Принцип",
    quantum: "Квант",
    fractal: "Фрактал",
    linguistic: "Лингв.",
    system: "Сист.",
  };
  return map[type.toLowerCase()] ?? type;
}

function renderCrystalToken(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const token = value as Record<string, unknown>;
    return String(token.symbol ?? token.key ?? token.name ?? token.type ?? JSON.stringify(token));
  }
  return String(value);
}

function decodeCrystalCode(code: string) {
  const mainPart = code.split("-", 1)[0] ?? code;
  const hashPart = code.includes("-") ? code.slice(code.indexOf("-") + 1) : "";
  const scienceMap: Record<string, string> = {
    N: "наука / общая область",
    Q: "квантовый домен",
    T: "топология",
    C: "категории и композиция",
    S: "система / структура",
    P: "паттерн / процесс",
    QC: "квантовая композиция",
    TF: "тополого-фрактальный домен",
  };
  const operatorMap: Record<string, string> = {
    AS: "ассоциация / синтез",
    DI: "дифференциация",
    IN: "инверсия",
    TR: "трансформация",
    CO: "композиция",
    RE: "рекурсия",
    HY: "гибридизация",
  };
  const psychologyMap: Record<string, string> = {
    "0": "без психологического модулятора",
    J: "юнгианский модуль",
    C: "когнитивное смещение",
    M: "mindfulness / созерцание",
    N: "нейро-перспектива",
  };
  const patternMap: Record<string, string> = {
    L: "линейный",
    H: "гибридный",
    K: "каскад",
    C: "цикл",
    S: "спираль",
    R: "рекурсия",
    F: "фрактальный",
    Q: "квантовый",
    T: "топологический",
    SY: "симметричный",
    HI: "иерархический",
    D: "диалектический",
  };
  const intensityMap: Record<string, string> = {
    C: "комплексная интенсивность",
    H: "бесконечная интенсивность",
    L: "иррациональная интенсивность",
    Q: "высший порядок",
    D: "дифференциальная интенсивность",
    N: "обычная интенсивность",
  };

  const scienceCode = mainPart.slice(0, 2) in scienceMap ? mainPart.slice(0, 2) : mainPart.slice(0, 1);
  const offset = scienceCode.length;
  const operatorCode = mainPart.slice(offset, offset + 2);
  const intensityCode = mainPart.slice(offset + 2, offset + 3);
  const psychologyCode = mainPart.slice(offset + 3, offset + 4);
  const twoCharPattern = mainPart.slice(offset + 4, offset + 6);
  const oneCharPattern = mainPart.slice(offset + 4, offset + 5);
  const patternCode = twoCharPattern in patternMap ? twoCharPattern : oneCharPattern;

  return [
    {
      label: "Наука",
      code: scienceCode || "—",
      description: scienceMap[scienceCode] ?? "неизвестная область",
    },
    {
      label: "Оператор",
      code: operatorCode || "—",
      description: operatorMap[operatorCode] ?? "неизвестный оператор",
    },
    {
      label: "Интенсивность",
      code: intensityCode || "—",
      description: intensityMap[intensityCode] ?? "интенсивность не определена",
    },
    {
      label: "Психология",
      code: psychologyCode || "—",
      description: psychologyMap[psychologyCode] ?? `модулятор ${psychologyCode || "—"}`,
    },
    {
      label: "Паттерн",
      code: patternCode || "—",
      description: patternMap[patternCode] ?? "паттерн не определён",
    },
    ...(hashPart
      ? [{
          label: "Хэш",
          code: hashPart,
          description: "контрольный хвост формулы",
        }]
      : []),
  ];
}

function decodeCrystalCodeV2(code: string) {
  const [main = code, hash = ""] = code.split("-", 2);
  const body = main.replace(/[^A-Za-z]/g, "").toUpperCase();

  const scienceMap: Record<string, string> = {
    M: "математика",
    L: "логика",
    G: "геометрия",
    P: "физика",
    S: "психология",
    T: "мышление",
    D: "данные",
    I: "информация",
    C: "время / пространство",
    W: "методы словообразования",
    R: "принципы словообразования",
    Q: "квантовые состояния",
    F: "фрактальные структуры",
  };

  const operatorMap: Record<string, string> = {
    E: "экстраполяция / возведение в степень",
    I: "интерполяция / интегрирование",
    A: "аппроксимация / сложение",
    X: "комбинаторное умножение",
    R: "редукция / извлечение корня",
    F: "фильтрация",
    D: "дифференцирование",
    Q: "производная второго порядка",
    J: "двойной интеграл",
    N: "отрицание",
    C: "конъюнкция",
    O: "дизъюнкция",
    W: "волновой оператор",
    U: "оператор эволюции",
    M: "морфемный синтез",
    K: "контаминация",
  };

  const intensityMap: Record<string, string> = {
    H: "высокая степень",
    L: "низкая / корни",
    Z: "нулевая / обнуление",
    C: "комплексная",
    W: "волновая",
    Q: "квадратичная",
    N: "обычная интенсивность",
  };

  const psychologyMap: Record<string, string> = {
    C: "сомнение",
    N: "интуиция",
    R: "рефлексия",
    D: "диссонанс",
    P: "проекция",
    U: "уверенность",
    I: "инверсия восприятия",
    "0": "без психологического модулятора",
  };

  const patternMap: Record<string, string> = {
    S: "простой / линейный",
    T: "вложенный",
    Q: "квадратичный / многомерный",
    V: "интегральный / глубокий вложенный",
    Y: "голографический",
    P: "степенной / парадоксальный",
    D: "динамический",
    L: "петлевой",
    F: "фрактальный",
    K: "квантовый",
    R: "рефлексивный",
  };

  const science = body.slice(0, 1) || "—";
  const operator = body.slice(1, 2) || "—";
  const intensity = body.slice(2, 3) || "—";
  const psychology = body.slice(3, 4) || "—";
  const pattern = body.slice(4, 5) || "—";

  return [
    { label: "Наука", code: science, description: scienceMap[science] ?? "неизвестная область" },
    { label: "Оператор", code: operator, description: operatorMap[operator] ?? "неизвестный оператор" },
    { label: "Интенсивность", code: intensity, description: intensityMap[intensity] ?? "интенсивность не определена" },
    { label: "Психология", code: psychology, description: psychologyMap[psychology] ?? "неизвестный модулятор" },
    { label: "Паттерн", code: pattern, description: patternMap[pattern] ?? "неизвестный паттерн" },
    ...(hash ? [{ label: "Хэш", code: hash, description: "контрольный хвост формулы" }] : []),
  ];
}
