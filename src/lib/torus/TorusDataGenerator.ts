/**
 * TorusDataGenerator.ts
 * ============================================================================
 * Эмулятор Python-логики `torus_flow.py` для тестирования TorusCanvasRenderer.
 *
 * Что эмулируется (взято из Python-модуля torus_flow.py):
 *   1. KMeans-кластеризация эмбеддингов → распределение точек по кластерам
 *      (каждый кластер получает свой базовый угол u).
 *   2. Внутри кластера точки распределяются по v от 0 до 2π.
 *   3. Flow-источники (FlowSource) создают векторное поле; точки движутся
 *      по полю (trace_flow) с трением.
 *   4. Toroidal delta для обёртывания на [0, 2π].
 *   5. collapse_factor плавно меняется со временем (синусоида) — демонстрирует
 *      деформацию тора.
 * ============================================================================
 */

import type { TorusData, TorusNode, TorusEdge, TorusState } from './TorusCanvasRenderer';

// Кластер-цвета (8 штук, как в UI)
const CLUSTER_COLORS = [
  '#00BFFF', '#FFD700', '#FF6B9D', '#7CFC00', '#FF8C00',
  '#9370DB', '#00FA9A', '#FF4500',
];

// Toroidal delta (из Python: _toroidal_delta)
function toroidalDelta(a: number, b: number): number {
  return ((a - b + Math.PI) % (2 * Math.PI)) - Math.PI;
}

