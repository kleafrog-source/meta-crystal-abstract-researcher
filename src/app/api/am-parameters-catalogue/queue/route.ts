import { NextRequest, NextResponse } from "next/server";
import { readQueue, stage, stageUpdatesBatch, validateParameter, writeQueue, readCatalogueParameters, type QueueOperation } from "@/lib/am-parameters-catalogue/catalogue";

export async function GET() { try { const queue = await readQueue(); return NextResponse.json({ ...queue, pending_count: queue.items.filter((item) => item.status === "pending").length, failed_count: queue.items.filter((item) => item.status === "failed").length }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action?: string; operation?: QueueOperation; technical_names?: string[]; technical_name?: string; payload?: unknown; reason?: string; ids?: string[] };
    if (body.action === "discard") {
      const ids = new Set(body.ids ?? []); const queue = await readQueue(); queue.items = queue.items.filter((item) => !ids.has(item.id)); await writeQueue(queue); return NextResponse.json({ ok: true });
    }
    if (body.action === "retry") {
      const ids = new Set(body.ids ?? []); const queue = await readQueue(); queue.items = queue.items.map((item) => ids.has(item.id) && item.status === "failed" ? { ...item, status: "pending", error: undefined } : item); await writeQueue(queue); return NextResponse.json({ ok: true });
    }
    if (body.action === "edit") {
      const valid = validateParameter(body.payload); if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
      const queue = await readQueue(); const index = queue.items.findIndex((item) => item.id === body.ids?.[0] && item.operation !== "delete");
      if (index < 0) return NextResponse.json({ error: "Не найдена редактируемая запись очереди." }, { status: 404 });
      if (valid.parameter.technical_name !== queue.items[index]!.technical_name) return NextResponse.json({ error: "technical_name staged-параметра менять нельзя." }, { status: 400 });
      queue.items[index] = { ...queue.items[index]!, technical_name: valid.parameter.technical_name, payload: valid.parameter }; await writeQueue(queue); return NextResponse.json({ ok: true });
    }
    const operation = body.operation;
    if (!operation || !["add", "update", "delete"].includes(operation)) return NextResponse.json({ error: "operation должен быть add, update или delete." }, { status: 400 });
    if (operation === "delete") {
      const names = body.technical_names ?? (body.technical_name ? [body.technical_name] : []);
      if (!names.length) return NextResponse.json({ error: "Не указаны параметры для удаления." }, { status: 400 });
      const results = await Promise.all(names.map((name) => stage("delete", name, undefined, body.reason, "Каталог параметров")));
      return NextResponse.json({ ok: true, staged: results.length });
    }
    const payloads = Array.isArray(body.payload) ? body.payload : [body.payload];
    if (!payloads.length || payloads.every((payload) => payload === undefined)) return NextResponse.json({ error: "Укажите payload параметра." }, { status: 400 });
    const validated = payloads.map(validateParameter);
    const validationErrors = validated.filter((result) => !result.ok);
    if (validationErrors.length) return NextResponse.json({ error: validationErrors[0]!.ok ? "Некорректный параметр." : validationErrors[0]!.error }, { status: 400 });
    const validParameters = validated.flatMap((result) => result.ok ? [result.parameter] : []);
    if (operation === "update" && validParameters.length > 1) {
      const results = await stageUpdatesBatch(validParameters, body.reason ?? "Пакетное обновление каталога", "Каталог параметров");
      return NextResponse.json({ ok: true, staged: results.length });
    }
    const catalogue = await readCatalogueParameters(); const names = new Set(catalogue.map((item) => item.technical_name));
    const queue = await readQueue();
    let stagedCount = 0;
    for (const parameter of validParameters) { const effective = operation === "add" && names.has(parameter.technical_name) ? "update" : operation; await stage(effective, parameter.technical_name, parameter, body.reason, "Каталог параметров"); stagedCount += 1; }
    return NextResponse.json({ ok: true, staged: stagedCount });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
