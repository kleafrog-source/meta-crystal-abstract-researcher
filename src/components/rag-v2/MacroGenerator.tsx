"use client";

import { Copy, Loader2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRagV2Store } from "@/store/rag-v2-store";

export function MacroGenerator() {
  const activeCount = useRagV2Store((state) => state.activeParameters.length);
  const macro = useRagV2Store((state) => state.macro);
  const isGeneratingMacro = useRagV2Store((state) => state.isGeneratingMacro);
  const macroError = useRagV2Store((state) => state.macroError);
  const generateMacro = useRagV2Store((state) => state.generateMacro);

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <WandSparkles className="size-4 text-primary" />
          Clean Macro Output
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" className="w-full" onClick={() => generateMacro()} disabled={activeCount === 0 || isGeneratingMacro}>
          {isGeneratingMacro ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
          Generate from {activeCount} parameters
        </Button>

        <Textarea
          value={macro}
          readOnly
          rows={16}
          placeholder="Generated overrides will appear here as clean key:value lines."
          className="font-mono text-xs"
        />

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!macro}
          onClick={async () => {
            await navigator.clipboard.writeText(macro);
          }}
        >
          <Copy className="size-4" />
          Copy output
        </Button>

        {macroError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {macroError}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
