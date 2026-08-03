"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Database, FileText, Loader2, Search, Sparkles } from "@/components/icons";
import { apiPost, useFetch } from "@/hooks/use-fetch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TorusCanvas } from "@/components/torus/TorusCanvas";
import { COLOR_PRESETS, META_PRESETS, SHAPE_PRESETS, WARP_PRESETS, type SurfaceType, type TorusData } from "@/lib/torus/TorusCanvasRenderer";
import type { TorusAtlasAppendResult, TorusAtlasCrystal, TorusAtlasDiagnosticResult, TorusAtlasFullRebuildJob, TorusAtlasListResponse, TorusAtlasSelectionResponse, TorusAtlasWorkingSet } from "@/types/torus-atlas";
import type { GwCrystalPoolActionDefinition, GwCrystalPoolActionId, GwCrystalPoolActionResponse } from "@/types/gw-collapser-pool";

const CLUSTER_COLORS = [
  "#00BFFF",
  "#FFD700",
  "#FF6B9D",
  "#7CFC00",
  "#FF8C00",
  "#9370DB",
  "#00FA9A",
  "#FF4500",
  "#1E90FF",
  "#DAA520",
];

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0s";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function TorusAtlas() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [emeraldsOnly, setEmeraldsOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [detailCrystal, setDetailCrystal] = useState<TorusAtlasCrystal | null>(null);
  const [runningAction, setRunningAction] = useState<GwCrystalPoolActionId | null>(null);
  const [actionResult, setActionResult] = useState<GwCrystalPoolActionResponse | null>(null);
  const [torusDialogOpen, setTorusDialogOpen] = useState(false);
  const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false);
  const [fullRebuildDialogOpen, setFullRebuildDialogOpen] = useState(false);
  const [bulkSelectDialogOpen, setBulkSelectDialogOpen] = useState(false);
  const [jobLogsDialogOpen, setJobLogsDialogOpen] = useState(false);
  const [selectedDrawerOpen, setSelectedDrawerOpen] = useState(false);
  const [rebuildRunning, setRebuildRunning] = useState(false);
  const [fullRebuildStarting, setFullRebuildStarting] = useState(false);
  const [fullRebuildMutating, setFullRebuildMutating] = useState<null | "pause" | "resume" | "restart" | "discard">(null);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [appendRunning, setAppendRunning] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{
    total: number;
    scope: "all" | "selected";
    layoutKey: string;
    clusters: number;
  } | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<TorusAtlasDiagnosticResult | null>(null);
  const [layoutFilterKey, setLayoutFilterKey] = useState("__auto__");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [selectedViewPage, setSelectedViewPage] = useState(1);
  const [selectedViewData, setSelectedViewData] = useState<TorusAtlasListResponse | null>(null);
  const [selectedViewLoading, setSelectedViewLoading] = useState(false);
  const [torusItemsData, setTorusItemsData] = useState<TorusAtlasListResponse | null>(null);
  const [torusItemsLoading, setTorusItemsLoading] = useState(false);
  const [bulkLimit, setBulkLimit] = useState<100 | 200 | 1000 | "all">(100);
  const [bulkRuleMode, setBulkRuleMode] = useState<"filter" | "layout" | "semantic" | "torus" | "duplicates">("filter");
  const [workingSetName, setWorkingSetName] = useState("");
  const [workingSetMutating, setWorkingSetMutating] = useState(false);
  const [jobLogs, setJobLogs] = useState<{ progress: string; errors: string }>({ progress: "", errors: "" });
  const [metaPreset, setMetaPreset] = useState("Aurora Horn");
  const [shapePreset, setShapePreset] = useState("Horn Torus");
  const [colorPreset, setColorPreset] = useState("Aurora Borealis");
  const [warpPreset, setWarpPreset] = useState("No Warp");
  const [surfaceType, setSurfaceType] = useState<SurfaceType>("wireframe");
  const [mouseRotation, setMouseRotation] = useState(true);
  const [xSpeed, setXSpeed] = useState(0);
  const [ySpeed, setYSpeed] = useState(0);
  const [zSpeed, setZSpeed] = useState(0);
  const [displayRadiusMajor, setDisplayRadiusMajor] = useState(10);
  const [displayRadiusMinor, setDisplayRadiusMinor] = useState(10);
  const [lockRadii, setLockRadii] = useState(false);
  const [collapseFactor, setCollapseFactor] = useState(0);
  const [showCanvasControls, setShowCanvasControls] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [clusterMode, setClusterMode] = useState<"torus" | "semantic">("torus");
  const [enabledClusters, setEnabledClusters] = useState<number[]>([]);
  const [torusWindowSize, setTorusWindowSize] = useState<number | "all">("all");
  const [torusOffset, setTorusOffset] = useState(0);
  const [expandRelatedNodes, setExpandRelatedNodes] = useState(false);
  const [showSearchMatchesOnly, setShowSearchMatchesOnly] = useState(false);
  const [showSearchMatchesWithNeighbors, setShowSearchMatchesWithNeighbors] = useState(false);
  const [rebuildScope, setRebuildScope] = useState<"all" | "selected">("all");
  const [torusParams, setTorusParams] = useState({
    document_mode: "combination_only" as "combination_only" | "full",
    n_clusters: 5,
    max_steps: 100,
    dt: 0.02,
    friction: 0.01,
    epsilon: 0.15,
    tol_speed: 0.001,
    geometry_R: 1.2,
    geometry_r: 0.6,
  });
  const [rebuildParams, setRebuildParams] = useState({
    n_clusters: 32,
    max_steps: 100,
    dt: 0.02,
    friction: 0.01,
    epsilon: 0.15,
    tol_speed: 0.001,
    geometry_R: 1.2,
    geometry_r: 0.6,
  });
  const [fullRebuildParams, setFullRebuildParams] = useState({
    n_clusters: 32,
    max_steps: 100,
    dt: 0.02,
    friction: 0.01,
    epsilon: 0.15,
    tol_speed: 0.001,
    geometry_R: 1.2,
    geometry_r: 0.6,
    batch_size: 10,
  });
  const { toast } = useToast();

  const atlasUrl = showOnlySelected
    ? null
    : `/api/torus-atlas/crystals?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}&emeralds=${emeraldsOnly ? "1" : "0"}`;
  const { data, loading, refresh } = useFetch<TorusAtlasListResponse>(atlasUrl);
  const { data: actionsData } = useFetch<{ ok: boolean; actions: GwCrystalPoolActionDefinition[] }>("/api/torus-atlas/actions");
  const { data: workingSetsData, refresh: refreshWorkingSets } = useFetch<{ ok: boolean; items: TorusAtlasWorkingSet[] }>("/api/torus-atlas/working-sets");
  const { data: logsData, refresh: refreshLogs } = useFetch<{ ok: boolean; progress: string; errors: string }>(jobLogsDialogOpen ? "/api/torus-atlas/rebuild-full/logs" : null);
  const {
    data: fullRebuildJob,
    refresh: refreshFullRebuildJob,
  } = useFetch<TorusAtlasFullRebuildJob>("/api/torus-atlas/rebuild-full");

  const activeData = showOnlySelected ? selectedViewData : data;
  const items = activeData?.items ?? [];
  const actions = actionsData?.actions ?? [];
  const workingSets = workingSetsData?.items ?? [];
  const totalPages = activeData?.totalPages ?? 1;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedSet.has(item.id));
  const visibleLayoutKeys = useMemo(
    () => [...new Set(items.map((item) => item.layoutKey).filter(Boolean))].sort(),
    [items],
  );
  const selectedVisibleLayoutKeys = useMemo(
    () => [...new Set(items.filter((item) => selectedSet.has(item.id)).map((item) => item.layoutKey).filter(Boolean))].sort(),
    [items, selectedSet],
  );
  const dominantVisibleLayoutKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.layoutKey) continue;
      counts.set(item.layoutKey, (counts.get(item.layoutKey) ?? 0) + 1);
    }
    let winner = "";
    let winnerCount = -1;
    for (const [key, count] of counts.entries()) {
      if (count > winnerCount) {
        winner = key;
        winnerCount = count;
      }
    }
    return winner;
  }, [items]);
  const autoLayoutKey = useMemo(() => {
    if (selectedVisibleLayoutKeys.length === 1) return selectedVisibleLayoutKeys[0];
    if (rebuildResult?.layoutKey && visibleLayoutKeys.includes(rebuildResult.layoutKey)) return rebuildResult.layoutKey;
    if (fullRebuildJob?.layoutKey && visibleLayoutKeys.includes(fullRebuildJob.layoutKey)) return fullRebuildJob.layoutKey;
    if (dominantVisibleLayoutKey) return dominantVisibleLayoutKey;
    return visibleLayoutKeys[0] ?? "";
  }, [selectedVisibleLayoutKeys, rebuildResult, fullRebuildJob, visibleLayoutKeys, dominantVisibleLayoutKey]);
  const activeLayoutKey = layoutFilterKey === "__auto__" ? autoLayoutKey : layoutFilterKey;
  const torusSourceItems = torusItemsData?.items ?? items;
  const compatibleItems = useMemo(
    () => (activeLayoutKey ? torusSourceItems.filter((item) => item.layoutKey === activeLayoutKey) : torusSourceItems),
    [torusSourceItems, activeLayoutKey],
  );
  const availableClusters = useMemo(
    () => [...new Set(compatibleItems.map((item) => (clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel)))].sort((a, b) => a - b),
    [clusterMode, compatibleItems],
  );
  const effectiveClusters = enabledClusters.length > 0 ? enabledClusters : availableClusters;
  const clusterFilteredItems = useMemo(
    () => compatibleItems.filter((item) => effectiveClusters.includes(clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel)),
    [clusterMode, compatibleItems, effectiveClusters],
  );
  const normalizedTorusSearch = search.trim().toLowerCase();
  const searchFilteredItems = useMemo(() => {
    if (!showSearchMatchesOnly || !normalizedTorusSearch) {
      return clusterFilteredItems;
    }
    return clusterFilteredItems.filter((item) =>
      [item.code, item.name, item.formula, item.category, item.pattern]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedTorusSearch)),
    );
  }, [clusterFilteredItems, normalizedTorusSearch, showSearchMatchesOnly]);
  const searchMatchesWithNeighborsItems = useMemo(() => {
    if (!showSearchMatchesWithNeighbors || !normalizedTorusSearch) {
      return clusterFilteredItems;
    }
    const matches = clusterFilteredItems.filter((item) =>
      [item.code, item.name, item.formula, item.category, item.pattern]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedTorusSearch)),
    );
    const visibleIds = new Set(matches.map((item) => item.id));
    const expanded = [...matches];
    const byCluster = new Map<number, TorusAtlasCrystal[]>();
    for (const item of clusterFilteredItems) {
      const label = clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel;
      const bucket = byCluster.get(label) ?? [];
      bucket.push(item);
      byCluster.set(label, bucket);
    }
    for (const item of matches) {
      const label = clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel;
      const neighbor = (byCluster.get(label) ?? []).find((candidate) => !visibleIds.has(candidate.id));
      if (!neighbor) {
        continue;
      }
      visibleIds.add(neighbor.id);
      expanded.push(neighbor);
    }
    return expanded;
  }, [clusterFilteredItems, clusterMode, normalizedTorusSearch, showSearchMatchesWithNeighbors]);
  const torusBaseItems = showSearchMatchesWithNeighbors ? searchMatchesWithNeighborsItems : searchFilteredItems;
  const slicedTorusItems = useMemo(() => {
    if (torusWindowSize === "all") {
      return torusBaseItems;
    }
    return torusBaseItems.slice(torusOffset, torusOffset + torusWindowSize);
  }, [torusBaseItems, torusOffset, torusWindowSize]);
  const torusDisplayItems = useMemo(() => {
    if (!expandRelatedNodes) {
      return slicedTorusItems;
    }
    const byCluster = new Map<number, TorusAtlasCrystal[]>();
    for (const item of torusBaseItems) {
      const label = clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel;
      const bucket = byCluster.get(label) ?? [];
      bucket.push(item);
      byCluster.set(label, bucket);
    }
    const visibleIds = new Set(slicedTorusItems.map((item) => item.id));
    const expanded = [...slicedTorusItems];
    for (const item of slicedTorusItems) {
      const label = clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel;
      const related = (byCluster.get(label) ?? []).find((candidate) => !visibleIds.has(candidate.id));
      if (!related) {
        continue;
      }
      visibleIds.add(related.id);
      expanded.push(related);
    }
    return expanded;
  }, [clusterMode, expandRelatedNodes, slicedTorusItems, torusBaseItems]);
  const hiddenIncompatibleCount = torusSourceItems.length - compatibleItems.length;
  const actionGroups = useMemo(() => ({
    analysis: actions.filter((item) => item.category === "analysis"),
    generation: actions.filter((item) => item.category === "generation"),
    visualization: actions.filter((item) => item.category === "visualization"),
  }), [actions]);
  const fullRebuildTiming = useMemo(() => {
    if (!fullRebuildJob?.startedAt) {
      return null;
    }
    const startedAt = Date.parse(fullRebuildJob.startedAt);
    const updatedAt = Date.parse(fullRebuildJob.updatedAt || fullRebuildJob.startedAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(updatedAt)) {
      return null;
    }
    const completedAt = fullRebuildJob.completedAt ? Date.parse(fullRebuildJob.completedAt) : NaN;
    const referenceTime = Number.isFinite(completedAt) ? completedAt : Date.now();
    const elapsedMs = Math.max(0, referenceTime - startedAt);
    const activeMs = Math.max(0, updatedAt - startedAt);
    let etaLabel = "estimating";
    if (fullRebuildJob.status === "completed") {
      etaLabel = "done";
    } else if (fullRebuildJob.status === "failed") {
      etaLabel = "n/a";
    } else if (fullRebuildJob.status === "paused") {
      etaLabel = "paused";
    } else if (fullRebuildJob.processed > 0 && activeMs > 0 && fullRebuildJob.total > fullRebuildJob.processed) {
      const rate = fullRebuildJob.processed / activeMs;
      if (rate > 0) {
        etaLabel = formatDuration((fullRebuildJob.total - fullRebuildJob.processed) / rate);
      }
    }
    return {
      elapsedLabel: formatDuration(elapsedMs),
      etaLabel,
    };
  }, [fullRebuildJob]);
  const fullRebuildProgress = useMemo(() => {
    if (!fullRebuildJob) return 0;
    if (fullRebuildJob.status === "analyzing") {
      return fullRebuildJob.analysisPercent;
    }
    if (fullRebuildJob.total > 0) {
      return Math.max(0, Math.min(100, (fullRebuildJob.processed / fullRebuildJob.total) * 100));
    }
    return 0;
  }, [fullRebuildJob]);
  const nextCheckpointRemaining = useMemo(() => {
    if (!fullRebuildJob || fullRebuildJob.status !== "persisting" || fullRebuildJob.batchSize <= 0) {
      return 0;
    }
    const remainder = fullRebuildJob.processed % fullRebuildJob.batchSize;
    return remainder === 0 ? fullRebuildJob.batchSize : fullRebuildJob.batchSize - remainder;
  }, [fullRebuildJob]);
  const selectionSummary = useMemo(() => {
    const selectionItems = items.filter((item) => selectedSet.has(item.id));
    const distribution = new Map<string, number>();
    for (const item of selectionItems) {
      const key = item.layoutKey || "no-layout";
      distribution.set(key, (distribution.get(key) ?? 0) + 1);
    }
    return {
      selectedCount: selectedIds.length,
      layoutDistribution: [...distribution.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    };
  }, [items, selectedIds.length, selectedSet]);

  const torusData = useMemo<TorusData>(() => {
    const nodes = torusDisplayItems.map((item) => ({
      id: item.id,
      u: item.torusU,
      v: item.torusV,
      color: CLUSTER_COLORS[(clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel) % CLUSTER_COLORS.length] ?? "#ffffff",
      size: item.isEmerald ? 5 : 3,
      label: item.name,
      mass: 1,
      flow_speed: 0,
    }));

    const byCluster = new Map<number, TorusAtlasCrystal[]>();
    for (const item of torusDisplayItems) {
      const activeCluster = clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel;
      const bucket = byCluster.get(activeCluster) ?? [];
      bucket.push(item);
      byCluster.set(activeCluster, bucket);
    }

    const edges: TorusData["edges"] = [];
    for (const bucket of byCluster.values()) {
      for (let index = 1; index < bucket.length; index += 1) {
        edges.push({
          source: bucket[index - 1].id,
          target: bucket[index].id,
          intensity: 0.5,
        });
      }
    }

    return {
      nodes,
      edges,
      torus_state: {
        R: torusDisplayItems[0]?.torusGeometryR ?? compatibleItems[0]?.torusGeometryR ?? 1.2,
        r: torusDisplayItems[0]?.torusGeometryr ?? compatibleItems[0]?.torusGeometryr ?? 0.6,
        collapse_factor: collapseFactor,
        twist: 0.02,
      },
    };
  }, [compatibleItems, collapseFactor, clusterMode, torusDisplayItems]);

  const hoveredCrystal = torusSourceItems.find((item) => item.id === hoveredId) ?? null;

  useEffect(() => {
    if (!showOnlySelected) return;
    let cancelled = false;
    setSelectedViewLoading(true);
    apiPost<TorusAtlasListResponse>("/api/torus-atlas/selection-items", {
      ids: selectedIds,
      page: selectedViewPage,
      pageSize,
    }).then((response) => {
      if (!cancelled) setSelectedViewData(response);
    }).catch(() => {
      if (!cancelled) setSelectedViewData({ ok: true, total: 0, page: 1, pageSize, totalPages: 1, items: [] });
    }).finally(() => {
      if (!cancelled) setSelectedViewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showOnlySelected, selectedIds, selectedViewPage, pageSize]);

  useEffect(() => {
    if (showOnlySelected) {
      if (!selectedIds.length) {
        setTorusItemsData(selectedViewData);
        return;
      }
      let cancelled = false;
      setTorusItemsLoading(true);
      fetch(
        `/api/torus-atlas/crystals?all=1&page=1&pageSize=20000&ids=${encodeURIComponent(selectedIds.join(","))}`
      )
        .then(async (response) => {
          if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text || `HTTP ${response.status}`);
          }
          return response.json() as Promise<TorusAtlasListResponse>;
        })
        .then((payload) => {
          if (!cancelled) setTorusItemsData(payload);
        })
        .catch(() => {
          if (!cancelled) setTorusItemsData(selectedViewData);
        })
        .finally(() => {
          if (!cancelled) setTorusItemsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (!activeLayoutKey) {
      setTorusItemsData(data ?? null);
      return;
    }
    let cancelled = false;
    setTorusItemsLoading(true);
    fetch(
      `/api/torus-atlas/crystals?all=1&page=1&pageSize=20000&layoutKey=${encodeURIComponent(activeLayoutKey)}&emeralds=${emeraldsOnly ? "1" : "0"}`
    )
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `HTTP ${response.status}`);
        }
        return response.json() as Promise<TorusAtlasListResponse>;
      })
      .then((payload) => {
        if (!cancelled) setTorusItemsData(payload);
      })
      .catch(() => {
        if (!cancelled) setTorusItemsData(data ?? null);
      })
      .finally(() => {
        if (!cancelled) setTorusItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLayoutKey, data, emeraldsOnly, selectedIds, selectedViewData, showOnlySelected]);

  useEffect(() => {
    if (!logsData) return;
    setJobLogs({
      progress: logsData.progress ?? "",
      errors: logsData.errors ?? "",
    });
  }, [logsData]);

  useEffect(() => {
    if (layoutFilterKey !== "__auto__" && layoutFilterKey && !visibleLayoutKeys.includes(layoutFilterKey)) {
      setLayoutFilterKey("__auto__");
    }
  }, [layoutFilterKey, visibleLayoutKeys]);

  useEffect(() => {
    setEnabledClusters((prev) => {
      const next = prev.filter((label) => availableClusters.includes(label));
      if (next.length > 0) {
        return next;
      }
      return availableClusters;
    });
  }, [availableClusters]);

  useEffect(() => {
    if (torusWindowSize === "all") {
      if (torusOffset !== 0) {
        setTorusOffset(0);
      }
      return;
    }
    const maxOffset = Math.max(0, torusBaseItems.length - torusWindowSize);
    if (torusOffset > maxOffset) {
      setTorusOffset(maxOffset);
    }
  }, [torusBaseItems.length, torusOffset, torusWindowSize]);

  useEffect(() => {
    if (!normalizedTorusSearch && (showSearchMatchesOnly || showSearchMatchesWithNeighbors)) {
      setShowSearchMatchesOnly(false);
      setShowSearchMatchesWithNeighbors(false);
    }
  }, [normalizedTorusSearch, showSearchMatchesOnly, showSearchMatchesWithNeighbors]);

  useEffect(() => {
    if (!fullRebuildJob) return;
    if (!["preparing", "analyzing", "persisting"].includes(fullRebuildJob.status)) {
      if (fullRebuildJob.status === "completed") {
        refresh();
      }
      return;
    }
    const timer = window.setInterval(() => {
      refreshFullRebuildJob();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [fullRebuildJob, refresh, refreshFullRebuildJob]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !items.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...items.map((item) => item.id)])]);
  };

  const toggleCluster = (cluster: number, checked: boolean) => {
    setEnabledClusters((prev) => {
      if (checked) {
        return prev.includes(cluster) ? prev : [...prev, cluster].sort((a, b) => a - b);
      }
      return prev.filter((item) => item !== cluster);
    });
    setTorusOffset(0);
  };

  const shiftTorusOffset = (delta: number, forceWindow?: number) => {
    const nextWindow = forceWindow ?? torusWindowSize;
    const effectiveWindow = nextWindow === "all" ? searchFilteredItems.length || 1 : nextWindow;
    const maxOffset = Math.max(0, searchFilteredItems.length - effectiveWindow);
    const nextOffset = Math.max(0, Math.min(torusOffset + delta, maxOffset));
    if (forceWindow) {
      setTorusWindowSize(forceWindow);
    }
    setTorusOffset(nextOffset);
  };

  const applyBulkSelection = async (mode: "replace" | "append") => {
    setBulkSelecting(true);
    try {
      const response = await apiPost<TorusAtlasSelectionResponse>("/api/torus-atlas/selection", {
        search,
        emeralds: emeraldsOnly,
        limit: bulkLimit,
        ...(bulkRuleMode === "layout" && activeLayoutKey ? { layoutKey: activeLayoutKey } : {}),
        ...(bulkRuleMode === "semantic" ? { semanticClusterLabel: compatibleItems[0]?.semanticClusterLabel ?? 0 } : {}),
        ...(bulkRuleMode === "torus" ? { torusClusterLabel: compatibleItems[0]?.torusClusterLabel ?? 0 } : {}),
        ...(bulkRuleMode === "duplicates" ? { duplicatesOnly: true } : {}),
      });
      setSelectedIds((prev) => {
        if (mode === "replace") return response.ids;
        return [...new Set([...prev, ...response.ids])];
      });
      setBulkSelectDialogOpen(false);
      toast({
        title: "Bulk Selection",
        description: `Selected ${response.selectedCount} of ${response.total} matching crystals.`,
      });
    } catch (error) {
      toast({
        title: "Bulk Selection",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBulkSelecting(false);
    }
  };

  const saveWorkingSet = async () => {
    setWorkingSetMutating(true);
    try {
      await apiPost("/api/torus-atlas/working-sets", {
        name: workingSetName,
        ids: selectedIds,
      });
      setWorkingSetName("");
      refreshWorkingSets();
      toast({
        title: "Working Set",
        description: "Selection saved.",
      });
    } catch (error) {
      toast({
        title: "Working Set",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setWorkingSetMutating(false);
    }
  };

  const deleteWorkingSet = async (id: string) => {
    setWorkingSetMutating(true);
    try {
      await fetch(`/api/torus-atlas/working-sets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      refreshWorkingSets();
    } finally {
      setWorkingSetMutating(false);
    }
  };

  const runIncrementalAppend = async () => {
    setAppendRunning(true);
    try {
      const response = await apiPost<TorusAtlasAppendResult>("/api/torus-atlas/append", {});
      refresh();
      refreshFullRebuildJob();
      toast({
        title: "Incremental Atlas Append",
        description: `Appended ${response.appended} crystals to ${response.baseLayoutKey}.`,
      });
    } catch (error) {
      toast({
        title: "Incremental Atlas Append",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setAppendRunning(false);
    }
  };

  const runAction = async (action: GwCrystalPoolActionDefinition) => {
    if (!selectedIds.length) {
      toast({
        title: "No selection",
        description: "Select at least one crystal in Torus Atlas before running actions.",
        variant: "destructive",
      });
      return;
    }

    if (action.id === "torus_flow") {
      setTorusDialogOpen(true);
      return;
    }

    setRunningAction(action.id);
    try {
      const response = await apiPost<GwCrystalPoolActionResponse>(`/api/torus-atlas/actions/${action.id}`, {
        crystalIds: selectedIds,
        params: {
          document_mode: "combination_only",
        },
      });
      setActionResult(response);
      refresh();
      toast({
        title: action.name,
        description: `Processed: ${response.affectedCount}`,
      });
    } catch (error) {
      toast({
        title: action.name,
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const runTorusFlowWithParams = async () => {
    setRunningAction("torus_flow");
    try {
      const response = await apiPost<GwCrystalPoolActionResponse>("/api/torus-atlas/actions/torus_flow", {
        crystalIds: selectedIds,
        params: torusParams,
      });
      setActionResult(response);
      setTorusDialogOpen(false);
      refresh();
      toast({
        title: "TorusFlow GWCollapser",
        description: `Processed: ${response.affectedCount}`,
      });
    } catch (error) {
      toast({
        title: "TorusFlow GWCollapser",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRunningAction(null);
    }
  };

  const runGlobalAtlasRebuild = async () => {
    setRebuildRunning(true);
    try {
      const response = await apiPost<{
        ok: true;
        total: number;
        scope: "all" | "selected";
        layoutKey: string;
        clusters: number;
      }>("/api/torus-atlas/rebuild", {
        crystalIds: rebuildScope === "selected" ? selectedIds : [],
        ...rebuildParams,
      });
      setRebuildResult(response);
      setRebuildDialogOpen(false);
      refresh();
      toast({
        title: "Global atlas rebuild",
        description: `Processed ${response.total} crystals in ${response.scope} scope.`,
      });
    } catch (error) {
      toast({
        title: "Global atlas rebuild",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setRebuildRunning(false);
    }
  };

  const runFullAtlasRebuild = async () => {
    setFullRebuildStarting(true);
    try {
      await apiPost<{ ok: true; job: TorusAtlasFullRebuildJob }>("/api/torus-atlas/rebuild-full", fullRebuildParams);
      setFullRebuildDialogOpen(false);
      refreshFullRebuildJob();
      toast({
        title: "Rebuild Full Atlas",
        description: "Started global atlas rebuild in background. Progress panel will update automatically.",
      });
    } catch (error) {
      toast({
        title: "Rebuild Full Atlas",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setFullRebuildStarting(false);
    }
  };

  const runQuickFullAtlas = async () => {
    setFullRebuildStarting(true);
    try {
      await apiPost<{ ok: true; job: TorusAtlasFullRebuildJob }>("/api/torus-atlas/rebuild-full", {
        n_clusters: 32,
        max_steps: 100,
        dt: 0.02,
        friction: 0.01,
        epsilon: 0.15,
        tol_speed: 0.001,
        geometry_R: 1.2,
        geometry_r: 0.6,
        batch_size: 10,
      });
      refreshFullRebuildJob();
      toast({
        title: "Quick Full Atlas",
        description: "Started full atlas in combination-only mode with checkpoint batches of 10.",
      });
    } catch (error) {
      toast({
        title: "Quick Full Atlas",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setFullRebuildStarting(false);
    }
  };

  const controlFullAtlasRebuild = async (action: "pause" | "resume" | "restart" | "discard") => {
    setFullRebuildMutating(action);
    try {
      await apiPost<{ ok: true; job: TorusAtlasFullRebuildJob }>("/api/torus-atlas/rebuild-full", {
        action,
        ...fullRebuildParams,
      });
      refreshFullRebuildJob();
      if (action === "restart") {
        refresh();
      }
      toast({
        title: "Full Atlas Control",
        description:
          action === "pause"
            ? "Full atlas rebuild paused."
            : action === "resume"
              ? "Full atlas rebuild resumed from checkpoint."
              : action === "restart"
                ? "Full atlas rebuild restarted."
                : "Checkpoint discarded.",
      });
    } catch (error) {
      toast({
        title: "Full Atlas Control",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setFullRebuildMutating(null);
    }
  };

  const runAtlasDiagnostic = async () => {
    if (!selectedIds.length) {
      toast({
        title: "Atlas diagnostic",
        description: "Select at least one crystal for the diagnostic slice.",
        variant: "destructive",
      });
      return;
    }
    setDiagnosticRunning(true);
    try {
      const response = await apiPost<TorusAtlasDiagnosticResult>("/api/torus-atlas/diagnostic", {
        crystalIds: selectedIds,
        n_clusters: rebuildParams.n_clusters,
        max_steps: rebuildParams.max_steps,
        dt: rebuildParams.dt,
        friction: rebuildParams.friction,
        epsilon: rebuildParams.epsilon,
        tol_speed: rebuildParams.tol_speed,
        geometry_R: rebuildParams.geometry_R,
        geometry_r: rebuildParams.geometry_r,
      });
      setDiagnosticResult(response);
      toast({
        title: "Atlas diagnostic",
        description: `Checked ${response.total} formulas, found ${response.uniqueLabels} label buckets.`,
      });
    } catch (error) {
      toast({
        title: "Atlas diagnostic",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setDiagnosticRunning(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">new section</Badge>
              <h1 className="text-xl font-semibold tracking-tight">Torus Atlas</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Canvas-first atlas view for crystal formulas and torus placement. Existing GW-Collapser sections remain untouched.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkSelectDialogOpen(true)}>
              Bulk Select
            </Button>
            <Button size="sm" variant="outline" onClick={runIncrementalAppend} disabled={appendRunning || !fullRebuildJob?.snapshotReady}>
              {appendRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Append New
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={runQuickFullAtlas}
              disabled={fullRebuildStarting || ["preparing", "analyzing", "analysis_ready", "persisting"].includes(fullRebuildJob?.status ?? "")}
            >
              {fullRebuildStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Quick Full Atlas
            </Button>
            <Button size="sm" variant="outline" onClick={runAtlasDiagnostic} disabled={diagnosticRunning || !selectedIds.length}>
              {diagnosticRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Diagnose Slice
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFullRebuildDialogOpen(true)}>
              Rebuild Full Atlas
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRebuildDialogOpen(true)}>
              Rebuild Global Atlas
            </Button>
            <Badge variant="outline">{activeData?.total ?? data?.total ?? 0} crystals</Badge>
            <Badge variant="outline">{selectedIds.length} selected</Badge>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[360px_320px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Atlas List</CardTitle>
            <CardDescription>
              Compact browse list for inspection. Bulk selection is handled separately to avoid large-list overhead near the canvas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Search by code, focus, pattern or formula"
              />
              <div className="flex w-full gap-2">
                <Button className="flex-1" variant="outline" onClick={() => { setPage(1); setSearch(draftSearch.trim()); }}>
                  <Search className="mr-2 h-4 w-4" />
                  Find
                </Button>
                <Button
                  className="flex-1"
                  variant={emeraldsOnly ? "default" : "outline"}
                  onClick={() => { setPage(1); setEmeraldsOnly((prev) => !prev); }}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Emeralds
                </Button>
                <Button size="sm" variant={showSearchMatchesWithNeighbors ? "default" : "outline"} onClick={() => { setShowSearchMatchesWithNeighbors((prev) => { const next = !prev; if (next) setShowSearchMatchesOnly(false); return next; }); setTorusOffset(0); }} disabled={!normalizedTorusSearch}>
                  Найденное + соседи
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <div>Page {showOnlySelected ? selectedViewPage : page} / {totalPages}</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant={showOnlySelected ? "default" : "outline"} onClick={() => { setShowOnlySelected((prev) => !prev); setSelectedViewPage(1); }}>
                  {showOnlySelected ? "Selected View" : "Browse View"}
                </Button>
                {[12, 24, 48].map((value) => (
                  <Button key={value} size="sm" variant={pageSize === value ? "default" : "outline"} onClick={() => { setPage(1); setSelectedViewPage(1); setPageSize(value); }}>
                    {value}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={(value) => toggleVisible(Boolean(value))} />
                    </TableHead>
                    <TableHead>Crystal</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead>V</TableHead>
                    <TableHead>QEC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showOnlySelected ? selectedViewLoading : loading) && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                        Loading atlas crystals...
                      </TableCell>
                    </TableRow>
                  )}
                  {!(showOnlySelected ? selectedViewLoading : loading) && items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No atlas rows for the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      data-state={selectedSet.has(item.id) ? "selected" : undefined}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox checked={selectedSet.has(item.id)} onCheckedChange={() => toggleId(item.id)} />
                      </TableCell>
                      <TableCell>
                        <button className="text-left" onClick={() => setDetailCrystal(item)}>
                          <div className="font-medium">{item.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.code}</div>
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: CLUSTER_COLORS[(clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel) % CLUSTER_COLORS.length] }}
                          />
                          <span>{clusterMode === "torus" ? item.torusClusterLabel : item.semanticClusterLabel}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatMetric(item.metrics.V)}</TableCell>
                      <TableCell>{formatMetric(item.metrics.QEC)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={(showOnlySelected ? selectedViewPage : page) <= 1}
                onClick={() => showOnlySelected
                  ? setSelectedViewPage((prev) => Math.max(1, prev - 1))
                  : setPage((prev) => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={(showOnlySelected ? selectedViewPage : page) >= totalPages}
                onClick={() => showOnlySelected
                  ? setSelectedViewPage((prev) => Math.min(totalPages, prev + 1))
                  : setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="min-h-0 space-y-4">
          {selectionSummary && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Selection Summary</CardTitle>
                <CardDescription>
                  Working selection is independent from the currently rendered page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectionSummary.selectedCount} selected</Badge>
                  <Badge variant="outline">{showOnlySelected ? "selected-only view" : "browse view"}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectionSummary.layoutDistribution.length ? selectionSummary.layoutDistribution.slice(0, 6).map((item) => (
                    <Badge key={`layout-summary-${item.key}`} variant="outline">
                      {item.key}: {item.count}
                    </Badge>
                  )) : <span className="text-muted-foreground">No selected items on the current list snapshot.</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!selectedIds.length} onClick={() => setShowOnlySelected(true)}>
                    Show Only Selected
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selectedIds.length} onClick={() => setSelectedDrawerOpen(true)}>
                    Open Drawer
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>
                    Clear Selection
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input value={workingSetName} onChange={(event) => setWorkingSetName(event.target.value)} placeholder="Save selection as working set" />
                  <Button size="sm" variant="outline" disabled={!selectedIds.length || !workingSetName.trim() || workingSetMutating} onClick={saveWorkingSet}>
                    Save Set
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Working Sets</CardTitle>
              <CardDescription>
                Persist and reload large selections without depending on current paging.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!workingSets.length ? (
                <div className="text-sm text-muted-foreground">No saved working sets.</div>
              ) : (
                workingSets.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.ids.length} items</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelectedIds(item.ids)}>Load</Button>
                      <Button size="sm" variant="outline" disabled={workingSetMutating} onClick={() => deleteWorkingSet(item.id)}>Delete</Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Canvas Controls</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowCanvasControls((prev) => !prev)}>
                  {showCanvasControls ? "Hide" : "Show"}
                </Button>
              </div>
              <CardDescription>
                Demo canvas presets and renderer controls, isolated inside Torus Atlas.
              </CardDescription>
            </CardHeader>
            {showCanvasControls && (
              <CardContent className="space-y-4">
                <AtlasSelect label="Meta Preset" value={metaPreset} values={Object.keys(META_PRESETS)} onChange={(value) => setMetaPreset(value)} />
                <AtlasSelect label="Shape" value={shapePreset} values={Object.keys(SHAPE_PRESETS)} onChange={(value) => setShapePreset(value)} />
                <AtlasSelect label="Color" value={colorPreset} values={Object.keys(COLOR_PRESETS)} onChange={(value) => setColorPreset(value)} />
                <AtlasSelect label="Warp" value={warpPreset} values={Object.keys(WARP_PRESETS)} onChange={(value) => setWarpPreset(value)} />
                <AtlasSelect label="Surface" value={surfaceType} values={["wireframe", "points", "skin"]} onChange={(value) => setSurfaceType(value as SurfaceType)} />
                <div className="grid gap-3 md:grid-cols-2">
                  <NumericField label="Display Radius Major" value={displayRadiusMajor} onChange={setDisplayRadiusMajor} />
                  <NumericField label="Display Radius Minor" value={displayRadiusMinor} onChange={setDisplayRadiusMinor} />
                  <NumericField label="X Speed" value={xSpeed} onChange={setXSpeed} step="0.1" />
                  <NumericField label="Y Speed" value={ySpeed} onChange={setYSpeed} step="0.1" />
                  <NumericField label="Z Speed" value={zSpeed} onChange={setZSpeed} step="0.1" />
                  <NumericField label="Collapse" value={collapseFactor} onChange={setCollapseFactor} step="0.01" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={clusterMode === "torus" ? "default" : "outline"} onClick={() => setClusterMode("torus")}>
                    Torus Clusters
                  </Button>
                  <Button size="sm" variant={clusterMode === "semantic" ? "default" : "outline"} onClick={() => setClusterMode("semantic")}>
                    Semantic Clusters
                  </Button>
                  <Button size="sm" variant={mouseRotation ? "default" : "outline"} onClick={() => setMouseRotation((prev) => !prev)}>
                    Mouse Rotation
                  </Button>
                  <Button size="sm" variant={lockRadii ? "default" : "outline"} onClick={() => setLockRadii((prev) => !prev)}>
                    Lock Radii
                  </Button>
                  <Button size="sm" variant={showEdges ? "default" : "outline"} onClick={() => setShowEdges((prev) => !prev)}>
                    Show Edges
                  </Button>
                  <Button size="sm" variant={showLabels ? "default" : "outline"} onClick={() => setShowLabels((prev) => !prev)}>
                    Show Labels
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
          <ActionGroup title="Analysis" actions={actionGroups.analysis} runningAction={runningAction} onRun={runAction} />
          <ActionGroup title="Generation" actions={actionGroups.generation} runningAction={runningAction} onRun={runAction} />
          <ActionGroup title="Visualization" actions={actionGroups.visualization} runningAction={runningAction} onRun={runAction} />
          {fullRebuildJob && fullRebuildJob.status !== "idle" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Full Atlas Progress</CardTitle>
                <CardDescription>
                  Large rebuild runs in one shared analysis phase and persists metadata back in batches.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{fullRebuildJob.status}</Badge>
                  <Badge variant="outline">
                    {fullRebuildJob.status === "analyzing"
                      ? `${fullRebuildJob.analysisProcessed} / ${fullRebuildJob.total}`
                      : `${fullRebuildJob.processed} / ${fullRebuildJob.total}`}
                  </Badge>
                  <Badge variant="outline">{fullRebuildJob.clusters} clusters</Badge>
                  <Badge variant="outline">checkpoint {fullRebuildJob.batchSize}</Badge>
                  <Badge variant="outline">next offset {fullRebuildJob.nextOffset}</Badge>
                  <Badge variant="outline">{fullRebuildJob.snapshotReady ? "snapshot present" : "snapshot pending"}</Badge>
                  {fullRebuildTiming && <Badge variant="outline">elapsed {fullRebuildTiming.elapsedLabel}</Badge>}
                  {fullRebuildTiming && <Badge variant="outline">eta {fullRebuildTiming.etaLabel}</Badge>}
                  {fullRebuildJob.status === "persisting" && <Badge variant="outline">to checkpoint {nextCheckpointRemaining}</Badge>}
                  {fullRebuildJob.totalBatches > 0 && (
                    <Badge variant="outline">batch {fullRebuildJob.currentBatch} / {fullRebuildJob.totalBatches}</Badge>
                  )}
                </div>
                <Progress value={fullRebuildProgress} className="h-2" />
                {fullRebuildJob.status === "analyzing" && (
                  <div className="text-xs text-muted-foreground">
                    Analysis stage: {fullRebuildJob.analysisPercent}%{fullRebuildJob.analysisStep ? ` • ${fullRebuildJob.analysisStep}` : ""}
                  </div>
                )}
                {fullRebuildJob.status === "persisting" && (
                  <div className="text-xs text-muted-foreground">
                    Persist stage: batch {fullRebuildJob.currentBatch} of {fullRebuildJob.totalBatches}, next checkpoint after {nextCheckpointRemaining} items.
                  </div>
                )}
                <div className="text-muted-foreground">{fullRebuildJob.phaseMessage || "Waiting for updates."}</div>
                {fullRebuildJob.layoutKey && (
                  <div className="break-all text-xs text-muted-foreground">{fullRebuildJob.layoutKey}</div>
                )}
                {fullRebuildJob.error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                    {fullRebuildJob.error}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(fullRebuildMutating) || !["analysis_ready", "persisting"].includes(fullRebuildJob.status)}
                    onClick={() => controlFullAtlasRebuild("pause")}
                  >
                    {fullRebuildMutating === "pause" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(fullRebuildMutating) || !["paused", "analysis_ready", "failed"].includes(fullRebuildJob.status)}
                    onClick={() => controlFullAtlasRebuild("resume")}
                  >
                    {fullRebuildMutating === "resume" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(fullRebuildMutating)}
                    onClick={() => controlFullAtlasRebuild("restart")}
                  >
                    {fullRebuildMutating === "restart" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Restart
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(fullRebuildMutating) || !fullRebuildJob.id}
                    onClick={() => controlFullAtlasRebuild("discard")}
                  >
                    {fullRebuildMutating === "discard" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Discard
                  </Button>
                  <Button size="sm" variant="outline" disabled={!fullRebuildJob.id} onClick={() => { refreshLogs(); setJobLogsDialogOpen(true); }}>
                    View Logs
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {diagnosticResult && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Atlas Diagnostic</CardTitle>
                <CardDescription>
                  Raw sidecar summary for the current selected slice before a global rebuild.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{diagnosticResult.total} docs</Badge>
                  <Badge variant="outline">{diagnosticResult.uniqueCombinations} unique</Badge>
                  <Badge variant="outline">{diagnosticResult.duplicateCombinations} duplicates</Badge>
                  <Badge variant="outline">{diagnosticResult.clustersRequested} requested</Badge>
                  <Badge variant="outline">{diagnosticResult.uniqueLabels} semantic labels</Badge>
                  <Badge variant="outline">{diagnosticResult.uniqueTorusLabels} torus labels</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-border/60 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Raw Shape</div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>docs: {String(diagnosticResult.rawShape.hasDocs)} / {diagnosticResult.rawShape.docsLength}</div>
                      <div>doc_coords: {String(diagnosticResult.rawShape.hasDocCoords)} / {diagnosticResult.rawShape.docCoordsLength}</div>
                      <div>labels: {String(diagnosticResult.rawShape.hasLabels)} / {diagnosticResult.rawShape.labelsLength}</div>
                      <div>coords present: {diagnosticResult.docsWithCoords}</div>
                      <div>coords missing: {diagnosticResult.docsWithoutCoords}</div>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/60 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Semantic Histogram</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {diagnosticResult.labelHistogram.length ? diagnosticResult.labelHistogram.map((item) => (
                        <Badge key={`label-${item.label}`} variant="outline">
                          {item.label}: {item.count}
                        </Badge>
                      )) : <span className="text-xs text-muted-foreground">No labels returned.</span>}
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-border/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Torus Histogram</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {diagnosticResult.torusLabelHistogram.length ? diagnosticResult.torusLabelHistogram.map((item) => (
                      <Badge key={`torus-label-${item.label}`} variant="outline">
                        {item.label}: {item.count}
                      </Badge>
                    )) : <span className="text-xs text-muted-foreground">No torus labels generated.</span>}
                  </div>
                </div>
                <ScrollArea className="h-[220px] rounded-md border border-border/60">
                  <div className="space-y-2 p-3">
                    {diagnosticResult.layoutPreview.map((item) => (
                      <div key={`diag-${item.id}`} className="rounded-md border border-border/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{item.code}</Badge>
                          <Badge variant="outline">semantic {item.clusterLabel}</Badge>
                          <Badge variant="outline">torus {item.torusClusterLabel}</Badge>
                          <Badge variant="outline">u {item.torusU.toFixed(3)}</Badge>
                          <Badge variant="outline">v {item.torusV.toFixed(3)}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                          {truncate(item.formula, 220)}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          <Card className="min-h-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Last Atlas Action</CardTitle>
              <CardDescription>
                New section runs production pool actions through an isolated atlas proxy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rebuildResult && (
                <div className="mb-3 rounded-md border border-border/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">global atlas</Badge>
                    <Badge variant="outline">{rebuildResult.scope}</Badge>
                    <Badge variant="outline">{rebuildResult.total} crystals</Badge>
                    <Badge variant="outline">{rebuildResult.clusters} clusters</Badge>
                    <Badge variant="outline">topology clustering enabled</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground break-all">{rebuildResult.layoutKey}</div>
                </div>
              )}
              {!actionResult ? (
                <div className="text-sm text-muted-foreground">Run an atlas action to inspect typed output.</div>
              ) : (
                <ScrollArea className="h-[320px]">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{actionResult.actionName}</Badge>
                      <Badge variant="outline">{actionResult.availability}</Badge>
                      <Badge variant="outline">{actionResult.affectedCount} affected</Badge>
                    </div>
                    {actionResult.results.slice(0, 8).map((item) => (
                      <div key={`${item.id}-${item.code ?? "row"}`} className="rounded-md border border-border/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-mono text-xs break-all">{item.code ?? item.id}</div>
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">{item.summary}</div>
                      </div>
                    ))}
                    {actionResult.extra && (
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-5">
                        {JSON.stringify(actionResult.extra, null, 2)}
                      </pre>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-0">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Canvas Atlas</CardTitle>
                <CardDescription>
                  Fast canvas renderer from the demo branch, now mounted as an isolated module.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <Database className="mr-2 h-3.5 w-3.5" />
                  {torusDisplayItems.length} shown
                </Badge>
                <Badge variant="outline">{torusBaseItems.length} filtered</Badge>
                <Badge variant="outline">{compatibleItems.length} compatible</Badge>
                <Badge variant="outline">
                  <Activity className="mr-2 h-3.5 w-3.5" />
                  {activeLayoutKey ? "layout-locked" : "read-only"}
                </Badge>
                <Badge variant="outline">{clusterMode === "torus" ? "torus clusters" : "semantic clusters"}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex h-[calc(100vh-120px)] min-h-[760px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={layoutFilterKey} onValueChange={setLayoutFilterKey}>
                <SelectTrigger className="w-[360px]">
                  <SelectValue placeholder="Active layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto layout</SelectItem>
                  {visibleLayoutKeys.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeLayoutKey && <Badge variant="outline">{activeLayoutKey}</Badge>}
              {hiddenIncompatibleCount > 0 && (
                <Badge variant="outline">{hiddenIncompatibleCount} hidden as incompatible</Badge>
              )}
              {selectedVisibleLayoutKeys.length > 1 && (
                <Badge variant="destructive">selected rows span multiple layoutKey snapshots</Badge>
              )}
              {torusItemsLoading && (
                <Badge variant="outline">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  loading full atlas slice
                </Badge>
              )}
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={torusWindowSize === "all" ? "default" : "outline"} onClick={() => { setTorusWindowSize("all"); setTorusOffset(0); }}>
                  Все
                </Button>
                <Button size="sm" variant={torusWindowSize === 1000 ? "default" : "outline"} onClick={() => { setTorusWindowSize(1000); setTorusOffset(0); }}>
                  Показать 1000
                </Button>
                <Button size="sm" variant={torusWindowSize === 500 ? "default" : "outline"} onClick={() => { setTorusWindowSize(500); setTorusOffset(0); }}>
                  Показать 500
                </Button>
                <Button size="sm" variant="outline" disabled={torusOffset <= 0} onClick={() => shiftTorusOffset(-1000, 1000)}>
                  Прошлые 1000
                </Button>
                <Button size="sm" variant="outline" disabled={torusOffset <= 0} onClick={() => shiftTorusOffset(-500)}>
                  Прошлые 500
                </Button>
                <Button size="sm" variant="outline" disabled={torusBaseItems.length === 0 || torusOffset >= Math.max(0, torusBaseItems.length - (torusWindowSize === "all" ? torusBaseItems.length || 1 : torusWindowSize))} onClick={() => shiftTorusOffset(500)}>
                  Следующие 500
                </Button>
                <Button size="sm" variant="outline" disabled={torusBaseItems.length === 0 || torusOffset >= Math.max(0, torusBaseItems.length - 1000)} onClick={() => shiftTorusOffset(1000, 1000)}>
                  Следующие 1000
                </Button>
                <Button size="sm" variant={expandRelatedNodes ? "default" : "outline"} onClick={() => setExpandRelatedNodes((prev) => !prev)} disabled={slicedTorusItems.length === 0}>
                  Показать взаимосвязанные
                </Button>
                <Button size="sm" variant={showSearchMatchesOnly ? "default" : "outline"} onClick={() => { setShowSearchMatchesOnly((prev) => { const next = !prev; if (next) setShowSearchMatchesWithNeighbors(false); return next; }); setTorusOffset(0); }} disabled={!normalizedTorusSearch}>
                  Поиск на торе
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Окно: {torusWindowSize === "all" ? "все" : torusWindowSize}</span>
                <span>Смещение: {torusOffset}</span>
                <span>Кластеров активно: {effectiveClusters.length} / {availableClusters.length}</span>
                {showSearchMatchesOnly && normalizedTorusSearch && <span>Поисковый фокус: {search}</span>}
                {expandRelatedNodes && <span>Связи: +1 сосед из активного кластера на каждый показанный узел</span>}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="mb-2 text-sm font-medium">Кластеры</div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEnabledClusters(availableClusters); setTorusOffset(0); }}>
                  Все кластеры
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEnabledClusters([]); setTorusOffset(0); }}>
                  Авто
                </Button>
              </div>
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex flex-wrap gap-3 pb-2">
                  {availableClusters.map((cluster) => {
                    const checked = effectiveClusters.includes(cluster);
                    return (
                      <label key={`torus-cluster-${cluster}`} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleCluster(cluster, value === true)} />
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CLUSTER_COLORS[cluster % CLUSTER_COLORS.length] ?? "#ffffff" }}
                        />
                        <span>Cluster {cluster}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
            <div className="relative min-h-[520px] flex-1 overflow-hidden rounded-xl border border-border/70 bg-black/80">
              <TorusCanvas
                data={torusData}
                selectedId={selectedIds[0] ?? null}
                onSelect={(id) => {
                  if (!id) return;
                  const item = torusSourceItems.find((node) => node.id === id);
                  if (item) {
                    setDetailCrystal(item);
                  }
                }}
                onHover={setHoveredId}
                autoRotate={false}
                showEdges={showEdges}
                showLabels={showLabels}
                showTorusWireframe
                metaPreset={metaPreset}
                shapePreset={shapePreset}
                colorPreset={colorPreset}
                warpPreset={warpPreset}
                surfaceType={surfaceType}
                mouseRotation={mouseRotation}
                xSpeed={xSpeed}
                ySpeed={ySpeed}
                zSpeed={zSpeed}
                displayRadiusMajor={displayRadiusMajor}
                displayRadiusMinor={displayRadiusMinor}
                lockRadii={lockRadii}
              />
              {hoveredCrystal && (
                <div className="pointer-events-none absolute right-4 top-4 w-[320px] rounded-lg border border-cyan-400/30 bg-slate-950/92 p-3 shadow-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{hoveredCrystal.code}</Badge>
                    <Badge variant="outline">torus {hoveredCrystal.torusClusterLabel}</Badge>
                    <Badge variant="outline">semantic {hoveredCrystal.semanticClusterLabel}</Badge>
                    {hoveredCrystal.isEmerald && <Badge variant="outline">emerald</Badge>}
                  </div>
                  <div className="mt-2 text-sm font-medium break-words">{hoveredCrystal.name}</div>
                  <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                    {truncate(hoveredCrystal.formula, 260)}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet open={Boolean(detailCrystal)} onOpenChange={(open) => !open && setDetailCrystal(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detailCrystal?.name ?? "Atlas crystal"}</SheetTitle>
            <SheetDescription>{detailCrystal?.code ?? ""}</SheetDescription>
          </SheetHeader>
          {detailCrystal && (
            <div className="mt-6 space-y-4 text-sm">
              <DetailRow label="Type" value={detailCrystal.type} />
              <DetailRow label="Category" value={detailCrystal.category || "—"} />
              <DetailRow label="Pattern" value={detailCrystal.pattern || "—"} />
              <DetailRow label="Cluster" value={String(detailCrystal.clusterLabel)} />
              <DetailRow label="Quality" value={detailCrystal.qualityScore.toFixed(3)} />
              <DetailRow label="Complexity" value={String(detailCrystal.complexity)} />
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Formula</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 font-mono leading-6 break-all">
                  {detailCrystal.formula}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard label="V" value={formatMetric(detailCrystal.metrics.V)} />
                <MetricCard label="QEC" value={formatMetric(detailCrystal.metrics.QEC)} />
                <MetricCard label="CHSH" value={formatMetric(detailCrystal.metrics.CHSH)} />
                <MetricCard label="Q" value={formatMetric(detailCrystal.metrics.Q)} />
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Micro Notes</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailCrystal.microNotes || "—"}</div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Translation</div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 leading-6">{detailCrystal.translation || "—"}</div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={torusDialogOpen} onOpenChange={setTorusDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>TorusFlow GWCollapser</DialogTitle>
            <DialogDescription>
              Review runtime parameters before launching torus analysis from Torus Atlas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={torusParams.document_mode === "combination_only" ? "default" : "outline"}
              onClick={() => setTorusParams((prev) => ({ ...prev, document_mode: "combination_only" }))}
            >
              Combination-only
            </Button>
            <Button
              variant={torusParams.document_mode === "full" ? "default" : "outline"}
              onClick={() => setTorusParams((prev) => ({ ...prev, document_mode: "full" }))}
            >
              Full
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <NumericField label="Clusters" value={torusParams.n_clusters} onChange={(value) => setTorusParams((prev) => ({ ...prev, n_clusters: value }))} />
            <NumericField label="Max steps" value={torusParams.max_steps} onChange={(value) => setTorusParams((prev) => ({ ...prev, max_steps: value }))} />
            <NumericField label="dt" value={torusParams.dt} onChange={(value) => setTorusParams((prev) => ({ ...prev, dt: value }))} step="0.001" />
            <NumericField label="Friction" value={torusParams.friction} onChange={(value) => setTorusParams((prev) => ({ ...prev, friction: value }))} step="0.001" />
            <NumericField label="Epsilon" value={torusParams.epsilon} onChange={(value) => setTorusParams((prev) => ({ ...prev, epsilon: value }))} step="0.001" />
            <NumericField label="Tol speed" value={torusParams.tol_speed} onChange={(value) => setTorusParams((prev) => ({ ...prev, tol_speed: value }))} step="0.0001" />
            <NumericField label="Torus R" value={torusParams.geometry_R} onChange={(value) => setTorusParams((prev) => ({ ...prev, geometry_R: value }))} step="0.1" />
            <NumericField label="Torus r" value={torusParams.geometry_r} onChange={(value) => setTorusParams((prev) => ({ ...prev, geometry_r: value }))} step="0.1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTorusDialogOpen(false)}>Cancel</Button>
            <Button onClick={runTorusFlowWithParams} disabled={runningAction === "torus_flow"}>
              {runningAction === "torus_flow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rebuildDialogOpen} onOpenChange={setRebuildDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rebuild Global Atlas</DialogTitle>
            <DialogDescription>
              Runs one global combination-only batch, clusters the whole selected scope in one shared torus space, then saves coordinates back into each crystal metadata record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={rebuildScope === "all" ? "default" : "outline"}
              onClick={() => setRebuildScope("all")}
            >
              Entire base
            </Button>
            <Button
              variant={rebuildScope === "selected" ? "default" : "outline"}
              onClick={() => setRebuildScope("selected")}
              disabled={!selectedIds.length}
            >
              Selected only
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <NumericField label="Clusters" value={rebuildParams.n_clusters} onChange={(value) => setRebuildParams((prev) => ({ ...prev, n_clusters: value }))} />
            <NumericField label="Max steps" value={rebuildParams.max_steps} onChange={(value) => setRebuildParams((prev) => ({ ...prev, max_steps: value }))} />
            <NumericField label="dt" value={rebuildParams.dt} onChange={(value) => setRebuildParams((prev) => ({ ...prev, dt: value }))} step="0.001" />
            <NumericField label="Friction" value={rebuildParams.friction} onChange={(value) => setRebuildParams((prev) => ({ ...prev, friction: value }))} step="0.001" />
            <NumericField label="Epsilon" value={rebuildParams.epsilon} onChange={(value) => setRebuildParams((prev) => ({ ...prev, epsilon: value }))} step="0.001" />
            <NumericField label="Tol speed" value={rebuildParams.tol_speed} onChange={(value) => setRebuildParams((prev) => ({ ...prev, tol_speed: value }))} step="0.0001" />
            <NumericField label="Torus R" value={rebuildParams.geometry_R} onChange={(value) => setRebuildParams((prev) => ({ ...prev, geometry_R: value }))} step="0.1" />
            <NumericField label="Torus r" value={rebuildParams.geometry_r} onChange={(value) => setRebuildParams((prev) => ({ ...prev, geometry_r: value }))} step="0.1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebuildDialogOpen(false)}>Cancel</Button>
            <Button onClick={runGlobalAtlasRebuild} disabled={rebuildRunning || (rebuildScope === "selected" && !selectedIds.length)}>
              {rebuildRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Run rebuild
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fullRebuildDialogOpen} onOpenChange={setFullRebuildDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rebuild Full Atlas</DialogTitle>
            <DialogDescription>
              Runs one atlas analysis across the full crystal base in combination-only mode and then writes coordinates back in persistence batches for large datasets.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <NumericField label="Clusters" value={fullRebuildParams.n_clusters} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, n_clusters: value }))} />
            <NumericField label="Batch size" value={fullRebuildParams.batch_size} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, batch_size: value }))} />
            <NumericField label="Max steps" value={fullRebuildParams.max_steps} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, max_steps: value }))} />
            <NumericField label="dt" value={fullRebuildParams.dt} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, dt: value }))} step="0.001" />
            <NumericField label="Friction" value={fullRebuildParams.friction} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, friction: value }))} step="0.001" />
            <NumericField label="Epsilon" value={fullRebuildParams.epsilon} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, epsilon: value }))} step="0.001" />
            <NumericField label="Tol speed" value={fullRebuildParams.tol_speed} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, tol_speed: value }))} step="0.0001" />
            <NumericField label="Torus R" value={fullRebuildParams.geometry_R} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, geometry_R: value }))} step="0.1" />
            <NumericField label="Torus r" value={fullRebuildParams.geometry_r} onChange={(value) => setFullRebuildParams((prev) => ({ ...prev, geometry_r: value }))} step="0.1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullRebuildDialogOpen(false)}>Cancel</Button>
            <Button onClick={runFullAtlasRebuild} disabled={fullRebuildStarting || ["preparing", "analyzing", "analysis_ready", "persisting"].includes(fullRebuildJob?.status ?? "")}>
              {fullRebuildStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Run full rebuild
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkSelectDialogOpen} onOpenChange={setBulkSelectDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Select</DialogTitle>
            <DialogDescription>
              Select crystals by current filter without rendering large lists next to the canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant={bulkRuleMode === "filter" ? "default" : "outline"} onClick={() => setBulkRuleMode("filter")}>
                Current Filter
              </Button>
              <Button variant={bulkRuleMode === "layout" ? "default" : "outline"} onClick={() => setBulkRuleMode("layout")} disabled={!activeLayoutKey}>
                LayoutKey
              </Button>
              <Button variant={bulkRuleMode === "semantic" ? "default" : "outline"} onClick={() => setBulkRuleMode("semantic")} disabled={!compatibleItems.length}>
                Semantic Cluster
              </Button>
              <Button variant={bulkRuleMode === "torus" ? "default" : "outline"} onClick={() => setBulkRuleMode("torus")} disabled={!compatibleItems.length}>
                Torus Cluster
              </Button>
              <Button variant={bulkRuleMode === "duplicates" ? "default" : "outline"} onClick={() => setBulkRuleMode("duplicates")}>
                Duplicates
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[100, 200, 1000].map((value) => (
                <Button key={value} variant={bulkLimit === value ? "default" : "outline"} onClick={() => setBulkLimit(value as 100 | 200 | 1000)}>
                  First {value}
                </Button>
              ))}
              <Button variant={bulkLimit === "all" ? "default" : "outline"} onClick={() => setBulkLimit("all")}>
                All Filtered
              </Button>
            </div>
            <div className="rounded-md border border-border/60 p-3 text-sm text-muted-foreground">
              Current filter:
              {" "}
              {search ? `search="${search}"` : "no search"}
              {" | "}
              {emeraldsOnly ? "emeralds only" : "all types"}
              {" | "}
              {bulkRuleMode === "filter"
                ? "mode=current filter"
                : bulkRuleMode === "layout"
                  ? `mode=layoutKey:${activeLayoutKey || "n/a"}`
                  : bulkRuleMode === "semantic"
                    ? `mode=semantic cluster:${compatibleItems[0]?.semanticClusterLabel ?? 0}`
                    : bulkRuleMode === "torus"
                      ? `mode=torus cluster:${compatibleItems[0]?.torusClusterLabel ?? 0}`
                      : "mode=duplicates"}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSelectDialogOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => applyBulkSelection("append")} disabled={bulkSelecting}>
              {bulkSelecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
            <Button onClick={() => applyBulkSelection("replace")} disabled={bulkSelecting}>
              {bulkSelecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jobLogsDialogOpen} onOpenChange={setJobLogsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Full Atlas Logs</DialogTitle>
            <DialogDescription>
              File-backed progress and error logs for the current full rebuild job.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Progress Log</div>
              <ScrollArea className="h-[320px] rounded-md border border-border/60 bg-muted/20 p-3">
                <pre className="whitespace-pre-wrap break-words text-xs leading-5">{jobLogs.progress || "No progress log yet."}</pre>
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Error Log</div>
              <ScrollArea className="h-[320px] rounded-md border border-border/60 bg-muted/20 p-3">
                <pre className="whitespace-pre-wrap break-words text-xs leading-5">{jobLogs.errors || "No error log entries."}</pre>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => refreshLogs()}>Refresh Logs</Button>
            <Button onClick={() => setJobLogsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={selectedDrawerOpen} onOpenChange={setSelectedDrawerOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Selected Crystals</SheetTitle>
            <SheetDescription>{selectedIds.length} items in current working selection.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {!selectedIds.length ? (
              <div className="text-sm text-muted-foreground">No selected crystals.</div>
            ) : (
              items.filter((item) => selectedSet.has(item.id)).map((item) => (
                <div key={`drawer-${item.id}`} className="rounded-md border border-border/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.code}</Badge>
                    <Badge variant="outline">torus {item.torusClusterLabel}</Badge>
                    <Badge variant="outline">semantic {item.semanticClusterLabel}</Badge>
                    {item.layoutKey && <Badge variant="outline">{item.layoutKey}</Badge>}
                  </div>
                  <div className="mt-2 font-medium break-words">{item.name}</div>
                  <div className="mt-2 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                    {truncate(item.formula, 260)}
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function ActionGroup({
  title,
  actions,
  runningAction,
  onRun,
}: {
  title: string;
  actions: GwCrystalPoolActionDefinition[];
  runningAction: GwCrystalPoolActionId | null;
  onRun: (action: GwCrystalPoolActionDefinition) => void;
}) {
  if (!actions.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => {
          const busy = runningAction === action.id;
          const Icon = action.category === "generation" ? FileText : action.id === "auto_annotation" ? Sparkles : action.id === "semantic_twins" ? Search : Activity;
          return (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto w-full items-start justify-start gap-3 whitespace-normal py-3 text-left"
              disabled={Boolean(runningAction)}
              onClick={() => onRun(action)}
            >
              {busy ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : <Icon className="mt-0.5 h-4 w-4" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span>{action.name}</span>
                  <Badge variant="outline">{action.availability}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{action.description}</div>
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}

function AtlasSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumericField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <Input type="number" value={String(value)} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function formatMetric(value: number | undefined) {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
