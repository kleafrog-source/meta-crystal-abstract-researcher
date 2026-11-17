export type RunSelectionRequest = { runId: string; sequence: number };

/** Identifies the latest detail request for the currently selected Run. */
export class RunSelectionGuard {
  private selectedRunId: string | null = null;
  private sequence = 0;

  select(runId: string | null) {
    this.selectedRunId = runId;
    this.sequence += 1;
  }

  begin(runId: string): RunSelectionRequest | null {
    if (this.selectedRunId !== runId) return null;
    this.sequence += 1;
    return { runId, sequence: this.sequence };
  }

  accepts(request: RunSelectionRequest, responseRunId: string) {
    return request.runId === responseRunId
      && this.selectedRunId === request.runId
      && this.sequence === request.sequence;
  }

  isSelected(runId: string) {
    return this.selectedRunId === runId;
  }
}
