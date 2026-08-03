import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getFullTorusAtlasRebuildJob } from "@/lib/torus-atlas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const job = await getFullTorusAtlasRebuildJob();
    if (!job.id) {
      return NextResponse.json({ ok: true, progress: "", errors: "" });
    }
    const dir = join(process.cwd(), "data", "torus_atlas", "jobs", job.id);
    const [progress, errors] = await Promise.all([
      readFile(join(dir, "progress.log"), "utf8").catch(() => ""),
      readFile(join(dir, "errors.log"), "utf8").catch(() => ""),
    ]);
    return NextResponse.json({ ok: true, progress, errors });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
