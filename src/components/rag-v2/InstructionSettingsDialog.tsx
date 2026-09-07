"use client";

import { Settings2, Sparkles, RotateCcw, Save } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { extractInstructionTheses, summarizeInstruction } from "@/lib/rag-v2/instruction-support";
import { useRagV2Store } from "@/store/rag-v2-store";

export function InstructionSettingsDialog() {
  const instructionSlots = useRagV2Store((state) => state.instructionSlots);
  const updateInstructionSlot = useRagV2Store((state) => state.updateInstructionSlot);
  const saveInstructionSlots = useRagV2Store((state) => state.saveInstructionSlots);
  const resetInstructionSlots = useRagV2Store((state) => state.resetInstructionSlots);
  const instructionSettingsSavedAt = useRagV2Store((state) => state.instructionSettingsSavedAt);
  const activeCount = instructionSlots.filter((slot) => slot.enabled && slot.content.trim()).length;
  const outputCount = instructionSlots.filter((slot) => slot.enabled && slot.includeInOutput && slot.content.trim()).length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Settings2 className="size-4" />
          Instruction settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-primary" />
            Instruction slots
          </DialogTitle>
          <DialogDescription className="text-xs">
            Up to 10 JSON or Markdown blocks can bias retrieval. Higher influence makes the search embedding lean harder toward that instruction.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b border-border/60 px-6 py-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span>{activeCount} active slots</span>
            <Badge variant="outline">{outputCount} in output</Badge>
            <span>
              saved: {instructionSettingsSavedAt ? new Date(instructionSettingsSavedAt).toLocaleString("ru-RU") : "not yet"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => saveInstructionSlots()}>
              <Save className="size-4" />
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => resetInstructionSlots()}>
              <RotateCcw className="size-4" />
              Reset presets
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[72vh]">
          <div className="space-y-4 px-6 py-4">
            {instructionSlots.map((slot, index) => (
              <section key={slot.id} className="rounded-xl border border-border/60 bg-background/50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={slot.enabled}
                        onCheckedChange={(checked) =>
                          updateInstructionSlot(slot.id, { enabled: checked === true })
                        }
                        aria-label={`Enable ${slot.title}`}
                      />
                      <Input
                        value={slot.title}
                        onChange={(event) => updateInstructionSlot(slot.id, { title: event.target.value })}
                        className="h-9 max-w-sm text-sm"
                      />
                      <span className="text-[11px] text-muted-foreground">Slot {index + 1}</span>
                      <label className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Checkbox
                          checked={slot.includeInOutput}
                          onCheckedChange={(checked) =>
                            updateInstructionSlot(slot.id, { includeInOutput: checked === true })
                          }
                          aria-label={`Include ${slot.title} in output`}
                        />
                        Include in output
                      </label>
                    </div>

                    <Textarea
                      value={slot.content}
                      rows={8}
                      className="min-h-44 resize-y font-mono text-xs leading-5"
                      placeholder="Paste JSON or Markdown instruction here..."
                      onChange={(event) => updateInstructionSlot(slot.id, { content: event.target.value })}
                    />
                  </div>

                  <div className="w-full rounded-lg border border-border/60 bg-muted/20 p-3 lg:w-64">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">Influence</span>
                      <span className="font-mono text-muted-foreground">{slot.influence}/100</span>
                    </div>
                    <div className="mt-3">
                      <Slider
                        value={[slot.influence]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(values) =>
                          updateInstructionSlot(slot.id, { influence: values[0] ?? slot.influence })
                        }
                      />
                    </div>
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      {slot.influence >= 70
                        ? "High bias: retrieval strongly follows this block."
                        : slot.influence >= 40
                          ? "Medium bias: balanced with the user query."
                          : "Low bias: acts as a soft contextual nudge."}
                    </div>
                    <div className="mt-4 rounded-md border border-border/60 bg-background/70 p-2 text-[11px] text-muted-foreground">
                      <div className="mb-1 flex items-center gap-1 text-foreground">
                        <Sparkles className="size-3.5" />
                        Preview
                      </div>
                      {summarizeInstruction(slot.content)}
                    </div>
                    <div className="mt-3 rounded-md border border-border/60 bg-background/70 p-2 text-[11px] text-muted-foreground">
                      <div className="mb-1 flex items-center gap-1 text-foreground">
                        <Sparkles className="size-3.5" />
                        Semantic theses
                      </div>
                      <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-5">
                        {extractInstructionTheses(slot.content) || "No extracted theses yet."}
                      </pre>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
