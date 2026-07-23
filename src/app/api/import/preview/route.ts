import { NextResponse } from "next/server";
import { callSidecar } from "@/lib/engine/runner";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/import/preview
 * Body: { path: string }  OR  { fileId: string, fileName: string }
 * Returns the diff entries that the import would introduce.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let path = body.path;
    if (!path && body.fileId && body.fileName) {
      path = `${process.cwd()}/data/imports/${body.fileId}__${body.fileName}`;
    }
    if (!path || !existsSync(path)) {
      return NextResponse.json(
        { ok: false, error: `Файл не найден: ${path}` },
        { status: 404 },
      );
    }

    const { result, events } = await callSidecar("import_preview", {
      args: [path],
    });
    const dataEvt = events.find((e) => e.event === "data" && e.payload);
    const payload = (dataEvt?.payload ?? result) as { diff?: any[]; count?: number };

    return NextResponse.json({
      ok: true,
      path,
      diff: payload.diff ?? [],
      count: payload.count ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
