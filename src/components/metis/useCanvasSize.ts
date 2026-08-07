"use client";

import { useEffect, useState } from "react";

export interface CanvasSurfaceSize {
  width: number;
  height: number;
  dpr: number;
}

export function useCanvasSize<T extends HTMLElement>(element: T | null) {
  const [size, setSize] = useState<CanvasSurfaceSize>({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    if (!element) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      setSize((prev) => {
        const next = {
          width: Math.max(0, Math.floor(rect.width)),
          height: Math.max(0, Math.floor(rect.height)),
          dpr: window.devicePixelRatio || 1,
        };
        return prev.width === next.width && prev.height === next.height && prev.dpr === next.dpr ? prev : next;
      });
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [element]);

  return size;
}
