"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Loader2, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildCrystalPreviewText, buildCrystalQueryText } from "@/lib/rag-v2/crystal-query";

type CrystalListItem = {
  id: string;
  code: string;
  type: string | null;
  category: string | null;
  focus: string | null;
  pattern: string | null;
  combination: string;
  combinationShort: string;
  qualityScore: number | null;
  complexity: number | null;
  counter: number | null;
  similarity?: number | null;
};

type CrystalDetailResponse = {
  ok: boolean;
  crystal: {
    id: string;
    code: string;
    type: string | null;
    category: string | null;
    focus: string | null;
    pattern: string | null;
    combination: string | null;
    llmMicroNote: string | null;
    vectorDirection: string | null;
    elements: unknown[];
    operators: unknown[];
    metrics: Record<string, unknown>;
  };
};

type CrystalListResponse = {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  items: CrystalListItem[];
};

const PAGE_SIZE = 12;

export function MetaCrystalPickerDialog(props: {
  targetLabel: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [semantic, setSemantic] = useState(true);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CrystalListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<CrystalDetailResponse["crystal"] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadPage({
      search: appliedSearch,
      page,
      semantic,
      currentSelectedId: selectedId,
      setItems,
      setTotal,
      setLoadError,
      setLoading,
      setSelectedId,
    });
  }, [appliedSearch, open, page, semantic]);

  useEffect(() => {
    const effectiveSelectedId =
      selectedId && items.some((item) => item.id === selectedId)
        ? selectedId
        : (items[0]?.id ?? "");

    if (!open || !effectiveSelectedId) {
      return;
    }

    void loadDetail(effectiveSelectedId, setDetail, setDetailLoading, setDetailError);
  }, [items, open, selectedId]);

  const selectedItem = useMemo(
    () =>
      items.find((item) => item.id === selectedId) ??
      items[0] ??
      null,
    [items, selectedId],
  );
  const previewSource = detail && detail.id === selectedItem?.id ? detail : selectedItem;
  const previewText = previewSource ? buildCrystalPreviewText(previewSource) : "";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPage(1);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Database className="size-4" />
          Use crystal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-primary" />
            Meta-crystal seed for {props.targetLabel}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick any crystal from the current library and convert it into a compact semantic seed for the query field.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="border-b border-border/60 p-4 lg:border-b-0 lg:border-r">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Input
                  value={searchDraft}
                  placeholder="Search 6000+ crystals by code, focus, combination..."
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setPage(1);
                      setAppliedSearch(searchDraft.trim());
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                onClick={() => {
                  setPage(1);
                  setAppliedSearch(searchDraft.trim());
                }}
              >
                <Search className="size-4" />
                Search
              </Button>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={semantic}
                  onCheckedChange={(checked) => {
                    setPage(1);
                    setSemantic(checked === true);
                  }}
                  aria-label="Use semantic search"
                />
                Semantic
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">total: {total}</Badge>
              <Badge variant="outline">page: {page}/{totalPages}</Badge>
              {appliedSearch ? <Badge variant="secondary">query: {appliedSearch}</Badge> : null}
            </div>

            <ScrollArea className="mt-4 h-[55vh] pr-3">
              <div className="space-y-2">
                {loading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading crystals...
                  </div>
                ) : null}

                {!loading && loadError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-xs text-destructive">
                    {loadError}
                  </div>
                ) : null}

                {!loading && !loadError && items.length === 0 ? (
                  <div className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                    No crystals found for the current filter.
                  </div>
                ) : null}

                {items.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? "border-primary/60 bg-primary/8"
                          : "border-border/60 bg-background/40 hover:bg-muted/30"
                      }`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs text-foreground">{item.code}</div>
                          <div className="mt-1 text-sm text-foreground/90">
                            {item.focus || item.pattern || item.category || "Untitled crystal"}
                          </div>
                        </div>
                        {typeof item.similarity === "number" ? (
                          <Badge variant="secondary">{item.similarity.toFixed(3)}</Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                        {item.combinationShort || item.combination}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>

          <div className="p-4">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-primary" />
                Crystal seed preview
              </div>

              {detailLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Building semantic preview...
                </div>
              ) : detailError ? (
                <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-xs text-destructive">
                  {detailError}
                </div>
              ) : previewSource ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {"code" in previewSource && previewSource.code ? <Badge variant="outline">{previewSource.code}</Badge> : null}
                    {"type" in previewSource && previewSource.type ? <Badge variant="outline">{previewSource.type}</Badge> : null}
                    {"category" in previewSource && previewSource.category ? <Badge variant="outline">{previewSource.category}</Badge> : null}
                  </div>
                  <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/20 p-3 text-xs leading-5 text-foreground/90">
                    {previewText}
                  </pre>
                </>
              ) : (
                <div className="mt-4 text-sm text-muted-foreground">
                  Select a crystal to preview the generated query seed.
                </div>
              )}
            </div>

            <Button
              type="button"
              className="mt-4 w-full"
              disabled={!previewSource}
              onClick={() => {
                if (!previewSource) {
                  return;
                }
                props.onSelect(buildCrystalQueryText(previewSource));
                setOpen(false);
              }}
            >
              <Sparkles className="size-4" />
              Insert into {props.targetLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function loadPage(
  options: {
    search: string;
    page: number;
    semantic: boolean;
    currentSelectedId: string;
    setItems: (items: CrystalListItem[]) => void;
    setTotal: (total: number) => void;
    setLoadError: (value: string | null) => void;
    setLoading: (value: boolean) => void;
    setSelectedId: (value: string) => void;
  },
) {
  options.setLoading(true);
  options.setLoadError(null);

  try {
    const params = new URLSearchParams({
      page: String(options.page),
      pageSize: String(PAGE_SIZE),
    });

    if (options.search) {
      params.set("search", options.search);
      if (options.semantic) {
        params.set("semantic", "1");
      }
    }

    const response = await fetch(`/api/crystals?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as CrystalListResponse;
    const nextItems = payload.items ?? [];
    options.setItems(nextItems);
    options.setTotal(payload.total ?? 0);
    options.setLoading(false);
    if (!nextItems.some((item) => item.id === options.currentSelectedId)) {
      options.setSelectedId(nextItems[0]?.id ?? "");
    }
  } catch (error) {
    options.setItems([]);
    options.setTotal(0);
    options.setLoading(false);
    options.setLoadError(error instanceof Error ? error.message : String(error));
  }
}

async function loadDetail(
  id: string,
  setDetail: (value: CrystalDetailResponse["crystal"] | null) => void,
  setDetailLoading: (value: boolean) => void,
  setDetailError: (value: string | null) => void,
) {
  setDetailLoading(true);
  setDetailError(null);

  try {
    const response = await fetch(`/api/crystals/${id}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as CrystalDetailResponse;
    setDetail(payload.crystal);
    setDetailLoading(false);
  } catch (error) {
    setDetail(null);
    setDetailLoading(false);
    setDetailError(error instanceof Error ? error.message : String(error));
  }
}
