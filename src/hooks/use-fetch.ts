"use client";

import { useState, useEffect, useCallback } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Simple fetch hook with manual refresh trigger.
 */
export function useFetch<T>(url: string | null, opts?: RequestInit): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) {
      // Use a micro-deferred update to avoid synchronous setState in effect body
      Promise.resolve().then(() => {
        setData(null);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      fetch(url, { ...opts, signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) {
            const txt = await r.text().catch(() => "");
            throw new Error(`${r.status}: ${txt || r.statusText}`);
          }
          return r.json();
        })
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setLoading(false);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e.message);
            setLoading(false);
          }
        });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, nonce]);

  return { data, loading, error, refresh };
}

/**
 * POST helper that returns { ok, ...payload } or throws.
 */
export async function apiPost<T = any>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  return data as T;
}

export async function apiPut<T = any>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  return data as T;
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { method: "DELETE" });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  return data as T;
}
