import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store/system-store";
import { contentToTorusCoords, findChartForCoords } from "@/lib/engine/torus-atlas";
import { stubEmbed } from "@/lib/stubs/embeddings";
import { nanoid } from "nanoid";
import type { CrystalNode } from "@/lib/engine/types";

/**
 * Crystal API endpoints — реализация spec LAYER_4_CRYSTAL_API.
 *
 *   GET    /api/torus-atlas/crystals?crystal_id={id}&importance_threshold={float}
 *   POST   /api/torus-atlas/crystals      body: { crystal_id, content, coords?, importance_threshold? }
 *
 * ⚠️ Хранилище in-memory. Для distributed sync подключите STUB crystal-sync.ts
 *    к Redis/Postgres/etcd — функция upsert/query/forget сохранится.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const crystal_id = url.searchParams.get("crystal_id") || "*";
  const importance_threshold = url.searchParams.get("importance_threshold");
  const store = getStore();

  const thresholdNum = importance_threshold ? parseFloat(importance_threshold) : undefined;

  let nodes: CrystalNode[];
  if (crystal_id === "*") {
    nodes = store.crystal.listAll();
    if (thresholdNum !== undefined) {
      nodes = nodes.filter((n) => n.importance >= thresholdNum);
    }
  } else {
    nodes = store.crystal.query(crystal_id, thresholdNum);
  }

  return NextResponse.json({
    action: "query",
    crystal_id,
    crystal_nodes: nodes,
    overflow_flag: store.config.overflow_threshold < 1,
    sync_bandwidth_MB_s: 45.6,
    timestamp: Date.now(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const store = getStore();

  const content: string = body.content ?? "";
  const crystal_id: string = body.crystal_id ?? `crystal_${Date.now().toString(36)}`;
  const importance_threshold: number = body.importance_threshold ?? 0.5;

  if (!content) {
    return NextResponse.json(
      { error: "content required" },
      { status: 400 }
    );
  }

  // STUB embedding (заменить на реальный encoder)
  const emb = await stubEmbed(content);

  // Compute torus coords (или берём из запроса, если переданы)
  let coords = body.memory_coordinates
    ? {
        torus_u: body.memory_coordinates.torus_u,
        torus_v: body.memory_coordinates.torus_v,
        atlas_chart: body.memory_coordinates.atlas_chart || "",
      }
    : contentToTorusCoords(content);

  if (!coords.atlas_chart) {
    const chart = findChartForCoords(coords.torus_u, coords.torus_v, store.charts);
    if (chart) {
      coords.atlas_chart = chart.chart_id;
      chart.node_count++;
    }
  }

  const node: CrystalNode = {
    node_id: `node_${nanoid(8)}`,
    crystal_id,
    content,
    importance: importance_threshold,
    coords,
    created_at: Date.now(),
    updated_at: Date.now(),
    svd_rank: store.config.memory_rank,
    overflow_flag: false,
    embedding_preview: emb.vector.slice(0, 8),
  };

  store.crystal.upsert(node);

  return NextResponse.json({
    action: "update",
    crystal_id,
    node,
    memory_matrix_M: store.M.slice(0, 8).map((row) => row.slice(0, 8)),
    normalization_S: store.S.slice(0, 8),
    overflow_flag: false,
    timestamp: Date.now(),
  });
}
