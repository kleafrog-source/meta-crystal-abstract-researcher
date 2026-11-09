export interface NodeRetryOptions {
  signal: AbortSignal;
  maxAttempts: number;
  maxElapsedMs: number;
  perAttemptTimeoutMs: number;
  initialAttempts?: number;
  initialElapsedMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onAttempt?: (attempt: number) => void | Promise<void>;
  onRetry?: (state: { nextAttempt: number; waitMs: number; message: string; error: unknown }) => void | Promise<void>;
}

export class NodeRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs?: number, readonly category: "http" | "network" | "format" | "invalid" = "invalid", readonly diagnostics?: Record<string, unknown>) {
    super(message);
    this.name = "NodeRequestError";
  }
}

/** Convert a provider failure into the retry policy's transport/format categories. */
export function providerFailure(error: unknown): NodeRequestError {
  if (error instanceof NodeRequestError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const name = error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name) : "";
  const status = /(?:HTTP|returned)\s+(\d{3})/iu.exec(message)?.[1];
  if (status) return new NodeRequestError(message, Number(status), undefined, /(?:HTTP|returned)\s+5\d\d/iu.test(message) || /HTTP (?:408|425|429)/iu.test(message) ? "http" : "invalid");
  if (name === "TimeoutError" || error instanceof TypeError || /fetch failed|network|socket|ECONNRESET|ETIMEDOUT/iu.test(message)) {
    return new NodeRequestError(message, undefined, undefined, "network");
  }
  return new NodeRequestError(message, undefined, undefined, /empty|truncated|format|response/iu.test(message) ? "format" : "invalid");
}

export function retryableNodeError(error: unknown): boolean {
  if (!(error instanceof NodeRequestError)) return false;
  if (error.category === "network" || error.category === "format") return true;
  if (error.category !== "http" || error.status === undefined) return false;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

function abortError() { return new DOMException("Automation stopped", "AbortError"); }

export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(abortError()); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function withNodeRetries<T>(operation: (signal: AbortSignal) => Promise<T>, options: NodeRetryOptions): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(5, Math.trunc(options.maxAttempts)));
  const started = Date.now();
  let elapsedBefore = Math.max(0, options.initialElapsedMs ?? 0);
  const firstAttempt = Math.max(1, Math.trunc(options.initialAttempts ?? 0) + 1);
  const sleep = options.sleep ?? abortableDelay;
  for (let attempt = firstAttempt; attempt <= maxAttempts; attempt += 1) {
    if (options.signal.aborted) throw abortError();
    if (elapsedBefore + Date.now() - started >= options.maxElapsedMs) throw new NodeRequestError("Node retry time budget exhausted.", undefined, undefined, "invalid");
    await options.onAttempt?.(attempt);
    const timeout = AbortSignal.timeout(options.perAttemptTimeoutMs);
    const signal = AbortSignal.any([options.signal, timeout]);
    try { return await operation(signal); }
    catch (error) {
      if (options.signal.aborted) throw abortError();
      if (!retryableNodeError(error) || attempt >= maxAttempts) throw error;
      const elapsed = elapsedBefore + Date.now() - started;
      if (elapsed >= options.maxElapsedMs) throw error;
      const exponential = Math.min(15_000, 800 * (2 ** (attempt - 1)));
      const jittered = Math.round(exponential * (0.75 + (options.random ?? Math.random)() * 0.5));
      const waitMs = Math.max(jittered, Math.min(30_000, Math.max(0, (error as NodeRequestError).retryAfterMs ?? 0)));
      if (elapsed + waitMs >= options.maxElapsedMs) throw new NodeRequestError(`${(error as Error).message} Retry time budget exhausted before the next attempt.`, (error as NodeRequestError).status, undefined, (error as NodeRequestError).category);
      await options.onRetry?.({ nextAttempt: attempt + 1, waitMs, message: error instanceof Error ? error.message : String(error), error });
      await sleep(waitMs, options.signal);
    }
  }
  throw new NodeRequestError("Node retry budget exhausted.");
}
