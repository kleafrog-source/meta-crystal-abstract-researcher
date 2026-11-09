"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { briefSourceKey, isCurrentBriefSelection, type BriefImportState, type BriefSelectionIdentity, type BriefSourceIdentity } from "@/lib/am-stage-automation/brief-stage-apply";

export type BriefApplyRequest = {
  mode: "ordinary" | "confirmed-replace";
  operationId: string;
  expectedText: string;
  expectedSessionId: string | null;
  selection: BriefSelectionIdentity;
};

export type BriefViewArtifact = BriefSelectionIdentity & {
  runTitle: string;
  successfulAttemptId: string;
  schemaVersion: number;
  kind: string;
  actionId: string;
  modality?: string;
  validity: string;
  artifactContractConsistent: boolean;
  data: unknown;
};

type Props = {
  artifact: BriefViewArtifact | null;
  selection: BriefSelectionIdentity;
  selectionCurrent: boolean;
  currentText: string;
  targetSessionId: string | null;
  importState: BriefImportState | null;
  onApply: (request: BriefApplyRequest) => void;
};

type PendingApply = BriefApplyRequest & { incomingText: string; source: BriefSourceIdentity };

function textOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" && text.trim() ? text : null;
}

function sourceOf(artifact: BriefViewArtifact): BriefSourceIdentity {
  return { runId: artifact.runId, stageId: artifact.stageId, attemptId: artifact.attemptId, artifactId: artifact.artifactId, actionId: "brief.combine_segment_texts", schemaVersion: 1, modality: "text" };
}

function sourceKeyOfSelection(selection: BriefSelectionIdentity): string {
  return briefSourceKey(selection);
}

export function AutomationBriefResult({ artifact, selection, selectionCurrent, currentText, targetSessionId, importState, onApply }: Props) {
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [staleProposal, setStaleProposal] = useState(false);
  const incomingText = artifact ? textOf(artifact.data) : null;
  const valid = Boolean(artifact && incomingText && artifact.artifactContractConsistent && selectionCurrent &&
    isCurrentBriefSelection(selection, artifact) && artifact.runId && artifact.stageId && artifact.attemptId === artifact.successfulAttemptId &&
    artifact.actionId === "brief.combine_segment_texts" && artifact.kind === "brief" && artifact.schemaVersion === 1 && artifact.modality === "text" && artifact.validity === "valid");
  const source = artifact && valid ? sourceOf(artifact) : null;
  const alreadyApplied = Boolean(source && importState?.appliedSources.includes(briefSourceKey(source)));
  const canExplicitlyReapply = Boolean(source && importState?.manuallyEdited && briefSourceKey(importState.source) === briefSourceKey(source));

  const begin = (mode: PendingApply["mode"]) => {
    if (!artifact || !source || !incomingText || !valid) return;
    const request = { mode, operationId: crypto.randomUUID(), expectedText: currentText, expectedSessionId: targetSessionId, selection: { runId: selection.runId, stageId: selection.stageId, attemptId: selection.attemptId, artifactId: selection.artifactId } };
    if (mode === "ordinary" && alreadyApplied) {
      onApply(request);
      return;
    }
    if (mode === "confirmed-replace" || (currentText.trim() && currentText !== incomingText)) {
      setStaleProposal(false);
      setPending({ ...request, mode: "confirmed-replace", incomingText, source });
      return;
    }
    onApply(request);
  };

  const confirm = () => {
    if (!pending) return;
    const currentIncoming = artifact && valid ? textOf(artifact.data) : null;
    const currentSource = artifact && valid ? sourceOf(artifact) : null;
    if (!currentIncoming || !currentSource || !selectionCurrent || !isCurrentBriefSelection(selection, artifact ?? selection)) {
      setPending(null);
      setStaleProposal(true);
      return;
    }
    const proposalChanged = pending.expectedText !== currentText || pending.expectedSessionId !== targetSessionId ||
      pending.incomingText !== currentIncoming || briefSourceKey(pending.source) !== briefSourceKey(currentSource) ||
      !isCurrentBriefSelection(pending.selection, selection);
    if (proposalChanged) {
      setPending({ ...pending, incomingText: currentIncoming, source: currentSource, expectedText: currentText, expectedSessionId: targetSessionId, selection });
      setStaleProposal(true);
      return;
    }
    onApply(pending);
    setPending(null);
    setStaleProposal(false);
  };

  return <section aria-label="Automation Brief result" className="mt-2 rounded border border-border/70 p-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]"><strong>Generated Brief · View</strong>{artifact ? <span>{artifact.runTitle} · {artifact.stageId}</span> : null}</div>
    {artifact ? <>
      <p className="mt-1 whitespace-pre-wrap text-xs" data-testid="automation-brief-text">{incomingText ?? "Unsupported Brief artifact."}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!valid} onClick={() => begin("ordinary")}>{alreadyApplied ? "Apply to Brief · already applied" : "Apply to Brief"}</Button>
        {canExplicitlyReapply ? <Button size="sm" variant="outline" onClick={() => begin("confirmed-replace")}>Replace edited Brief with this artifact</Button> : null}
      </div>
      {importState ? <div className="mt-2 text-[10px] text-muted-foreground" role="status">
        {importState.manuallyEdited ? "Imported Brief · edited manually" : "Imported Brief"}
        <details className="mt-1"><summary className="cursor-pointer">Automation source details</summary><dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono">
          <dt>Run</dt><dd>{importState.source.runId}</dd><dt>Stage</dt><dd>{importState.source.stageId}</dd><dt>Attempt</dt><dd>{importState.source.attemptId}</dd><dt>Artifact</dt><dd>{importState.source.artifactId}</dd>
        </dl></details>
      </div> : null}
      {staleProposal ? <p className="mt-2 text-xs text-amber-300" role="status">The Brief, session, or selected artifact changed. Review the updated source and target before confirming again.</p> : null}
      {pending ? <div className="fixed inset-0 z-[96] grid place-items-center bg-black/75 p-4" role="presentation">
        <section role="alertdialog" aria-modal="true" aria-labelledby="automation-brief-replace-title" className="w-full max-w-2xl space-y-3 rounded-lg border border-amber-400/40 bg-zinc-950 p-4">
          <h2 id="automation-brief-replace-title" className="font-mono text-sm font-semibold">Replace the current Brief?</h2>
          <p className="text-xs text-muted-foreground">This updates the working Brief only. It does not save the session or start a search.</p>
          <div className="grid gap-3 md:grid-cols-2"><div><strong className="text-[10px]">Current Brief</strong><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-white/10 p-2 text-xs">{currentText || "(empty)"}</pre></div><div><strong className="text-[10px]">Selected artifact</strong><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-white/10 p-2 text-xs">{pending.incomingText}</pre></div></div>
          {staleProposal ? <p className="text-xs text-amber-300" role="status">The proposal was refreshed. Review the current values and confirm again.</p> : null}
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => { setPending(null); setStaleProposal(false); }}>Cancel replacement</Button><Button size="sm" onClick={confirm}>Confirm replacement</Button></div>
        </section>
      </div> : null}
    </> : <p className="mt-1 text-xs text-muted-foreground">Select a saved Brief artifact to view it here.</p>}
  </section>;
}