// Hash → spin ±1 (из Python: _deterministic_spin)
function deterministicSpin(text: string, index: number): number {
  let h = 0;
  const s = `${index}:${text}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h & 1) === 0 ? 1 : -1;
}

interface FlowSource {
  x: number;
  y: number;
  mass: number;
  spin: number;
}

/**
 * Поле скоростей на торе (из Python: TorusFlowField.velocity).
 * Возвращает (vx, vy) в (u, v) пространстве.
 */
function velocity(
  u: number,
  v: number,
  sources: FlowSource[],
  epsilon: number,
): { vx: number; vy: number } {
  let vx = 0, vy = 0;
  for (const s of sources) {
    const dx = toroidalDelta(u, s.x);
    const dy = toroidalDelta(v, s.y);
    const r2 = dx * dx + dy * dy + epsilon * epsilon;
    const r = Math.sqrt(r2);
    const radial = s.mass / r2;
    const rx = -dx / r;
    const ry = -dy / r;
    const tang = (0.4 * s.spin) / r;
    const tx = -ry;
    const ty = rx;
    vx += radial * rx + tang * tx;
    vy += radial * ry + tang * ty;
  }
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > 0) {
    const scale = Math.tanh(0.7 * speed) / (speed + 1e-9);
    vx *= scale;
    vy *= scale;
  }
  return { vx, vy };
}

export interface GenOptions {
  nNodes?: number;       // всего точек (по умолчанию 200)
  nClusters?: number;    // кластеров (по умолчанию 8)
  R?: number;            // большой радиус (по умолчанию 200)
  r?: number;            // малый радиус (по умолчанию 80)
  epsilon?: number;      // регуляризатор поля (по умолчанию 0.15)
  edgeDensity?: number;  // 0..1 — вероятность ребра между точками одного кластера
  collapseAmplitude?: number; // 0..1 — амплитуда колебаний collapse_factor
  collapsePeriod?: number;     // секунд — период колебаний collapse
  twistAmplitude?: number;     // 0..0.3 — амплитуда закрутки
  flowEnabled?: boolean;       // двигать ли точки по полю
}

export class TorusDataGenerator {
  private nodes: TorusNode[] = [];
  private edges: TorusEdge[] = [];
  private sources: FlowSource[] = [];
  private clusterOf: Map<string, number> = new Map();
  private opts: Required<GenOptions>;
  private startTime: number = 0;

  constructor(opts: GenOptions = {}) {
    this.opts = {
      nNodes: opts.nNodes ?? 200,
      nClusters: opts.nClusters ?? 8,
      R: opts.R ?? 200,
      r: opts.r ?? 80,
      epsilon: opts.epsilon ?? 0.15,
      edgeDensity: opts.edgeDensity ?? 0.05,
      collapseAmplitude: opts.collapseAmplitude ?? 0.3,
      collapsePeriod: opts.collapsePeriod ?? 12,
      twistAmplitude: opts.twistAmplitude ?? 0.05,
      flowEnabled: opts.flowEnabled ?? true,
    };
    this.generate();
  }

  setFlowEnabled(enabled: boolean) {
    this.opts.flowEnabled = enabled;
  }

  /** Первичная генерация: KMeans-подобное распределение + рёбра + источники. */
  private generate() {
    const { nNodes, nClusters, edgeDensity } = this.opts;
    this.nodes = [];
    this.edges = [];
    this.clusterOf.clear();
    this.sources = [];

    // Распределение: nClusters кластеров, каждый — со своим базовым углом u
    const clusterAngles: number[] = [];
    for (let c = 0; c < nClusters; c++) {
      clusterAngles.push((c / nClusters) * 2 * Math.PI);
    }
    // Точки на кластер
    const perCluster = Math.ceil(nNodes / nClusters);
    let idCounter = 0;
    for (let c = 0; c < nClusters; c++) {
      const baseU = clusterAngles[c];
      for (let i = 0; i < perCluster && this.nodes.length < nNodes; i++) {
        const id = `n${idCounter++}`;
        // u — базовый угол + небольшой разброс внутри кластера
        const u = (baseU + (Math.random() - 0.5) * 0.4 + 2 * Math.PI) % (2 * Math.PI);
        // v — равномерно от 0 до 2π
        const v = (i / perCluster) * 2 * Math.PI;
        const mass = 0.5 + Math.random() * 1.5;
        const flowSpeed = this.opts.flowEnabled ? 0.05 + Math.random() * 0.15 : 0;
        this.nodes.push({
          id,
          u,
          v,
          mass,
          flow_speed: flowSpeed,
          color: CLUSTER_COLORS[c % CLUSTER_COLORS.length],
          size: 2 + Math.random() * 2,
          label: id,
        });
        this.clusterOf.set(id, c);
        // Flow-источник для каждой точки (как в build_flow_sources)
        this.sources.push({
          x: u,
          y: v,
          mass: mass * 0.3, // ослабляем, чтобы поле было умеренным
          spin: deterministicSpin(id, idCounter),
        });
      }
    }

    // Рёбра: соединяем точки одного кластера с заданной плотностью
    const byCluster: Map<number, TorusNode[]> = new Map();
    for (const n of this.nodes) {
      const c = this.clusterOf.get(n.id)!;
      if (!byCluster.has(c)) byCluster.set(c, []);
      byCluster.get(c)!.push(n);
    }
    for (const [, members] of byCluster) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          if (Math.random() < edgeDensity) {
            this.edges.push({
              source: members[i].id,
              target: members[j].id,
              intensity: 0.3 + Math.random() * 0.7,
            });
          }
        }
      }
    }
    // + несколько межкластерных рёбер для разнообразия
    for (let k = 0; k < nClusters * 2; k++) {
      const a = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      const b = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      if (a && b && a.id !== b.id && this.clusterOf.get(a.id) !== this.clusterOf.get(b.id)) {
        this.edges.push({ source: a.id, target: b.id, intensity: 0.2 });
      }
    }

    this.startTime = performance.now() / 1000;
  }

  /** Обновить состояние и вернуть текущий TorusData. */
  getData(): TorusData {
    const t = performance.now() / 1000 - this.startTime;
    const { collapseAmplitude, collapsePeriod, twistAmplitude, R, r } = this.opts;

    // collapse_factor: плавная синусоида 0..amplitude
    const phase = (t / collapsePeriod) * 2 * Math.PI;
    const collapse_factor = collapseAmplitude * (0.5 + 0.5 * Math.sin(phase));
    // twist: тоже синусоида
    const twist = twistAmplitude * Math.sin(phase * 0.7);

    return {
      nodes: this.nodes,
      edges: this.edges,
      torus_state: {
        R,
        r,
        collapse_factor,
        twist,
      },
    };
  }

  /**
   * Эмуляция trace_flow: подвинуть точки по полю скоростей.
   * Вызывается из цикла анимации (раз в кадр, dt в секундах).
   */
  stepFlow(dt: number) {
    if (!this.opts.flowEnabled) return;
    const { epsilon } = this.opts;
    for (const n of this.nodes) {
      const { vx, vy } = velocity(n.u, n.v, this.sources, epsilon);
      // Friction (из Python: vx *= 1 - friction)
      const friction = 0.01;
      const ux = vx * (1 - friction);
      const uy = vy * (1 - friction);
      // Обновление с обёртыванием (x = (x + vx*dt) % 2π)
      n.u = (n.u + ux * dt * 2 + 2 * Math.PI) % (2 * Math.PI);
      n.v = (n.v + uy * dt * 2 + 2 * Math.PI) % (2 * Math.PI);
    }
  }

  /** Установить новый collapse_factor вручную (для UI-контролов). */
  setCollapse(value: number) {
    this.opts.collapseAmplitude = 0;
    // Прямое управление: переопределяем через поле
    (this as any)._manualCollapse = Math.max(0, Math.min(1, value));
  }

  /** Получить текущий manual-collapse (если задан). */
  getManualCollapse(): number | null {
    return (this as any)._manualCollapse ?? null;
  }

  /** Узлы по кластерам. */
  getClusters(): Map<number, TorusNode[]> {
    const m: Map<number, TorusNode[]> = new Map();
    for (const n of this.nodes) {
      const c = this.clusterOf.get(n.id)!;
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(n);
    }
    return m;
  }

  /** Число узлов, рёбер. */
  getStats() {
    return {
      nNodes: this.nodes.length,
      nEdges: this.edges.length,
      nClusters: this.opts.nClusters,
    };
  }
}
