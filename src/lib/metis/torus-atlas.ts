import type { AtlasChart, TorusCoords } from "@/lib/metis/types";

export const INITIAL_CHARTS: AtlasChart[] = [
  { chart_id: "chart_A", u_range: [0, 0.5], v_range: [0, 0.5], resolution: 256, node_count: 0, created_at: Date.now(), created_due_to_overflow: false },
  { chart_id: "chart_B", u_range: [0.5, 1], v_range: [0, 0.5], resolution: 256, node_count: 0, created_at: Date.now(), created_due_to_overflow: false },
  { chart_id: "chart_C", u_range: [0, 0.5], v_range: [0.5, 1], resolution: 256, node_count: 0, created_at: Date.now(), created_due_to_overflow: false },
  { chart_id: "chart_D", u_range: [0.5, 1], v_range: [0.5, 1], resolution: 256, node_count: 0, created_at: Date.now(), created_due_to_overflow: false },
];

export function findChartForCoords(u: number, v: number, charts: AtlasChart[]): AtlasChart | null {
  return charts.find((chart) => u >= chart.u_range[0] && u < chart.u_range[1] && v >= chart.v_range[0] && v < chart.v_range[1]) ?? null;
}

export function createOverflowChart(charts: AtlasChart[]): AtlasChart {
  const maxChart = charts.reduce((best, current) => (current.node_count > best.node_count ? current : best), charts[0]);
  const [u0, u1] = maxChart.u_range;
  const [v0, v1] = maxChart.v_range;
  const nextId = `chart_${String.fromCharCode(65 + charts.length)}`;
  const uLen = u1 - u0;
  const vLen = v1 - v0;

  if (uLen >= vLen) {
    const mid = u0 + uLen / 2;
    maxChart.u_range = [u0, mid];
    return { chart_id: nextId, u_range: [mid, u1], v_range: [v0, v1], resolution: 256, node_count: 0, created_at: Date.now(), created_due_to_overflow: true };
  }

  const mid = v0 + vLen / 2;
  maxChart.v_range = [v0, mid];
  return { chart_id: nextId, u_range: [u0, u1], v_range: [mid, v1], resolution: 256, node_count: 0, created_at: Date.now(), created_due_to_overflow: true };
}

export function contentToTorusCoords(content: string): TorusCoords {
  let h1 = 0;
  let h2 = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    h1 = (h1 * 31 + code) >>> 0;
    h2 = (h2 * 37 + code * (index + 1)) >>> 0;
  }
  return {
    torus_u: (h1 % 1000) / 1000,
    torus_v: (h2 % 1000) / 1000,
    atlas_chart: "",
  };
}

export function computeCoverage(charts: AtlasChart[]): number {
  return Math.min(
    1,
    charts.reduce((sum, chart) => sum + (chart.u_range[1] - chart.u_range[0]) * (chart.v_range[1] - chart.v_range[0]), 0),
  );
}

