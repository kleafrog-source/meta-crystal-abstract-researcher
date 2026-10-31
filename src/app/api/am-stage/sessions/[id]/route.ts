import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AmStageSessionSnapshot } from "@/lib/am-stage-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROOT = path.join(process.cwd(), "data", "am-stage-snapshots");

function getFile(id: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("Invalid session id.");
  return path.join(ROOT, id, "snapshot.json");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const snapshot = JSON.parse(await fs.readFile(getFile(id), "utf8")) as AmStageSessionSnapshot;
    return NextResponse.json({ snapshot });
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const file = getFile(id);
    const snapshot = JSON.parse(await fs.readFile(file, "utf8")) as AmStageSessionSnapshot;
    const body = await request.json() as { title?: string };
    const title = String(body.title ?? "").trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    snapshot.meta.title = title; snapshot.meta.updated_at = new Date().toISOString();
    const temporary = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await fs.rename(temporary, file);
    return NextResponse.json({ snapshot });
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await fs.rm(path.dirname(getFile(id)), { recursive: true, force: false });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
