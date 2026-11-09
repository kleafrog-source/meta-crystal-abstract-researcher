import { describe, expect, it, vi } from "vitest";
import { NodeRequestError, providerFailure, withNodeRetries } from "./node-retry";

describe("withNodeRetries", () => {
  it("treats an individual provider attempt timeout as retryable network failure", () => {
    expect(providerFailure(new DOMException("The operation timed out", "TimeoutError")).category).toBe("network");
    expect(providerFailure(new DOMException("User stopped", "AbortError")).category).toBe("invalid");
  });
  it("retries transient errors with finite backoff and returns success", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new NodeRequestError("busy", 503, undefined, "http")).mockResolvedValue("ok");
    const onRetry = vi.fn();
    await expect(withNodeRetries(operation, { signal: new AbortController().signal, maxAttempts: 3, maxElapsedMs: 10_000, perAttemptTimeoutMs: 1000, random: () => 0, sleep: async () => {}, onRetry })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ nextAttempt: 2, waitMs: 600 }));
  });
  it("does not retry authorization/configuration errors", async () => {
    const operation = vi.fn().mockRejectedValue(new NodeRequestError("unauthorized", 401, undefined, "http"));
    await expect(withNodeRetries(operation, { signal: new AbortController().signal, maxAttempts: 4, maxElapsedMs: 10_000, perAttemptTimeoutMs: 1000 })).rejects.toThrow("unauthorized");
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("aborts during backoff", async () => {
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(new NodeRequestError("busy", 502, undefined, "http"));
    const sleep = vi.fn(async (_ms: number, signal: AbortSignal) => { controller.abort(); if (signal.aborted) throw new DOMException("stop", "AbortError"); });
    await expect(withNodeRetries(operation, { signal: controller.signal, maxAttempts: 4, maxElapsedMs: 10_000, perAttemptTimeoutMs: 1000, sleep })).rejects.toMatchObject({ name: "AbortError" });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After without exceeding the remaining time budget", async () => {
    const operation = vi.fn().mockRejectedValue(new NodeRequestError("rate limited", 429, 4000, "http"));
    const sleep = vi.fn(async () => {});
    await expect(withNodeRetries(operation, { signal: new AbortController().signal, maxAttempts: 4, maxElapsedMs: 3000, perAttemptTimeoutMs: 1000, sleep })).rejects.toThrow(/budget exhausted/u);
    expect(sleep).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("continues from the persisted attempt count instead of resetting the cap", async () => {
    const operation = vi.fn().mockRejectedValue(new NodeRequestError("still unavailable", 503, undefined, "http"));
    const onAttempt = vi.fn();
    await expect(withNodeRetries(operation, { signal: new AbortController().signal, maxAttempts: 4, initialAttempts: 3, maxElapsedMs: 10_000, perAttemptTimeoutMs: 1000, onAttempt })).rejects.toThrow("still unavailable");
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(4);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
