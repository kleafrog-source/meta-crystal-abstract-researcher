import { NextResponse } from "next/server";
import { callSidecar } from "@/lib/engine/runner";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/import/apply
 * Body: { path: string } — applies a previously previewed import file.
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

    const { result } = await callSidecar("import_apply", {
      args: [path],
    });

    return NextResponse.json({
      ok: true,
      path,
      result,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
