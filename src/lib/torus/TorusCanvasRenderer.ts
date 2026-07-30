/**
 * TorusCanvasRenderer.ts — v2.0
 * ============================================================================
 * Оптимизированный Canvas-рендерер тора с полным набором возможностей CodePen.
 *
 * Возможности (из CodePen codepen.io/hippiefuturist/pen/gOJaPmM):
 *   - 13 shape presets (Horn Torus, Donut, Stargate, Tensegrity, и т.д.)
 *   - 16 color presets (Aurora Borealis, Black Hole, Sunset, и т.д.)
 *   - 6 warp presets (No Warp, Slow Swirl, Large Waves, Maximum Warp, и т.д.)
 *   - 17 meta presets (комбинации shape+color+warp+surface+rotation)
 *   - 3 surface types: wireframe, points, skin
 *   - XYZ rotation speeds + mouse rotation toggle
 *   - Lock radii together (zoom)
 *   - Vortex warp effect (sin/cos offset по distance)
 *   - Color gradient inner→outer (как в CodePen vertexShader)
 *
 * Интеграция с Python-топологией (torus_flow.py):
 *   - Параметризация тора (u,v) → (x,y,z) из TorusGeometry.to_3d
 *   - TorusFlowField.velocity (flow-источники, toroidal delta)
 *   - trace_flow (движение точек по полю с трением)
 *   - collapse_factor деформирует радиусы R, r
 *
 * Оптимизации:
 *   - Batch-отрисовка: один stroke() на все рёбра, один на меридианы, один на параллели
 *   - Z-сортировка точек (painter's algorithm)
 *   - Кэширование линий тора (пересчёт только при изменении R/r/twist/shape)
 *   - devicePixelRatio-aware resize
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. ПРЕСЕТЫ (из CodePen)
// ----------------------------------------------------------------------------

export const SHAPE_PRESETS: Record<string, { outerRadius: number; innerRadius: number; radialSegments: number; tubularSegments: number }> = {
  'Horn Torus': { outerRadius: 10, innerRadius: 10, radialSegments: 32, tubularSegments: 100 },
  'Horn Torus (Inside)': { outerRadius: 400, innerRadius: 400, radialSegments: 64, tubularSegments: 100 },
  'Donut': { outerRadius: 23, innerRadius: 10, radialSegments: 64, tubularSegments: 100 },
  'Stargate': { outerRadius: 15, innerRadius: 12, radialSegments: 20, tubularSegments: 20 },
  'Tensegrity': { outerRadius: 12, innerRadius: 12, radialSegments: 4, tubularSegments: 3 },
  'Triangle': { outerRadius: 30, innerRadius: 15, radialSegments: 64, tubularSegments: 3 },
  'Square': { outerRadius: 20, innerRadius: 8, radialSegments: 64, tubularSegments: 4 },
  'Universal Lattice': { outerRadius: 257, innerRadius: 245, radialSegments: 64, tubularSegments: 4 },
  'Flower': { outerRadius: 10, innerRadius: 10, radialSegments: 64, tubularSegments: 6 },
  'Inside-Out': { outerRadius: 5, innerRadius: 22, radialSegments: 64, tubularSegments: 32 },
  'Cone': { outerRadius: 1, innerRadius: 20, radialSegments: 3, tubularSegments: 100 },
  'Nut': { outerRadius: 1, innerRadius: 20, radialSegments: 64, tubularSegments: 3 },
  'Ring': { outerRadius: 20, innerRadius: 1, radialSegments: 20, tubularSegments: 100 },
};

export const COLOR_PRESETS: Record<string, { innerColor: string; outerColor: string }> = {
  'Aurora Borealis': { innerColor: '#ff00ed', outerColor: '#664cc2' },
  'Aurora Borealis 2': { innerColor: '#4b7907', outerColor: '#06491b' },
  'Aurora Borealis 3': { innerColor: '#00b6ff', outerColor: '#9e4cc2' },
  'Black Hole': { innerColor: '#000000', outerColor: '#d5d1e5' },
  'Deep Sea': { innerColor: '#84a1b8', outerColor: '#135b5c' },
  'Forest': { innerColor: '#06491b', outerColor: '#4b7907' },
  'Lavender': { innerColor: '#e6e6fa', outerColor: '#9370db' },
  'Ocean': { innerColor: '#4682b4', outerColor: '#00ced1' },
  'R B Contrast': { innerColor: '#ff3300', outerColor: '#17006c' },
  'Rose': { innerColor: '#ffc0cb', outerColor: '#ff69b4' },
  'Sunset': { innerColor: '#fbff00', outerColor: '#cf5151' },
  'Sunset 2': { innerColor: '#2c00ff', outerColor: '#c24c55' },
  'Sunset 3': { innerColor: '#ffc400', outerColor: '#c24c50' },
  'Void': { innerColor: '#18ff00', outerColor: '#07050c' },
  'White Hole': { innerColor: '#e8f4ff', outerColor: '#185859' },
  'Worm Hole': { innerColor: '#ffffff', outerColor: '#8c279c' },
};

export const WARP_PRESETS: Record<string, { warp: number; warpSpeed: number; warpAmplitude: number; warpFrequency: number }> = {
  'No Warp': { warp: 0.0, warpSpeed: 1.0, warpAmplitude: 1.0, warpFrequency: 1.0 },
  'Slow Swirl': { warp: 1.0, warpSpeed: 0.5, warpAmplitude: 1.0, warpFrequency: 1.0 },
  'Fast Swirl': { warp: 1.0, warpSpeed: 2.0, warpAmplitude: 1.0, warpFrequency: 1.0 },
  'Large Waves': { warp: 1.0, warpSpeed: 1.0, warpAmplitude: 2.0, warpFrequency: 0.5 },
  'Small Waves': { warp: 1.0, warpSpeed: 1.0, warpAmplitude: 0.5, warpFrequency: 2.0 },
  'Maximum Warp': { warp: 5.0, warpSpeed: 1.0, warpAmplitude: 5.0, warpFrequency: 5.0 },
};

export const META_PRESETS: Record<string, {
  shapePreset: string; colorPreset: string; warpPreset: string;
  surface: SurfaceType; xSpeed: number; ySpeed: number; zSpeed: number; mouseRotation: boolean;
}> = {
  'Aurora Horn': { shapePreset: 'Horn Torus', colorPreset: 'Aurora Borealis', warpPreset: 'No Warp', surface: 'wireframe', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.0, mouseRotation: true },
  'Cosmic Carousel': { shapePreset: 'Horn Torus', colorPreset: 'Aurora Borealis', warpPreset: 'No Warp', surface: 'points', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.4, mouseRotation: false },
  'Black Hole Stargate': { shapePreset: 'Stargate', colorPreset: 'Black Hole', warpPreset: 'Slow Swirl', surface: 'points', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.0, mouseRotation: true },
  'Lavender Flower': { shapePreset: 'Flower', colorPreset: 'Lavender', warpPreset: 'Small Waves', surface: 'points', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 1.5, mouseRotation: false },
  'Center of the Universe': { shapePreset: 'Horn Torus (Inside)', colorPreset: 'Aurora Borealis', warpPreset: 'Large Waves', surface: 'wireframe', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 1.0, mouseRotation: false },
  'Tensegrity Motion': { shapePreset: 'Tensegrity', colorPreset: 'Aurora Borealis', warpPreset: 'Fast Swirl', surface: 'wireframe', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.0, mouseRotation: true },
  'Particles': { shapePreset: 'Flower', colorPreset: 'Aurora Borealis', warpPreset: 'Maximum Warp', surface: 'points', xSpeed: 0.5, ySpeed: 0.5, zSpeed: 0.5, mouseRotation: false },
  'Particle Accelerator': { shapePreset: 'Donut', colorPreset: 'Sunset 2', warpPreset: 'Maximum Warp', surface: 'points', xSpeed: 0.5, ySpeed: 0.5, zSpeed: 0.5, mouseRotation: false },
  'Orbits': { shapePreset: 'Horn Torus (Inside)', colorPreset: 'Ocean', warpPreset: 'Maximum Warp', surface: 'points', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.0, mouseRotation: false },
  'Portal': { shapePreset: 'Stargate', colorPreset: 'Worm Hole', warpPreset: 'Slow Swirl', surface: 'wireframe', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.5, mouseRotation: false },
  'Wormhole Travel': { shapePreset: 'Universal Lattice', colorPreset: 'Black Hole', warpPreset: 'Large Waves', surface: 'wireframe', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 1.5, mouseRotation: false },
  'Quasar': { shapePreset: 'Horn Torus (Inside)', colorPreset: 'White Hole', warpPreset: 'Fast Swirl', surface: 'wireframe', xSpeed: 5.0, ySpeed: 5.0, zSpeed: 5.0, mouseRotation: false },
  'Jellyfish': { shapePreset: 'Flower', colorPreset: 'Aurora Borealis', warpPreset: 'Large Waves', surface: 'points', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.0, mouseRotation: false },
  'Jelly': { shapePreset: 'Horn Torus', colorPreset: 'Sunset', warpPreset: 'Large Waves', surface: 'wireframe', xSpeed: 1.0, ySpeed: 1.0, zSpeed: 1.0, mouseRotation: false },
  'Jelly Donut': { shapePreset: 'Donut', colorPreset: 'R B Contrast', warpPreset: 'No Warp', surface: 'skin', xSpeed: 0.0, ySpeed: 0.0, zSpeed: 0.0, mouseRotation: true },
  'Ring of Rings': { shapePreset: 'Ring', colorPreset: 'Deep Sea', warpPreset: 'Large Waves', surface: 'points', xSpeed: 1.0, ySpeed: 2.0, zSpeed: 0.0, mouseRotation: false },
};

export type SurfaceType = 'wireframe' | 'points' | 'skin';

// ----------------------------------------------------------------------------
// 2. МАТЕМАТИКА ПРОЕКЦИИ (из CodePen)
// ----------------------------------------------------------------------------

interface Mat3 { m: number[] }

function identity3(): Mat3 { return { m: [1, 0, 0, 0, 1, 0, 0, 0, 1] }; }
function mul3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += a.m[i * 3 + k] * b.m[k * 3 + j];
    r[i * 3 + j] = s;
  }
  return { m: r };
}
function rotX(a: number): Mat3 { const c = Math.cos(a), s = Math.sin(a); return { m: [1, 0, 0, 0, c, -s, 0, s, c] }; }
function rotY(a: number): Mat3 { const c = Math.cos(a), s = Math.sin(a); return { m: [c, 0, s, 0, 1, 0, -s, 0, c] }; }
function rotZ(a: number): Mat3 { const c = Math.cos(a), s = Math.sin(a); return { m: [c, -s, 0, s, c, 0, 0, 0, 1] }; }

function applyMat3(m: Mat3, v: { x: number; y: number; z: number }) {
  return {
    x: m.m[0] * v.x + m.m[1] * v.y + m.m[2] * v.z,
    y: m.m[3] * v.x + m.m[4] * v.y + m.m[5] * v.z,
    z: m.m[6] * v.x + m.m[7] * v.y + m.m[8] * v.z,
  };
}

function project3d(v: { x: number; y: number; z: number }, focal: number, cx: number, cy: number) {
  const denom = focal + v.z;
  const safeDenom = Math.abs(denom) < 0.001 ? (denom < 0 ? -0.001 : 0.001) : denom;
  const scale = focal / safeDenom;
  return { sx: cx + v.x * scale, sy: cy + v.y * scale, scale, z: v.z };
}

// ----------------------------------------------------------------------------
// 3. ПАРАМЕТРИЗАЦИЯ ТОРУ (из Python TorusGeometry.to_3d)
// ----------------------------------------------------------------------------

function torusParam(u: number, v: number, R: number, r: number, twist: number) {
  const vt = v + twist * u;
  const cv = Math.cos(vt), sv = Math.sin(vt), cu = Math.cos(u), su = Math.sin(u);
  return { x: (R + r * cv) * cu, y: (R + r * cv) * su, z: r * sv };
}

// ----------------------------------------------------------------------------
// 4. ТИПЫ ДАННЫХ
// ----------------------------------------------------------------------------

export interface TorusNode {
  id: string; u: number; v: number;
  mass?: number; flow_speed?: number;
  color?: string; size?: number; label?: string;
}

export interface TorusEdge {
  source: string; target: string; intensity?: number;
}

export interface TorusState {
  R: number; r: number;
  collapse_factor: number; twist: number;
}

export interface TorusData {
  nodes: TorusNode[];
  edges: TorusEdge[];
  torus_state: TorusState;
}

interface ProjectedNode {
  id: string; sx: number; sy: number; scale: number; z: number;
  color: string; size: number; label?: string; u: number; v: number;
}

// ----------------------------------------------------------------------------
// 5. РЕНДЕРЕР
// ----------------------------------------------------------------------------

export class TorusCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0; private height = 0; private cx = 0; private cy = 0;
  private focal = 600;

  private data: TorusData | null = null;

  // Углы поворота
  private rotXAngle = -0.45;
  private rotYAngle = 0.6;
  private rotZAngle = 0;
  private autoRotate = true;
  private autoRotateSpeed = 0.003;

  // XYZ speeds (из CodePen rotationParams)
  private xSpeed = 0;
  private ySpeed = 0;
  private zSpeed = 0;
  private useMouseRotation = true;
  private mouseX = 0;
  private mouseY = 0;

  // Shape params (из CodePen shapeParams)
  private shapePresetName = 'Horn Torus';
  private outerRadius = 10;
  private innerRadius = 10;
  private radialSegments = 32;
  private tubularSegments = 100;
  private lockRadii = false;
  private radiusDifference = 0;

  // Color params (из CodePen colorParams)
  private colorPresetName = 'Aurora Borealis';
  private innerColor = '#ff00ed';
  private outerColor = '#664cc2';

  // Warp params (из CodePen warpParams)
  private warpPresetName = 'No Warp';
  private warp = 0;
  private warpSpeed = 1;
  private warpAmplitude = 1;
  private warpFrequency = 1;

  // Surface type (из CodePen currentSurfaceType)
  private surfaceType: SurfaceType = 'wireframe';

  // Опции рендера
  private showNodes = true;
  private showEdges = true;
  private showLabels = false;

  // Цвета фона
  private bgColor = '#050508';
  private bgTrail = 'rgba(5, 5, 8, 0.18)';

  // Состояние мыши
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Выделение
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private onSelectCallback: ((id: string | null) => void) | null = null;
  private onHoverCallback: ((id: string | null) => void) | null = null;

  // FPS
  private fps = 0;
  private frameCount = 0;
  private lastFpsTime = 0;
  private onFpsCallback: ((fps: number) => void) | null = null;

  // Animation
  private animationId: number | null = null;
  private lastFrameTime = 0;
  private timeAccum = 0;

  // Кэш линий тора
  private cachedTorusLines: { points: { x: number; y: number; z: number }[]; color: string }[] = [];
  private cachedTorusKey = '';

  constructor(canvas: HTMLCanvasElement, options?: {
    focal?: number; autoRotate?: boolean;
    onSelect?: (id: string | null) => void;
    onHover?: (id: string | null) => void;
    onFps?: (fps: number) => void;
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    if (options) {
      if (options.focal !== undefined) this.focal = options.focal;
      if (options.autoRotate !== undefined) this.autoRotate = options.autoRotate;
      this.onSelectCallback = options.onSelect ?? null;
      this.onHoverCallback = options.onHover ?? null;
      this.onFpsCallback = options.onFps ?? null;
    }
    this.resize();
    this.attachEvents();
    // Применяем дефолтный meta-preset
    this.applyMetaPreset('Aurora Horn');
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.cachedTorusKey = '';
  }

  update(data: TorusData) {
    this.data = data;
    this.cachedTorusKey = '';
  }

  // --------------------------------------------------------------------------
  // ПРИМЕНЕНИЕ ПРЕСЕТОВ (из CodePen applyMetaPreset)
  // --------------------------------------------------------------------------

  applyMetaPreset(name: string) {
    const p = META_PRESETS[name];
    if (!p) return;
    this.applyShapePreset(p.shapePreset);
    this.applyColorPreset(p.colorPreset);
    this.applyWarpPreset(p.warpPreset);
    this.surfaceType = p.surface;
    this.xSpeed = p.xSpeed;
    this.ySpeed = p.ySpeed;
    this.zSpeed = p.zSpeed;
    this.useMouseRotation = p.mouseRotation;
    this.cachedTorusKey = '';
  }

  applyShapePreset(name: string) {
    const p = SHAPE_PRESETS[name];
    if (!p) return;
    this.shapePresetName = name;
    this.outerRadius = p.outerRadius;
    this.innerRadius = p.innerRadius;
    this.radialSegments = p.radialSegments;
    this.tubularSegments = p.tubularSegments;
    this.radiusDifference = this.innerRadius - this.outerRadius;
    this.cachedTorusKey = '';
  }

  applyColorPreset(name: string) {
    const p = COLOR_PRESETS[name];
    if (!p) return;
    this.colorPresetName = name;
    this.innerColor = p.innerColor;
    this.outerColor = p.outerColor;
  }

  applyWarpPreset(name: string) {
    const p = WARP_PRESETS[name];
    if (!p) return;
    this.warpPresetName = name;
    this.warp = p.warp;
    this.warpSpeed = p.warpSpeed;
    this.warpAmplitude = p.warpAmplitude;
    this.warpFrequency = p.warpFrequency;
  }

  // --------------------------------------------------------------------------
  // SETTERS
  // --------------------------------------------------------------------------

  setShapeParams(params: Partial<{ outerRadius: number; innerRadius: number; radialSegments: number; tubularSegments: number; lockRadii: boolean }>) {
    if (params.outerRadius !== undefined) {
      this.outerRadius = params.outerRadius;
      if (this.lockRadii) {
        this.innerRadius = Math.max(1, Math.min(400, params.outerRadius + this.radiusDifference));
      }
    }
    if (params.innerRadius !== undefined) {
      this.innerRadius = params.innerRadius;
      if (this.lockRadii) {
        this.outerRadius = Math.max(1, Math.min(400, params.innerRadius - this.radiusDifference));
      }
    }
    if (params.radialSegments !== undefined) this.radialSegments = params.radialSegments;
    if (params.tubularSegments !== undefined) this.tubularSegments = params.tubularSegments;
    if (params.lockRadii !== undefined) {
      this.lockRadii = params.lockRadii;
      if (this.lockRadii) this.radiusDifference = this.innerRadius - this.outerRadius;
    }
    this.radiusDifference = this.innerRadius - this.outerRadius;
    this.cachedTorusKey = '';
  }

  setColorParams(params: Partial<{ innerColor: string; outerColor: string }>) {
    if (params.innerColor !== undefined) this.innerColor = params.innerColor;
    if (params.outerColor !== undefined) this.outerColor = params.outerColor;
  }

  setWarpParams(params: Partial<{ warp: number; warpSpeed: number; warpAmplitude: number; warpFrequency: number }>) {
    if (params.warp !== undefined) this.warp = params.warp;
    if (params.warpSpeed !== undefined) this.warpSpeed = params.warpSpeed;
    if (params.warpAmplitude !== undefined) this.warpAmplitude = params.warpAmplitude;
    if (params.warpFrequency !== undefined) this.warpFrequency = params.warpFrequency;
  }

  setRotationParams(params: Partial<{ xSpeed: number; ySpeed: number; zSpeed: number; mouseRotation: boolean }>) {
    if (params.xSpeed !== undefined) this.xSpeed = params.xSpeed;
    if (params.ySpeed !== undefined) this.ySpeed = params.ySpeed;
    if (params.zSpeed !== undefined) this.zSpeed = params.zSpeed;
    if (params.mouseRotation !== undefined) this.useMouseRotation = params.mouseRotation;
  }

  setSurfaceType(surface: SurfaceType) {
    this.surfaceType = surface;
    this.cachedTorusKey = '';
  }

  setAutoRotate(enabled: boolean) {
    this.autoRotate = enabled;
  }

  setOptions(opts: { showNodes?: boolean; showEdges?: boolean; showLabels?: boolean }) {
    if (opts.showNodes !== undefined) this.showNodes = opts.showNodes;
    if (opts.showEdges !== undefined) this.showEdges = opts.showEdges;
    if (opts.showLabels !== undefined) this.showLabels = opts.showLabels;
  }

  setSelected(id: string | null) { this.selectedId = id; }
  setHovered(id: string | null) { this.hoveredId = id; }

  // Геттеры для UI
  getShapePresetName() { return this.shapePresetName; }
  getColorPresetName() { return this.colorPresetName; }
  getWarpPresetName() { return this.warpPresetName; }
  getSurfaceType() { return this.surfaceType; }
  getShapeParams() { return { outerRadius: this.outerRadius, innerRadius: this.innerRadius, radialSegments: this.radialSegments, tubularSegments: this.tubularSegments, lockRadii: this.lockRadii }; }
  getColorParams() { return { innerColor: this.innerColor, outerColor: this.outerColor }; }
  getWarpParams() { return { warp: this.warp, warpSpeed: this.warpSpeed, warpAmplitude: this.warpAmplitude, warpFrequency: this.warpFrequency }; }
  getRotationParams() { return { xSpeed: this.xSpeed, ySpeed: this.ySpeed, zSpeed: this.zSpeed, mouseRotation: this.useMouseRotation }; }

  // --------------------------------------------------------------------------
  // ЗАПУСК / ОСТАНОВКА
  // --------------------------------------------------------------------------

  start() {
    if (this.animationId !== null) return;
    this.lastFrameTime = performance.now();
    this.lastFpsTime = this.lastFrameTime;
    this.frameCount = 0;
    const loop = (t: number) => {
      const dt = Math.min((t - this.lastFrameTime) / 1000, 0.05);
      this.lastFrameTime = t;
      this.timeAccum += dt;
      this.tick(dt);
      this.render();
      this.frameCount++;
      if (t - this.lastFpsTime >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (t - this.lastFpsTime));
        this.frameCount = 0;
        this.lastFpsTime = t;
        if (this.onFpsCallback) this.onFpsCallback(this.fps);
      }
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  destroy() {
    this.stop();
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('mousemove', this.onDocMouseMove);
  }

  // --------------------------------------------------------------------------
  // СОБЫТИЯ МЫШИ
  // --------------------------------------------------------------------------

  private attachEvents() {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('mousemove', this.onDocMouseMove);
  }

  private onDocMouseMove = (e: MouseEvent) => {
    if (this.useMouseRotation) {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.autoRotate = false;
  };

  private onMouseUp = () => { this.isDragging = false; };

  private onMouseMove = (e: MouseEvent) => {
    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.rotYAngle += dx * 0.008;
      this.rotXAngle += dy * 0.008;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      this.detectHover(e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.focal = Math.max(200, Math.min(2000, this.focal * factor));
  };

  private detectHover(mx: number, my: number) {
    if (!this.data) return;
    const projected = this.getProjectedNodes();
    let best: string | null = null;
    let bestDist = 12;
    for (const p of projected) {
      const d = Math.hypot(p.sx - mx, p.sy - my);
      if (d < bestDist) { bestDist = d; best = p.id; }
    }
    if (best !== this.hoveredId) {
      this.hoveredId = best;
      if (this.onHoverCallback) this.onHoverCallback(best);
    }
  }

  // --------------------------------------------------------------------------
  // ТИК: вращение + flow + warp (из CodePen animate + Python trace_flow)
  // --------------------------------------------------------------------------

  private tick(dt: number) {
    // Вращение (из CodePen animate): либо XYZ speeds, либо mouse rotation
    if (this.useMouseRotation) {
      this.rotXAngle = this.mouseY * Math.PI;
      this.rotYAngle = this.mouseX * Math.PI;
    } else {
      this.rotXAngle += this.xSpeed * 0.01;
      this.rotYAngle += this.ySpeed * 0.01;
      this.rotZAngle += this.zSpeed * 0.01;
    }

    // Auto-rotate (когда мышь не используется)
    if (this.autoRotate && !this.isDragging && this.useMouseRotation === false) {
      this.rotYAngle += this.autoRotateSpeed;
    }

    // Эмуляция torus_flow.py: точки движутся по полю (если есть flow_speed)
    if (this.data) {
      for (const n of this.data.nodes) {
        const fs = n.flow_speed ?? 0;
        if (fs !== 0) {
          n.u = (n.u + fs * dt + 2 * Math.PI) % (2 * Math.PI);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Деформированные радиусы (из Python: collapse_factor сжимает R, r)
  // --------------------------------------------------------------------------

  private getDeformedRadii(): { R: number; r: number; twist: number } {
    // Нормализуем радиусы из CodePen (1..400) к нашему масштабу (3..200)
    const scale = 200 / 400; // 1 единица CodePen = 0.5 наших единиц
    let R = this.outerRadius * scale;
    let r = this.innerRadius * scale;
    // collapse_factor из torus_state
    if (this.data) {
      const cf = Math.max(0, Math.min(1, this.data.torus_state.collapse_factor));
      R *= (1 - cf);
      r *= (1 - cf * 0.7);
    }
    // Защита от деления на 0
    R = Math.max(0.1, R);
    r = Math.max(0.1, r);
    const twist = this.data ? this.data.torus_state.twist : 0;
    return { R, r, twist };
  }

  // --------------------------------------------------------------------------
  // Цвет по дистанции от центра (из CodePen vertexShader: mix(inner, outer, t))
  // --------------------------------------------------------------------------

  private getColorByDistance(x: number, y: number, maxDist: number): string {
    const dist = Math.sqrt(x * x + y * y);
    const t = Math.max(0, Math.min(1, dist / Math.max(0.1, maxDist)));
    return this.lerpColor(this.innerColor, this.outerColor, t);
  }

  private lerpColor(c1: string, c2: string, t: number): string {
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
  }

  // --------------------------------------------------------------------------
  // КЭШ ЛИНИЙ ТОРУ (меридианы + параллели по shape preset)
  // --------------------------------------------------------------------------

  private getTorusLines(): { points: { x: number; y: number; z: number }[]; color: string }[] {
    const { R, r, twist } = this.getDeformedRadii();
    const key = `${R.toFixed(3)}|${r.toFixed(3)}|${twist.toFixed(3)}|${this.shapePresetName}|${this.radialSegments}|${this.tubularSegments}|${this.surfaceType}`;
    if (key === this.cachedTorusKey && this.cachedTorusLines.length > 0) {
      return this.cachedTorusLines;
    }

    const lines: { points: { x: number; y: number; z: number }[]; color: string }[] = [];
    const N_MERIDIANS = Math.min(this.radialSegments, 64);  // ограничиваем для производительности
    const N_PARALLELS = Math.min(this.tubularSegments, 32);
    const N_SEG = 64;

    // Меридианы (фиксируем u, обходим v)
    for (let i = 0; i < N_MERIDIANS; i++) {
      const u = (i / N_MERIDIANS) * 2 * Math.PI;
      const pts: { x: number; y: number; z: number }[] = [];
      for (let j = 0; j <= N_SEG; j++) {
        const v = (j / N_SEG) * 2 * Math.PI;
        pts.push(torusParam(u, v, R, r, twist));
      }
      // Цвет по углу меридиана
      const t = i / N_MERIDIANS;
      const color = this.lerpColor(this.innerColor, this.outerColor, t);
      lines.push({ points: pts, color });
    }

    // Параллели (фиксируем v, обходим u) — только для wireframe
    if (this.surfaceType === 'wireframe') {
      for (let i = 0; i < N_PARALLELS; i++) {
        const v = (i / N_PARALLELS) * 2 * Math.PI;
        const pts: { x: number; y: number; z: number }[] = [];
        for (let j = 0; j <= N_SEG; j++) {
          const u = (j / N_SEG) * 2 * Math.PI;
          pts.push(torusParam(u, v, R, r, twist));
        }
        const t = 0.5 + 0.5 * Math.sin(v);
        const color = this.lerpColor(this.outerColor, this.innerColor, t);
        lines.push({ points: pts, color });
      }
    }

    this.cachedTorusLines = lines;
    this.cachedTorusKey = key;
    return lines;
  }

  // --------------------------------------------------------------------------
  // ПРОЕКЦИЯ ВСЕХ ТОЧЕК С WARP-ЭФФЕКТОМ (из CodePen animate)
  // --------------------------------------------------------------------------

  private getProjectedNodes(): ProjectedNode[] {
    if (!this.data) return [];
    const { R, r, twist } = this.getDeformedRadii();
    const mat = mul3(rotX(this.rotXAngle), mul3(rotY(this.rotYAngle), rotZ(this.rotZAngle)));
    const time = this.timeAccum * this.warpSpeed;

    const projected: ProjectedNode[] = [];
    for (const n of this.data.nodes) {
      let p3d = torusParam(n.u, n.v, R, r, twist);

      // WARP-ЭФФЕКТ (из CodePen animate): sin/cos offset по distance
      if (this.warp > 0) {
        const distance = Math.sqrt(p3d.x * p3d.x + p3d.y * p3d.y);
        const offsetX = Math.sin(distance * this.warpFrequency + time) * this.warpAmplitude * this.warp * 0.05;
        const offsetY = Math.cos(distance * this.warpFrequency + time) * this.warpAmplitude * this.warp * 0.05;
        const offsetZ = Math.sin(distance * this.warpFrequency - time) * this.warpAmplitude * this.warp * 0.05;
        p3d = { x: p3d.x + offsetX, y: p3d.y + offsetY, z: p3d.z + offsetZ };
      }

      const rotated = applyMat3(mat, p3d);
      const proj = project3d(rotated, this.focal, this.cx, this.cy);

      // Цвет: если у ноды есть свой цвет — используем его, иначе градиент по дистанции
      let color = n.color ?? this.getColorByDistance(p3d.x, p3d.y, R);

      projected.push({
        id: n.id, sx: proj.sx, sy: proj.sy, scale: proj.scale, z: proj.z,
        color, size: n.size ?? 3, label: n.label, u: n.u, v: n.v,
      });
    }
    // Z-сортировка
    projected.sort((a, b) => b.z - a.z);
    return projected;
  }

  // --------------------------------------------------------------------------
  // РЕНДЕР
  // --------------------------------------------------------------------------

  render() {
    const ctx = this.ctx;
    if (!this.data) {
      ctx.fillStyle = this.bgColor;
      ctx.fillRect(0, 0, this.width, this.height);
      return;
    }

    // 1. Очистка с trail
    ctx.fillStyle = this.bgTrail;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Каркас тора (только wireframe; для points/skin — пропускаем линии)
    if (this.surfaceType === 'wireframe') {
      const torusLines = this.getTorusLines();
      // Группируем по цвету для batch
      const byColor = new Map<string, { x: number; y: number; z: number }[][]>();
      for (const l of torusLines) {
        if (!byColor.has(l.color)) byColor.set(l.color, []);
        byColor.get(l.color)!.push(l.points);
      }
      const mat = mul3(rotX(this.rotXAngle), mul3(rotY(this.rotYAngle), rotZ(this.rotZAngle)));
      for (const [color, linesArr] of byColor) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        for (const pts of linesArr) {
          for (let i = 0; i < pts.length; i++) {
            const r = applyMat3(mat, pts[i]);
            const p = project3d(r, this.focal, this.cx, this.cy);
            if (i === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (this.surfaceType === 'skin') {
      // Skin: заливка полигонов тора (упрощённо — рисуем заполненные круги)
      const torusLines = this.getTorusLines();
      const mat = mul3(rotX(this.rotXAngle), mul3(rotY(this.rotYAngle), rotZ(this.rotZAngle)));
      ctx.globalAlpha = 0.15;
      for (const l of torusLines) {
        ctx.fillStyle = l.color;
        ctx.beginPath();
        for (let i = 0; i < l.points.length; i++) {
          const r = applyMat3(mat, l.points[i]);
          const p = project3d(r, this.focal, this.cx, this.cy);
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 3. Рёбра (batch)
    if (this.showEdges && this.data.edges.length > 0) {
      const projected = this.getProjectedNodes();
      const projMap = new Map<string, ProjectedNode>();
      for (const p of projected) projMap.set(p.id, p);
      ctx.strokeStyle = 'rgba(0, 191, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const e of this.data.edges) {
        const a = projMap.get(e.source);
        const b = projMap.get(e.target);
        if (!a || !b) continue;
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
      }
      ctx.stroke();
    }

    // 4. Точки (Z-сортированные)
    if (this.showNodes) {
      const projected = this.getProjectedNodes();
      for (const p of projected) {
        const isSel = p.id === this.selectedId;
        const isHov = p.id === this.hoveredId;
        const sizeFactor = isSel ? 2.0 : isHov ? 1.5 : 1.0;
        const baseSize = p.size * Math.max(0.3, Math.min(2.0, p.scale * 0.5)) * sizeFactor;
        if (isSel || isHov) {
          ctx.fillStyle = isSel ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.12)';
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, baseSize * 3, 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, baseSize, 0, 2 * Math.PI);
        ctx.fill();
        if (this.showLabels && p.label) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '10px monospace';
          ctx.fillText(p.label, p.sx + 6, p.sy - 6);
        }
      }
    }

    // 5. HUD
    this.renderHud();
  }

  private renderHud() {
    const ctx = this.ctx;
    const { R, r, twist } = this.getDeformedRadii();
    ctx.fillStyle = 'rgba(0, 191, 255, 0.7)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    const lines = [
      `FPS: ${this.fps}`,
      `Shape: ${this.shapePresetName}  Surface: ${this.surfaceType}`,
      `Color: ${this.colorPresetName}  Warp: ${this.warpPresetName}`,
      `R: ${R.toFixed(1)}  r: ${r.toFixed(1)}  twist: ${twist.toFixed(3)}`,
      this.data ? `Nodes: ${this.data.nodes.length}  Edges: ${this.data.edges.length}` : '',
    ].filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 12, 20 + i * 16);
    }
    ctx.textAlign = 'left';
  }

  pickNode(mx: number, my: number): string | null {
    const projected = this.getProjectedNodes();
    let best: string | null = null;
    let bestDist = 12;
    for (const p of projected) {
      const d = Math.hypot(p.sx - mx, p.sy - my);
      if (d < bestDist) { bestDist = d; best = p.id; }
    }
    return best;
  }
}
