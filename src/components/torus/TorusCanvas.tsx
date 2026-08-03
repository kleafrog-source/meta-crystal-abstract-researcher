'use client';

import { useEffect, useRef, useState } from 'react';
import { TorusCanvasRenderer, type SurfaceType, type TorusData } from '@/lib/torus/TorusCanvasRenderer';
import { TorusDataGenerator } from '@/lib/torus/TorusDataGenerator';

interface Props {
  data: TorusData | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onFps?: (fps: number) => void;
  flowEnabled?: boolean;
  autoRotate?: boolean;
  showTorusWireframe?: boolean;
  showEdges?: boolean;
  showLabels?: boolean;
  metaPreset?: string;
  shapePreset?: string;
  colorPreset?: string;
  warpPreset?: string;
  surfaceType?: SurfaceType;
  mouseRotation?: boolean;
  xSpeed?: number;
  ySpeed?: number;
  zSpeed?: number;
  displayRadiusMajor?: number;
  displayRadiusMinor?: number;
  lockRadii?: boolean;
  externalGenerator?: TorusDataGenerator | null;
}

/**
 * React-обёртка над TorusCanvasRenderer.
 * Использует <canvas> напрямую, без Three.js — для производительности.
 * batch-отрисовка линий одним stroke().
 */
export function TorusCanvas({
  data,
  selectedId,
  onSelect,
  onHover,
  onFps,
  flowEnabled = true,
  autoRotate = true,
  showTorusWireframe = true,
  showEdges = true,
  showLabels = false,
  metaPreset,
  shapePreset,
  colorPreset,
  warpPreset,
  surfaceType,
  mouseRotation,
  xSpeed,
  ySpeed,
  zSpeed,
  displayRadiusMajor,
  displayRadiusMinor,
  lockRadii,
  externalGenerator = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TorusCanvasRenderer | null>(null);
  const generatorRef = useRef<TorusDataGenerator | null>(null);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const [internalFps, setInternalFps] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  // Инициализация рендерера
  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new TorusCanvasRenderer(canvasRef.current, {
      autoRotate,
      onSelect: (id) => onSelectRef.current(id),
      onHover: (id) => onHoverRef.current(id),
      onFps: (fps) => {
        setInternalFps(fps);
        if (onFps) onFps(fps);
      },
    });
    rendererRef.current = renderer;
    renderer.start();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      renderer.resize();
    });
    resizeObserver.observe(canvasRef.current);

    // Клик по canvas → выбор точки
    const handleClick = (e: MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const id = renderer.pickNode(mx, my);
      onSelectRef.current(id);
    };
    canvasRef.current.addEventListener('click', handleClick);

    return () => {
      resizeObserver.disconnect();
      canvasRef.current?.removeEventListener('click', handleClick);
      renderer.destroy();
      rendererRef.current = null;
    };
     
  }, []);

  // Обновляем selectedId
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSelected(selectedId);
    }
  }, [selectedId]);

  // Обновляем опции рендера
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setAutoRotate(autoRotate);
      rendererRef.current.setOptions({
        showNodes: showTorusWireframe,
        showEdges,
        showLabels,
      });
    }
  }, [autoRotate, showTorusWireframe, showEdges, showLabels]);

  useEffect(() => {
    if (rendererRef.current && metaPreset) {
      rendererRef.current.applyMetaPreset(metaPreset);
    }
  }, [metaPreset]);

  useEffect(() => {
    if (rendererRef.current && shapePreset) {
      rendererRef.current.applyShapePreset(shapePreset);
    }
  }, [shapePreset]);

  useEffect(() => {
    if (rendererRef.current && colorPreset) {
      rendererRef.current.applyColorPreset(colorPreset);
    }
  }, [colorPreset]);

  useEffect(() => {
    if (rendererRef.current && warpPreset) {
      rendererRef.current.applyWarpPreset(warpPreset);
    }
  }, [warpPreset]);

  useEffect(() => {
    if (rendererRef.current && surfaceType) {
      rendererRef.current.setSurfaceType(surfaceType);
    }
  }, [surfaceType]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setRotationParams({
        mouseRotation,
        xSpeed,
        ySpeed,
        zSpeed,
      });
    }
  }, [mouseRotation, xSpeed, ySpeed, zSpeed]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShapeParams({
        outerRadius: displayRadiusMajor,
        innerRadius: displayRadiusMinor,
        lockRadii,
      });
    }
  }, [displayRadiusMajor, displayRadiusMinor, lockRadii]);

  // Основной цикл: либо используем внешний data, либо эмулируем flow
  useEffect(() => {
    if (!rendererRef.current) return;

    if (data) {
      // Внешний режим: данные приходят снаружи (из API)
      rendererRef.current.update(data);
    } else if (externalGenerator) {
      // Режим генератора: используем внешний генератор (для демо)
      generatorRef.current = null; // не создаём свой
    } else {
      // Режим демо: создаём генератор, эмулируем flow
      if (!generatorRef.current) {
        generatorRef.current = new TorusDataGenerator({
          nNodes: 200,
          nClusters: 8,
          flowEnabled,
        });
      }
      generatorRef.current.setFlowEnabled(flowEnabled);
      const update = () => {
        if (!rendererRef.current || !generatorRef.current) return;
        if (flowEnabled) {
          generatorRef.current.stepFlow(1 / 60);
        }
        const d = generatorRef.current.getData();
        rendererRef.current.update(d);
      };
      update();
      const interval = setInterval(update, 100); // обновляем данные 10 раз/сек
      return () => clearInterval(interval);
    }
  }, [data, externalGenerator, flowEnabled]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ display: 'block', touchAction: 'none' }}
      />
      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-cyan-400 text-xs font-mono pointer-events-none">
        {internalFps} FPS
      </div>
    </div>
  );
}
