"use client";

import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

export interface MetricsSample {
  V: number;
  N: number;
  S: number;
  D_f: number;
  G_S: number;
  R_T: number;
  tick: number;
  timestamp: number;
}

/**
 * Hook: live metrics stream.
 *
 * Primary: WebSocket via mini-services/metrics-stream on port 3003.
 *   Connects via Caddy gateway: io("/?XTransformPort=3003")
 *   If your Caddyfile supports XTransformPort query matcher (see /home/z/my-project/Caddyfile),
 *   WS will be used — giving true push-based streaming.
 *
 * Fallback: HTTP polling on /api/system/metrics every 1500ms.
 *   Used automatically if WS doesn't connect within 3 seconds.
 *   Works in any environment without Caddy XTransformPort support.
 *
 * To force WS-only: pass usePollingFallback=false (not recommended).
 */
export function useMetricsStream(options: { usePollingFallback?: boolean } = {}) {
  const { usePollingFallback = true } = options;
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState<"ws" | "polling" | "none">("none");
  const [current, setCurrent] = useState<MetricsSample | null>(null);
  const [history, setHistory] = useState<MetricsSample[]>([]);
  const wsFailedRef = useRef(false);
  const tickRef = useRef(0);

  // === WebSocket attempt ===
  useEffect(() => {
    let s: ReturnType<typeof io> | null = null;
    let failedTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    if (!usePollingFallback) return;

    try {
      s = io("/?XTransformPort=3003", {
        transports: ["websocket", "polling"],
        reconnection: false,
        timeout: 2500,
      });

      failedTimer = setTimeout(() => {
        if (!settled) {
          wsFailedRef.current = true;
          s?.disconnect();
        }
      }, 3000);

      s.on("connect", () => {
        settled = true;
        if (failedTimer) clearTimeout(failedTimer);
        setConnected(true);
        setTransport("ws");
      });

      s.on("disconnect", () => {
        setConnected(false);
        setTransport("none");
      });

      s.on("connect_error", () => {
        if (!settled) {
          wsFailedRef.current = true;
          settled = true;
          if (failedTimer) clearTimeout(failedTimer);
          s?.disconnect();
        }
      });

      s.on("metrics:sample", (sample: MetricsSample) => {
        setCurrent(sample);
        setHistory((prev) => {
          const next = [...prev, sample];
          if (next.length > 60) next.shift();
          return next;
        });
      });
    } catch {
      wsFailedRef.current = true;
    }

    return () => {
      if (failedTimer) clearTimeout(failedTimer);
      s?.disconnect();
    };
  }, [usePollingFallback]);

  // === HTTP polling fallback ===
  useEffect(() => {
    if (!usePollingFallback) return;

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) return;
      const poll = async () => {
        try {
          const res = await fetch("/api/system/metrics", { cache: "no-store" });
          if (!active) return;
          const data = await res.json();
          if (data?.current) {
            tickRef.current += 1;
            const sample: MetricsSample = {
              ...data.current,
              tick: tickRef.current,
            };
            setCurrent(sample);
            setHistory((prev) => {
              const next = [...prev, sample];
              if (next.length > 60) next.shift();
              return next;
            });
            if (!connected) {
              setConnected(true);
              setTransport("polling");
            }
          }
        } catch {
          // silent — will retry
        }
      };
      poll();
      timer = setInterval(poll, 1500);
    };

    // Wait 3.2s to give WS a chance
    const startDelay = setTimeout(startPolling, 3200);

    return () => {
      active = false;
      if (startDelay) clearTimeout(startDelay);
      if (timer) clearInterval(timer);
    };
  }, [usePollingFallback, connected]);

  return { connected, transport, current, history };
}
