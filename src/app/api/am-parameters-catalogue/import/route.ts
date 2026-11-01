import { NextRequest, NextResponse } from "next/server";
import { readQueue, stage, validateParameter, readCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
import { readZip } from "@/lib/am-parameters-catalogue/zip";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Выберите JSON, JSONL или ZIP-файл." }, { status: 400 });
    const duplicateMode = String(form.get("duplicate_mode") ?? "skip");
    if (!["skip", "overwrite", "stage-update"].includes(duplicateMode)) return NextResponse.json({ error: "Неизвестный режим обработки дублей." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer()); if (buffer.length > 50 * 1024 * 1024) return NextResponse.json({ error: "Размер файла превышает 50 МБ." }, { status: 413 });
    const files = file.name.toLowerCase().endsWith(".zip") ? readZip(buffer) : [{ name: file.name, content: buffer.toString("utf8") }];
    const candidates: unknown[] = [];
    for (const entry of files) {
      if (/\.jsonl?$/i.test(entry.name)) {
        if (/\.jsonl$/i.test(entry.name)) {
          for (const [index, line] of entry.content.split(/\r?\n/).entries()) if (line.trim()) { const parsed = JSON.parse(line) as unknown; if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "_manifest" in parsed) continue; candidates.push(parsed); }
        } else {
          const parsed = JSON.parse(entry.content) as unknown;
          if (Array.isArray(parsed)) candidates.push(...parsed);
          else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { parameters?: unknown }).parameters)) candidates.push(...(parsed as { parameters: unknown[] }).parameters);
          else if (parsed && typeof parsed === "object" && "technical_name" in parsed) candidates.push(parsed);
          else if (parsed && typeof parsed === "object") for (const value of Object.values(parsed)) { if (Array.isArray(value)) candidates.push(...value); }
        }
      }
    }
    const catalogue = await readCatalogueParameters(); const known = new Set(catalogue.map((row) => row.technical_name)); const queue = await readQueue(); const queued = new Set(queue.items.filter((item) => item.status === "pending").map((item) => item.technical_name));
    const errors: Array<{ index: number; technical_name?: string; reason: string }> = []; const conflicts: Array<{ technical_name: string; resolution: string }> = []; const accepted = new Map<string, { operation: "add" | "update"; parameter: ReturnType<typeof validateParameter> extends { ok: true; parameter: infer T } ? T : never }>();
    for (const [index, raw] of candidates.entries()) {
      const valid = validateParameter(raw); if (!valid.ok) { errors.push({ index: index + 1, reason: valid.error }); continue; }
      const name = valid.parameter.technical_name; const duplicate = known.has(name) || queued.has(name) || accepted.has(name);
      if (duplicate && duplicateMode === "skip") { conflicts.push({ technical_name: name, resolution: "пропущен" }); continue; }
      const operation = known.has(name) ? "update" : "add";
      if (duplicate && duplicateMode === "stage-update") conflicts.push({ technical_name: name, resolution: known.has(name) || queued.has(name) ? "обновление добавлено в очередь" : "повтор кандидата объединён в один элемент очереди" });
      else if (duplicate) conflicts.push({ technical_name: name, resolution: known.has(name) ? "перезапись поставлена в очередь как обновление" : "повтор кандидата объединён в один элемент очереди" });
      accepted.set(name, { operation, parameter: valid.parameter as never });
    }
    let stagedCount = 0;
    for (const [name, item] of accepted) { await stage(item.operation, name, item.parameter as never, undefined, `Импорт: ${file.name}`); stagedCount += 1; }
    return NextResponse.json({ ok: true, accepted: stagedCount, rejected: errors.length, conflicts: conflicts.length, errors, conflict_details: conflicts, queued: stagedCount });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
