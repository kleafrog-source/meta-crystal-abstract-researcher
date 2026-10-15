interface VerificationJob { recordId: string; startedAt: number; controller: AbortController }

const state = globalThis as typeof globalThis & { __crossModalVerificationJob?: VerificationJob };

export function startVerificationJob(recordId: string) {
  if (state.__crossModalVerificationJob) throw new Error("Another cycle verification is already active");
  const job = { recordId, startedAt: Date.now(), controller: new AbortController() }; state.__crossModalVerificationJob = job; return job;
}
export function finishVerificationJob(job: VerificationJob) { if (state.__crossModalVerificationJob === job) state.__crossModalVerificationJob = undefined; }
export function stopVerificationJob() { const job = state.__crossModalVerificationJob; if (!job) return false; job.controller.abort(); return true; }
export function verificationJobStatus() { const job = state.__crossModalVerificationJob; return job ? { running: true, record_id: job.recordId, started_at: job.startedAt } : { running: false, record_id: null, started_at: null }; }
