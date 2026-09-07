"use client";

import { useState } from "react";
import { Copy, Download, Loader2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buildInstructionOutputBlock } from "@/lib/rag-v2/instruction-support";
import { useRagV2Store } from "@/store/rag-v2-store";

export function MacroGenerator() {
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const [exportState, setExportState] = useState<"idle" | "done" | "error">("idle");
  const activeCount = useRagV2Store((state) => state.activeParameters.length);
  const macro = useRagV2Store((state) => state.macro);
  const instructionSlots = useRagV2Store((state) => state.instructionSlots);
  const isGeneratingMacro = useRagV2Store((state) => state.isGeneratingMacro);
  const macroError = useRagV2Store((state) => state.macroError);
  const generateMacro = useRagV2Store((state) => state.generateMacro);
  const outputWithInstructions = composeMacroOutput(macro, instructionSlots);

  return (
    <Card className="console-macro-panel h-full border border-white/75 bg-black/70">
      <CardHeader className="border-b border-white/15 px-4 py-3">
        <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.12em] text-emerald-300">
          <WandSparkles className="size-4 text-primary" />
          Clean Macro Output
        </CardTitle>
      </CardHeader>
      <CardContent className="flex h-[calc(100%-52px)] flex-col gap-3 p-4">
        <div className="flex flex-col gap-2">
          <Button type="button" className="h-11 w-full rounded border border-emerald-300/50 bg-emerald-500/80 font-mono text-xs uppercase tracking-[0.12em] text-black hover:bg-emerald-400" onClick={() => generateMacro()} disabled={activeCount === 0 || isGeneratingMacro}>
            {isGeneratingMacro ? <Loader2 className="size-4" /> : <WandSparkles className="size-4" />}
            Generate from {activeCount} parameters
          </Button>

          <div className="grid gap-2 grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full border-white/20 bg-white/[0.06] font-mono text-[10px] uppercase"
              disabled={!outputWithInstructions}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(outputWithInstructions);
                  setCopyState("done");
                  window.setTimeout(() => setCopyState("idle"), 1800);
                } catch {
                  setCopyState("error");
                  window.setTimeout(() => setCopyState("idle"), 1800);
                }
              }}
            >
              <Copy className="size-4" />
              {copyState === "done" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy output"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-9 w-full border-white/20 bg-white/[0.06] font-mono text-[10px] uppercase"
              disabled={!outputWithInstructions}
              onClick={() => {
                try {
                  const blob = new Blob([outputWithInstructions], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
                  anchor.href = url;
                  anchor.download = `rag-v2-macro-${date}.txt`;
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(url);
                  setExportState("done");
                  window.setTimeout(() => setExportState("idle"), 1800);
                } catch {
                  setExportState("error");
                  window.setTimeout(() => setExportState("idle"), 1800);
                }
              }}
            >
              <Download className="size-4" />
              {exportState === "done" ? "Exported" : exportState === "error" ? "Export failed" : "Export .txt"}
            </Button>
          </div>
        </div>

        <Textarea
          value={outputWithInstructions}
          readOnly
          rows={16}
          placeholder="Generated overrides will appear here as clean key:value lines."
          className="min-h-0 flex-1 resize-none border-white/15 bg-black/70 font-mono text-[11px] leading-6 text-emerald-300"
        />

        {macroError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {macroError}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function composeMacroOutput(macro: string, instructionSlots: ReturnType<typeof useRagV2Store.getState>["instructionSlots"]): string {
  const trimmedMacro = macro.trim();
  const instructionBlock = buildInstructionOutputBlock(instructionSlots);

  if (!instructionBlock) {
    return trimmedMacro;
  }
  if (!trimmedMacro) {
    return instructionBlock;
  }

  return `${trimmedMacro}\n\n${instructionBlock}`;
}
