"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, FileCode2, Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRagStore } from "@/store/rag-store";

export function MacroGenerator() {
  const activeParameters = useRagStore((state) => state.activeParameters);
  const macro = useRagStore((state) => state.macro);
  const macroError = useRagStore((state) => state.macroError);
  const isGeneratingMacro = useRagStore((state) => state.isGeneratingMacro);
  const generateMacro = useRagStore((state) => state.generateMacro);

  const [copied, setCopied] = useState(false);

  const signature = useMemo(
    () =>
      activeParameters
        .map(
          (parameter) =>
            `${parameter.technical_name}=${String(parameter.current_value)}`,
        )
        .join("|"),
    [activeParameters],
  );

  useEffect(() => {
    if (activeParameters.length > 0) {
      void generateMacro();
    }
  }, [activeParameters.length, generateMacro, signature]);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <FileCode2 className="size-4 text-primary" />
            Flowmusic Macro Generator
          </span>
          <span className="text-xs text-muted-foreground">
            {activeParameters.length} parameters
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => generateMacro()}
            disabled={activeParameters.length === 0 || isGeneratingMacro}
          >
            {isGeneratingMacro ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            Generate macro
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!macro}
            onClick={async () => {
              if (!macro) {
                return;
              }

              await navigator.clipboard.writeText(macro);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2_000);
            }}
          >
            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        {macroError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {macroError}
          </div>
        ) : null}

        {activeParameters.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Search and tune parameters first. The macro area will show only clean override lines.
          </div>
        ) : (
          <pre className="max-h-72 overflow-y-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed">
            <code className="whitespace-pre-wrap break-words font-mono text-foreground">
              {macro || "- no overrides generated yet"}
            </code>
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
