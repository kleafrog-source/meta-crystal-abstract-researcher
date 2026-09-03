"use client";

import { useCallback, useEffect, useRef } from "react";
import debounce from "lodash/debounce";

/**
 * Returns a debounced version of `callback` that stays stable across
 * re-renders (so lodash can keep its internal timer). The leading/trailing
 * behaviour mirrors `lodash.debounce` defaults (trailing call).
 *
 * Implementation note: the debounced function lives in a ref and is rebuilt
 * only when `delay` changes (inside an effect, never during render). The
 * latest `callback` is also tracked in a ref so the debounce timer always
 * invokes the freshest closure without being reset. This is what lets the
 * 2.7k-row virtualised list stay smooth — slider / text edits are visually
 * instant while only a debounced commit reaches the global store.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  // Latest callback — updated in an effect so we never read it during render.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // The single debounce instance for the current `delay`.
  const debouncedRef = useRef<T | null>(null);

  useEffect(() => {
    const fn = debounce(
      (...args: Parameters<T>) => callbackRef.current(...args),
      delay,
    ) as T;
    debouncedRef.current = fn;
    return () => {
      fn.cancel();
      debouncedRef.current = null;
    };
  }, [delay]);

  // Stable dispatcher — only reads the ref when actually called (i.e. from
  // an event handler), never during render.
  return useCallback((...args: Parameters<T>) => {
    const fn = debouncedRef.current;
    if (fn) fn(...args);
  }, []) as T;
}
