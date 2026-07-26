"use client";

import { Info } from "@/components/icons";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function FieldHint({ hint }: { hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Подсказка"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function FieldLabel({
  label,
  hint,
  className = "text-xs",
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Label className={className}>{label}</Label>
      {hint ? <FieldHint hint={hint} /> : null}
    </div>
  );
}
