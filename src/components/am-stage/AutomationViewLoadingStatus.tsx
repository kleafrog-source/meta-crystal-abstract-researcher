export function AutomationViewLoadingStatus({ loading }: { loading: boolean }) {
  return loading ? <section role="status" aria-label="Loading Automation result" className="rounded-md border border-cyan-400/30 bg-cyan-950/10 p-2 text-xs">Loading selected Automation result…</section> : null;
}
