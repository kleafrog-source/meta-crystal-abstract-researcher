import { NextResponse } from "next/server";
import { readCatalogueState } from "@/lib/am-parameters-catalogue/catalogue";
import { startCatalogueIndexJob } from "@/lib/am-parameters-catalogue/index-job";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { confirmed?: boolean };
    if (body.confirmed !== true) return NextResponse.json({ error: "Для финальной пересборки требуется confirmed: true." }, { status: 400 });
    const state = await readCatalogueState();
    if (state.job.running) return NextResponse.json({ error: "Пересборка уже выполняется." }, { status: 409 });
    if (!state.indexes_dirty) return NextResponse.json({ error: "Индексы уже актуальны; пересборка не требуется." }, { status: 409 });
    const job = await startCatalogueIndexJob();
    return NextResponse.json({ ok: true, job });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
