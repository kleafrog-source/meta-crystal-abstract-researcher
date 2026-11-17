import { projectSpecialAutomationArtifact } from "@/lib/am-stage-automation/special-artifact-view";

function display(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "—";
  if (value === null) return "null";
  return JSON.stringify(value);
}

export function AutomationSpecialArtifactView({ actionId, kind, data, artifactId, inputRefs }: {
  actionId: string;
  kind: string;
  data: unknown;
  artifactId: string;
  inputRefs: string[];
}) {
  const view = projectSpecialAutomationArtifact(actionId, kind, data);
  const valueSelectionAction = ["text.qwen.resolved", "text.gemma.awtd", "text.gemma.resolved", "audio.gemma.awtd", "audio.gemma.resolved"].includes(actionId);
  const selectionRows: Array<Record<string, unknown> & { technical_name: string }> = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>).filter((row): row is Record<string, unknown> & { technical_name: string } => typeof row.technical_name === "string")
    : data && typeof data === "object" && Array.isArray((data as { parameters?: unknown }).parameters)
      ? ((data as { parameters: Array<Record<string, unknown>> }).parameters).filter((row): row is Record<string, unknown> & { technical_name: string } => typeof row.technical_name === "string")
      : data && typeof data === "object" && Array.isArray((data as { segments?: unknown }).segments)
        ? ((data as { segments: Array<{ id?: string; parameters?: unknown }> }).segments).flatMap((segment) => Array.isArray(segment.parameters)
          ? (segment.parameters as Array<Record<string, unknown>>).filter((row): row is Record<string, unknown> & { technical_name: string } => typeof row.technical_name === "string").map((row) => ({ ...row, segment_id: segment.id }))
          : [])
        : [];
  if (valueSelectionAction && selectionRows.length) return <section className="mt-2 space-y-2 rounded border border-violet-400/30 bg-violet-950/10 p-2" aria-label="Embedding value selection result" data-automation-value-selection-view>
    <header className="flex flex-wrap items-center justify-between gap-2 text-[10px]"><strong>{actionId}</strong><span>{selectionRows.length} parameter rows · {selectionRows.filter((row) => row.value_status === "selected" || row.value_status === "selected_matches_default").length} selected</span></header>
    <div className="max-h-64 overflow-auto"><table className="w-full text-left text-[9px]"><thead className="text-muted-foreground"><tr><th className="pr-2">Parameter</th><th className="pr-2">Selected value</th><th className="pr-2">Catalogue default (metadata)</th><th className="pr-2">Status</th><th className="pr-2">Mechanism</th><th>Reason</th></tr></thead><tbody>{selectionRows.map((row, index) => { const catalogueDefault = Object.prototype.hasOwnProperty.call(row, "catalogue_default") ? row.catalogue_default : row.default; const hasCatalogueDefault = Object.prototype.hasOwnProperty.call(row, "catalogue_default") || Object.prototype.hasOwnProperty.call(row, "default"); return <tr key={`${row.technical_name}-${String(row.segment_id ?? index)}`} className="border-t border-border/40"><td className="max-w-44 truncate pr-2 font-mono" title={row.technical_name}>{row.technical_name}{row.segment_id ? <span className="ml-1 text-muted-foreground">[{String(row.segment_id)}]</span> : null}</td><td className="max-w-40 truncate pr-2 font-mono">{row.selected_value === undefined ? "—" : display(row.selected_value)}</td><td className="max-w-40 truncate pr-2 font-mono">{hasCatalogueDefault ? display(catalogueDefault) : "unknown"}</td><td className="pr-2">{String(row.value_status ?? "legacy_unknown")}</td><td className="pr-2">{String(row.source ?? "unknown")}</td><td className="max-w-72">{String(row.selection_detail ?? row.detail ?? "No selection diagnostic recorded.")}</td></tr>; })}</tbody></table></div>
    <p className="break-all text-[9px] text-muted-foreground">Artifact <code>{artifactId}</code> · inputs {inputRefs.length ? inputRefs.map((id) => <code key={id} className="ml-1">{id}</code>) : "—"}</p>
  </section>;
  if (!view) return null;

  if (view.kind === "vocal-allocation") return <section className="mt-2 space-y-2 rounded border border-fuchsia-400/30 bg-fuchsia-950/10 p-2" aria-label="Vocal Allocation result" data-automation-vocal-allocation-view>
    <header className="flex flex-wrap items-center justify-between gap-2 text-[10px]"><strong>Parsed vocal brief</strong><span>{view.parameters.length} assignment parameters{view.totalScoped === null ? "" : ` · ${view.totalScoped} scoped catalogue candidates`}</span></header>
    <p className="whitespace-pre-wrap text-[10px]">{view.query}</p>
    <dl className="grid gap-x-3 gap-y-1 text-[9px] sm:grid-cols-2">
      <div><dt className="inline text-muted-foreground">Languages: </dt><dd className="inline">{view.languages.join(", ") || "—"}</dd></div>
      <div><dt className="inline text-muted-foreground">Techniques: </dt><dd className="inline">{view.techniques.join(", ") || "—"}</dd></div>
      <div><dt className="inline text-muted-foreground">Effects: </dt><dd className="inline">{view.effects.join(", ") || "—"}</dd></div>
      <div><dt className="inline text-muted-foreground">I/S/E/A: </dt><dd className="inline">{view.digits.map(([key, value]) => `${key}=${value}`).join(" · ") || "—"}</dd></div>
    </dl>
    <div className="max-h-48 overflow-auto"><table className="w-full text-left text-[9px]"><thead className="text-muted-foreground"><tr><th className="pr-2">Parameter</th><th className="pr-2">Value</th><th className="pr-2">Category</th><th>Source</th></tr></thead><tbody>{view.parameters.slice(0, 80).map((parameter, index) => <tr key={`${parameter.technicalName}-${index}`} className="border-t border-border/40"><td className="max-w-40 truncate pr-2 font-mono" title={parameter.technicalName}>{parameter.technicalName}</td><td className="max-w-32 truncate pr-2 font-mono" title={display(parameter.value)}>{display(parameter.value)}</td><td className="max-w-40 truncate pr-2" title={parameter.category}>{parameter.category}</td><td>{parameter.source}</td></tr>)}</tbody></table>{view.parameters.length > 80 ? <p className="pt-1 text-[9px] text-muted-foreground">Showing first 80 assignments</p> : null}</div>
    <p className="break-all text-[9px] text-muted-foreground">Artifact <code>{artifactId}</code> · inputs {inputRefs.length ? inputRefs.map((id) => <code key={id} className="ml-1">{id}</code>) : "—"}</p>
  </section>;

  const timelineRows: Array<{ time: number; modality: string; technicalName: string; value: unknown }> = [];
  let totalTimelineRows = 0;
  for (const point of view.points) {
    totalTimelineRows += point.values.length;
    for (const item of point.values) {
      if (timelineRows.length < 200) timelineRows.push({ time: point.time, modality: item.modality, technicalName: item.technicalName, value: item.value });
    }
  }

  return <section className="mt-2 space-y-2 rounded border border-cyan-400/30 bg-cyan-950/10 p-2" aria-label="FLOWMUSIC timeline result" data-automation-flowmusic-view>
    <header className="flex flex-wrap items-center justify-between gap-2 text-[10px]"><strong>FLOWMUSIC_PRIORITY_TIMELINE_V1</strong><span>{view.points.length} points · {view.durationSeconds.toFixed(2)} s · schema {view.validationRecorded ? "validated" : "not recorded"}</span></header>
    <p className="text-[10px]">{view.audioName}</p>
    <p className="break-all text-[9px] text-muted-foreground">Source plan: <code>{view.sourcePlan ?? "—"}</code> · source banks: {view.sourceBanks.map((id) => <code key={id} className="ml-1">{id}</code>)}</p>
    <div className="max-h-52 overflow-auto"><table className="w-full text-left text-[9px]"><thead className="text-muted-foreground"><tr><th className="pr-2">Time (s)</th><th className="pr-2">Modality</th><th className="pr-2">Parameter</th><th>Timeline value</th></tr></thead><tbody>{timelineRows.map((item, index) => <tr key={`${index}-${item.modality}-${item.technicalName}`} className="border-t border-border/40"><td className="pr-2 font-mono">{item.time.toFixed(3)}</td><td className="pr-2">{item.modality}</td><td className="max-w-40 truncate pr-2 font-mono" title={item.technicalName}>{item.technicalName}</td><td className="font-mono">{display(item.value)}</td></tr>)}</tbody></table>{totalTimelineRows > timelineRows.length ? <p className="pt-1 text-[9px] text-muted-foreground">Showing first {timelineRows.length} of {totalTimelineRows} parameter samples</p> : null}</div>
    <p className="break-all text-[9px] text-muted-foreground">Artifact <code>{artifactId}</code> · inputs {inputRefs.length ? inputRefs.map((id) => <code key={id} className="ml-1">{id}</code>) : "—"}</p>
  </section>;
}
