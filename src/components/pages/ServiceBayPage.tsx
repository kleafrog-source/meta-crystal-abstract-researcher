"use client";

import { Database, Server } from "lucide-react";
import { useUiText } from "@/lib/ui-i18n";
import { ManagedRebuildPanel } from "@/components/rag-v3/ManagedRebuildPanel";
import { ServiceBayIndexControls } from "@/components/rag-v3/ServiceBayIndexControls";

export function ServiceBayPage() {
  const t = useUiText();
  return <div className="min-h-screen bg-background p-3 text-foreground md:p-5">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div>
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold"><Database className="size-5 text-primary" />{t("Service Bay")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t("Index status and manual maintenance")}</p>
      </div>
      <div className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-muted-foreground">
        <Server className="size-3.5" />{t("Provider and model details are shown per index")}
      </div>
    </header>
    <div className="mx-auto max-w-[1600px] space-y-4">
      <section aria-label="CLAP and SigLIP2 index controls"><ServiceBayIndexControls /></section>
      <section id="index-coverage" aria-label="Index coverage"><ManagedRebuildPanel /></section>
    </div>
  </div>;
}
