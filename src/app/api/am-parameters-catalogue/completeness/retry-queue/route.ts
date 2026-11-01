import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GENESIS_DATA_ROOT } from "@/lib/combinatorial-genesis/library";

const FILE = path.join(GENESIS_DATA_ROOT, "library", "completeness", "retry-queue.json");
type RetryItem = { technical_name: string; attempts: number; status: string; error: string; updated_at: string };

export async function GET() {
  try { return NextResponse.json({ items: JSON.parse(await fs.readFile(FILE, "utf8")) as RetryItem[] }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({ items: [] }); return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { technical_names?: string[]; confirmed?: boolean };
    if (body.confirmed !== true || !Array.isArray(body.technical_names)) return NextResponse.json({ error: "Для сброса retry-лимита требуются confirmed: true и technical_names." }, { status: 400 });
    const names = new Set(body.technical_names);
    const items = JSON.parse(await fs.readFile(FILE, "utf8")) as RetryItem[];
    let reset = 0;
    const next = items.map((item) => {
      if (!names.has(item.technical_name) || item.status !== "failed_permanent") return item;
      reset += 1;
      return { ...item, attempts: 0, status: "retry", error: "Повтор разрешён оператором.", updated_at: new Date().toISOString() };
    });
    await fs.writeFile(FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return NextResponse.json({ ok: true, reset, items: next });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
