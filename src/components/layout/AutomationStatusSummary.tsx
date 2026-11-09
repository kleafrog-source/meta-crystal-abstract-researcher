"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUiText } from "@/lib/ui-i18n";

type SummaryRun = { id: string; title: string; status: string; currentStageId: string | null; currentActionId: string | null; currentStageNumber: number | null; stageCount: number };
export function AutomationStatusSummary() {
  const t = useUiText();
  const [run, setRun] = useState<SummaryRun | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/am-stage/automation/runs?limit=20", { cache: "no-store" });
      const body = await response.json() as { runs?: SummaryRun[] };
      if (response.ok) setRun(body.runs?.find((item) => ["preparing", "running", "stopping"].includes(item.status)) ?? null);
    } catch { /* The summary stays at its last confirmed snapshot. */ }
    finally { setCheckedAt(new Date()); setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener("automation:changed", onChanged);
    return () => window.removeEventListener("automation:changed", onChanged);
  }, [refresh]);
  if (!run) return null;
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card/70 px-3 py-1.5 text-xs" data-automation-status>
    <strong>{t("Automation · Running")}</strong><span className="text-muted-foreground">{run.title}</span><span className="text-muted-foreground">{run.currentActionId ? `${run.currentActionId} · ${run.currentStageNumber ?? "?"}/${run.stageCount}` : `${run.stageCount} ${t("stages")}`}</span>
    <span className="ml-auto text-[10px] text-muted-foreground">{checkedAt ? `${t("Updated")} ${checkedAt.toLocaleTimeString()}` : t("Status not refreshed")}</span>
    <button type="button" className="rounded border border-border px-2 py-0.5 hover:bg-accent" disabled={loading} onClick={() => void refresh()}>{t("Refresh")}</button>
    <Link className="rounded border border-border px-2 py-0.5 hover:bg-accent" href={`/automation?run=${encodeURIComponent(run.id)}`}>{t("Open")}</Link>
  </div>;
}
