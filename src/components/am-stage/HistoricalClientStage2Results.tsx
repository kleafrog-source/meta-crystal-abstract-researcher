import { projectHistoricalClientStage2 } from "@/lib/am-stage-automation/historical-segment-results";

export function HistoricalClientStage2Results({ data, artifactId, inputRefs, labels }: {
  data: unknown;
  artifactId: string;
  inputRefs: string[];
  labels: { section: string; title: string; artifact: string; inputs: string; parameter: string; segment: string; frame: string; value: string; empty: string };
}) {
  const parameters = projectHistoricalClientStage2(data);
  return <section className="mt-2 space-y-1 rounded border border-violet-400/30 bg-violet-950/10 p-2" aria-label={labels.section} data-historical-client-stage2>
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]"><strong>{labels.title}</strong><span>{parameters.length}</span></div>
    <p className="text-[9px] text-muted-foreground">{labels.artifact}: <code title={artifactId}>{artifactId}</code></p>
    <p className="break-all text-[9px] text-muted-foreground">{labels.inputs}: {inputRefs.length ? inputRefs.map((id, index) => <code key={`${id}-${index}`} className="mr-1" title={id}>{id}</code>) : "—"}</p>
    {parameters.length ? <div className="max-h-52 overflow-auto"><table className="w-full text-left text-[9px]"><thead className="text-muted-foreground"><tr><th className="pr-2">{labels.parameter}</th><th className="pr-2">{labels.segment}</th><th className="pr-2">{labels.frame}</th><th>{labels.value}</th></tr></thead><tbody>{parameters.slice(0, 80).map((parameter, index) => <tr key={`${parameter.technical_name}-${parameter.automation_segment}-${parameter.consensus_frame}-${index}`} className="border-t border-border/40"><td className="max-w-36 truncate pr-2 font-mono" title={parameter.technical_name}>{parameter.technical_name}</td><td className="max-w-28 truncate pr-2 font-mono" title={parameter.automation_segment}>{parameter.automation_segment}</td><td className="max-w-36 truncate pr-2 font-mono" title={parameter.consensus_frame}>{parameter.consensus_frame}</td><td className="font-mono">{String(parameter.current_value ?? parameter.suggested_value ?? "—")}</td></tr>)}</tbody></table>{parameters.length > 80 ? <p className="pt-1 text-[9px] text-muted-foreground">Showing first 80 stored parameters</p> : null}</div> : <p className="text-[9px] text-muted-foreground">{labels.empty}</p>}
  </section>;
}
