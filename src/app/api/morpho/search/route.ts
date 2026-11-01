import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { runMorphoSearch, stopMorpho } from "@/lib/morpho/jobs";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import { isVocalMatrixParameter } from "@/lib/vocal-allocation/parser";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 7200;
const MAX_BYTES = 25 * 1024 * 1024;
export async function DELETE() {
  const result = await stopMorpho("search");
  return NextResponse.json(result, { status: result.stopped ? 200 : 409 });
}
export async function POST(request: Request) {
  let temporary: string | null = null;
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || !image.size)
      return NextResponse.json(
        { error: "Image file is required" },
        { status: 400 },
      );
    if (image.size > MAX_BYTES)
      return NextResponse.json(
        { error: "Image exceeds the 25 MB limit" },
        { status: 413 },
      );
    if (!image.type.startsWith("image/"))
      return NextResponse.json(
        { error: "Unsupported image MIME type" },
        { status: 415 },
      );
    const topK = Math.max(
      3,
      Math.min(100, Math.trunc(Number(form.get("top_k")) || 20)),
    );
    const requestedMode = String(form.get("value_mode") || "expressive");
    const valueMode =
      requestedMode === "conservative" || requestedMode === "default"
        ? requestedMode
        : "expressive";
    const vocalMatrix = form.get("vocal_matrix") === "true";
    temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "meta-crystal-morpho-"),
    );
    const extension = /^\.[a-z0-9]{2,5}$/.test(
      path.extname(image.name).toLowerCase(),
    )
      ? path.extname(image.name).toLowerCase()
      : ".image";
    const file = path.join(temporary, `reference${extension}`);
    await fs.writeFile(file, Buffer.from(await image.arrayBuffer()));
    const result = await runMorphoSearch(file, vocalMatrix ? Math.max(topK, 100) : topK, valueMode);
    if (vocalMatrix) {
      const payload = result as Record<string, unknown> & { results?: ActiveParameter[] };
      payload.results = (payload.results ?? []).filter(isVocalMatrixParameter).slice(0, topK);
      payload.vocal_matrix_mode = true;
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    if (temporary)
      await fs
        .rm(temporary, { recursive: true, force: true })
        .catch(() => undefined);
  }
}
