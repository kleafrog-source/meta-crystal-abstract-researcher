"use client";

import * as React from "react";
import { Check, ClipboardCopy, FileCode2, Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRagStore } from "@/store/rag-store";

/** Macro generator panel.
 *
 *  Builds the Flowmusic UNIFIED-PROTOCOL override macro from the active
 *  parameters (server-side, no LLM) and exposes a one-click "Copy to
 *  clipboard" action that flips its label to "Скопировано!" for 2 s.
 */
export function MacroGenerator() {
  const activeParameters = useRagStore((s) => s.activeParameters);
  const macro = useRagStore((s) => s.macro);
  const macroError = useRagStore((s) => s.macroError);
  const isGeneratingMacro = useRagStore((s) => s.isGeneratingMacro);
  const generateMacro = useRagStore((s) => s.generateMacro);

  const [copied, setCopied] = React.useState(false);

  // Generate a fresh macro automatically whenever the active parameter set
  // changes so the preview stays in sync with the user's slider tweaks.
  const paramSignature = React.useMemo(
    () =>
      activeParameters
        .map((p) => `${p.technical_name}=${String(p.current_value)}`)
        .join("|"),
    [activeParameters],
  );

  React.useEffect(() => {
    if (activeParameters.length > 0) {
      void generateMacro();
    }
    // We intentionally only re-run on the parameter signature; calling
    // generateMacro is what we want when the tuned values change.
  }, [paramSignature, generateMacro, activeParameters.length]);

  const handleGenerate = React.useCallback(() => {
    void generateMacro();
  }, [generateMacro]);

  const handleCopy = React.useCallback(async () => {
    if (!macro) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(macro);
      } else {
        // Fallback for non-secure contexts (sandboxed iframes etc.).
        const ta = document.createElement("textarea");
        ta.value = macro;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("clipboard copy failed", err);
    }
  }, [macro]);

  const lineCount = macro ? macro.split("\n").length : 0;
  const overrideCount = activeParameters.length;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-base">
            <FileCode2 className="size-4 text-primary" />
            Генератор макроса Flowmusic
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {overrideCount} параметров · {lineCount} строк
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGeneratingMacro || activeParameters.length === 0}
            size="sm"
          >
            {isGeneratingMacro ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            Generate Flowmusic Macro
          </Button>
          <Button
            type="button"
            onClick={handleCopy}
            disabled={!macro}
            variant="outline"
            size="sm"
          >
            {copied ? (
              <Check className="size-4 text-emerald-600" />
            ) : (
              <ClipboardCopy className="size-4" />
            )}
            {copied ? "Скопировано!" : "Copy to Clipboard"}
          </Button>
        </div>

        {macroError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {macroError}
          </div>
        )}

        {activeParameters.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Сначала найдите параметры через семантический поиск и подкорректируйте
            их значения — макрос соберётся автоматически.
          </div>
        ) : (
          <pre
            className="max-h-72 overflow-y-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed [scrollbar-width:thin]"
            aria-label="Сгенерированный макрос Flowmusic"
          >
            <code className="font-mono whitespace-pre-wrap break-words text-foreground">
              {macro || "// нажмите «Generate Flowmusic Macro»…"}
            </code>
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
