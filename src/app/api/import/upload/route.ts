import { NextResponse } from "next/server";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPORTS_DIR = join(process.cwd(), "data", "imports");
if (!existsSync(IMPORTS_DIR)) mkdirSync(IMPORTS_DIR, { recursive: true });

/**
 * POST /api/import/upload
 * Accepts a multipart/form-data file upload and stores it under data/imports/.
 * Returns the saved file path so the client can call /api/import/preview next.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Файл не передан" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Cap file size at 10 MB
    if (buffer.length > 10 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Файл слишком большой (макс. 10 МБ)" },
        { status: 413 },
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = randomUUID();
    const dest = join(IMPORTS_DIR, `${id}__${safeName}`);
    writeFileSync(dest, buffer);

    return NextResponse.json({
      ok: true,
      fileId: id,
      fileName: safeName,
      path: dest,
      size: buffer.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
