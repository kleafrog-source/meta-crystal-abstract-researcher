'use client';

import { useEffect, useRef } from 'react';
import { getAnalyzerData } from '@strudel/webaudio';
import { usePlayerStore } from '@/lib/state/store';

/**
 * Master oscilloscope. The engine routes every evaluated pattern through
 * `.analyze(1)` (editPattern hook), so analyser id 1 carries the master signal.
 */
export default function MasterScope() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    let frame = 0;
    const accent = getComputedStyle(canvas).getPropertyValue('--acid').trim() || '#c5f74f';

    const draw = () => {
      frame = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);
      let data: Float32Array | undefined;
      if (isPlaying) {
        try {
          data = getAnalyzerData('time', 1) as Float32Array | undefined;
        } catch {
          data = undefined;
        }
      }
      ctx.beginPath();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = isPlaying ? 0.9 : 0.25;
      ctx.lineWidth = 1.5;
      if (data && data.length > 0) {
        for (let i = 0; i < width; i++) {
          const v = data[Math.floor((i / width) * data.length)] ?? 0;
          const y = height / 2 - v * height * 0.48;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
      } else {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
      }
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  return <canvas ref={canvasRef} className="h-6 w-36" aria-hidden />;
}
