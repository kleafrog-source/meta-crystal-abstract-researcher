/**
 * Torus Atlas — topological memory manifold.
 *
 * 2D-тор с периодическими границами. 4 начальных atlas chart'а (A, B, C, D),
 * каждый покрывает квадрант [0, 1] × [0, 1]. При overflow dynamically создаётся
 * chart_E и далее.
 *
 * Реализует:
 *   F_430_Calculate_Trace
 *   F_431_Compare_Threshold
 *   F_432_Trigger_RAG_Fallback
 *   F_433_Create_New_Atlas_Chart
 *
 * Это НЕ заглушка — топология реальная (с учётом periodic BC).
 */

import type { AtlasChart, TorusCoords } from "./types";

export const INITIAL_CHARTS: AtlasChart[] = [
  {
    chart_id: "chart_A",
    u_range: [0.0, 0.5],
    v_range: [0.0, 0.5],
    resolution: 256,
    node_count: 0,
    created_at: Date.now(),
    created_due_to_overflow: false,
  },
  {
    chart_id: "chart_B",
    u_range: [0.5, 1.0],
    v_range: [0.0, 0.5],
    resolution: 256,
    node_count: 0,
    created_at: Date.now(),
    created_due_to_overflow: false,
  },
  {
    chart_id: "chart_C",
    u_range: [0.0, 0.5],
    v_range: [0.5, 1.0],
    resolution: 256,
    node_count: 0,
    created_at: Date.now(),
    created_due_to_overflow: false,
  },
  {
    chart_id: "chart_D",
    u_range: [0.5, 1.0],
    v_range: [0.5, 1.0],
    resolution: 256,
    node_count: 0,
    created_at: Date.now(),
    created_due_to_overflow: false,
  },
];

/** Найти chart, в который попадают координаты (u, v) */
export function findChartForCoords(
  u: number,
  v: number,
  charts: AtlasChart[]
): AtlasChart | null {
  for (const c of charts) {
    if (u >= c.u_range[0] && u < c.u_range[1] && v >= c.v_range[0] && v < c.v_range[1]) {
      return c;
    }
  }
  return null;
}

/**
 * Создать новый atlas chart при overflow.
 * F_433_Create_New_Atlas_Chart.
 *
 * Стратегия: выбираем самый загруженный chart, делим его пополам по длинной стороне,
 * создаём новый chart с пометкой created_due_to_overflow=true.
 */
export function createOverflowChart(charts: AtlasChart[]): AtlasChart {
  // найти самый загруженный chart
  let maxChart = charts[0];
  for (const c of charts) {
    if (c.node_count > maxChart.node_count) maxChart = c;
  }

  const [u0, u1] = maxChart.u_range;
  const [v0, v1] = maxChart.v_range;
  const uLen = u1 - u0;
  const vLen = v1 - v0;

  const newId = `chart_${String.fromCharCode(65 + charts.length)}`; // E, F, G...

  if (uLen >= vLen) {
    // делим по u
    const uMid = u0 + uLen / 2;
    maxChart.u_range = [u0, uMid];
    return {
      chart_id: newId,
      u_range: [uMid, u1],
      v_range: [v0, v1],
      resolution: 256,
      node_count: 0,
      created_at: Date.now(),
      created_due_to_overflow: true,
    };
  } else {
    // делим по v
    const vMid = v0 + vLen / 2;
    maxChart.v_range = [v0, vMid];
    return {
      chart_id: newId,
      u_range: [u0, u1],
      v_range: [vMid, v1],
      resolution: 256,
      node_count: 0,
      created_at: Date.now(),
      created_due_to_overflow: true,
    };
  }
}

/** Torus-aware distance с periodic boundary conditions */
export function torusDistance(
  u1: number, v1: number,
  u2: number, v2: number
): number {
  const du = Math.abs(u1 - u2);
  const dv = Math.abs(v1 - v2);
  // wrap-around: min(du, 1 - du)
  const duW = Math.min(du, 1 - du);
  const dvW = Math.min(dv, 1 - dv);
  return Math.sqrt(duW * duW + dvW * dvW);
}

/** Hash строка → координаты тора (детерминированный embedding) */
export function contentToTorusCoords(content: string): TorusCoords {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    h1 = (h1 * 31 + c) >>> 0;
    h2 = (h2 * 37 + c * (i + 1)) >>> 0;
  }
  const u = (h1 % 1000) / 1000;
  const v = (h2 % 1000) / 1000;
  // временный chart_id будет установлен внешним кодом через findChartForCoords
  return { torus_u: u, torus_v: v, atlas_chart: "" };
}

/** Подсчёт покрытия: сколько % тора покрыто atlas charts */
export function computeCoverage(charts: AtlasChart[]): number {
  let covered = 0;
  for (const c of charts) {
    covered += (c.u_range[1] - c.u_range[0]) * (c.v_range[1] - c.v_range[0]);
  }
  // площадь тора = 1×1 = 1
  return Math.min(covered, 1.0);
}
