"use client";

import { Cpu, Database, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUiText } from "@/lib/ui-i18n";
import { useRagV3Store } from "@/store/rag-v3-store";
import { V3InfoTip } from "./V3Tooltip";

/** Compact, read-only status summary. Index audit and rebuild controls live in Service Bay. */
export function AnchoringDashboard() {
  const t = useUiText();
  const status = useRagV3Store((state) => state.status);
  const statusLoading = useRagV3Store((state) => state.statusLoading);
  const fetchStatus = useRagV3Store((state) => state.fetchStatus);

  return <Card className="gap-2 border-border/60 py-2">
    <CardHeader className="border-b border-border/40 px-3 py-1.5 [.border-b]:pb-1.5">
      <CardTitle className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-2"><Cpu className="size-4 text-primary" />{t("Unified retrieval & anchoring")}<V3InfoTip content={t("Compact status for catalogue retrieval, value anchors and the active embedding provider.")} /></span>
      </CardTitle>
    </CardHeader>
    <CardContent className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t("Published parameters")}: <strong>{status?.retrieval_index_count ?? 0}</strong></span>
        <span>{t("Artifacts")}: <strong>{status?.artifacts_ready ? t("ready") : t("not checked")}</strong></span>
        <span>{t("Embedding model")}: <code>{status?.ollama_model ?? "—"}</code></span>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void fetchStatus()} disabled={statusLoading}><RefreshCw className="size-3.5" />{t("Refresh status")}</Button>
        <Button asChild type="button" size="sm" variant="outline"><Link href="/service-bay"><Database className="size-3.5" />{t("Open Service Bay")}</Link></Button>
      </div>
    </CardContent>
  </Card>;
}
