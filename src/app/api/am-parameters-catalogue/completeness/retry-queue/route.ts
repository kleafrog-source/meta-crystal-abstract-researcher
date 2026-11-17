import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GENESIS_DATA_ROOT } from "@/lib/combinatorial-genesis/library";
import { readCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
import { loadTaxonomyMap } from "@/lib/am-parameters-catalogue/taxonomy";
import { inspectRetryEntry } from "@/lib/am-parameters-catalogue/retry-queue";

const FILE = path.join(GENESIS_DATA_ROOT, "library", "completeness", "retry-queue.json");
type RetryItem = { technical_name: string; attempts: number; status: string; error: string; updated_at: string };

export async function GET() {
  try {
    const [items, rows, taxonomy] = await Promise.all([
      fs.readFile(FILE, "utf8").then((text) => JSON.parse(text) as RetryItem[]).catch((error) => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }),
      readCatalogueParameters(),
      loadTaxonomyMap(),
    ]);
    const current = new Map(rows.map((row) => [row.technical_name, row]));
    const views = items.map((item) => inspectRetryEntry(item, current.get(item.technical_name), taxonomy));
    const actionable_items = views.filter((item) => item.eligible);
    const history_counts = views.reduce<Record<string, number>>((counts, item) => { counts[item.effective_status] = (counts[item.effective_status] ?? 0) + 1; return counts; }, {});
    return NextResponse.json({ items: views, actionable_items, actionable_count: actionable_items.length, history_count: views.length, history_counts, count_semantics: "items is preserved error history; actionable_items contains only current incomplete tasks under the attempt limit." });
  }
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
