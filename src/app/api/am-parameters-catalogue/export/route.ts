import { NextRequest, NextResponse } from "next/server";
import { makeGaps, readCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
import { createZip } from "@/lib/am-parameters-catalogue/zip";
import { assessCompleteness } from "@/lib/am-parameters-catalogue/completeness";
import { loadTaxonomyMap } from "@/lib/am-parameters-catalogue/taxonomy";

export const runtime = "nodejs";
function safeSegment(value: string | undefined, fallback: string) { const clean = (value ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\.+$/g, "").slice(0, 100); return clean || fallback; }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { format?: string; technical_names?: string[]; gaps_only?: boolean; query?: string; category?: string[]; sub_category?: string[]; domain?: string; completeness?: string; category_presence?: string; source?: string };
    const [all, taxonomy] = await Promise.all([readCatalogueParameters(), loadTaxonomyMap()]); let rows = all;
    if (body.technical_names) { const names = new Set(body.technical_names); rows = rows.filter((row) => names.has(row.technical_name)); }
    if (body.query?.trim()) { const query = body.query.toLocaleLowerCase(); rows = rows.filter((row) => [row.technical_name, row.name_ru, row.description_en, row.description_ru, row.category, row.sub_category, ...(row.semantic_keywords ?? []), ...(row.lyria_prompt_tags ?? [])].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)); }
    if (body.category?.length) rows = rows.filter((row) => body.category!.includes(row.category ?? ""));
    if (body.sub_category?.length) rows = rows.filter((row) => body.sub_category!.includes(row.sub_category ?? ""));
    if (body.domain) rows = rows.filter((row) => String(row.domain ?? "") === body.domain);
    if (body.category_presence === "has") rows = rows.filter((row) => !!row.category?.trim());
    if (body.category_presence === "none") rows = rows.filter((row) => !row.category?.trim());
    if (body.completeness === "complete") rows = rows.filter((row) => assessCompleteness(row, taxonomy).complete);
    if (body.completeness === "missing") rows = rows.filter((row) => !assessCompleteness(row, taxonomy).complete);
    if (body.gaps_only) rows = rows.filter((row) => !assessCompleteness(row, taxonomy).complete);
    const now = new Date().toISOString(); const manifest = { exported_at: now, parameter_count: rows.length, source: "published parameter library", schema: "RuntimeParameterRecord", revision: await (await import("@/lib/am-parameters-catalogue/catalogue")).readCatalogueState().then((state) => state.revision) };
    const format = body.format ?? "json";
    if (format === "jsonl") { const text = [`${JSON.stringify({ _manifest: manifest })}`, ...rows.map((row) => JSON.stringify(row))].join("\n") + "\n"; return new NextResponse(text, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": "attachment; filename=am-parameters-catalogue.jsonl" } }); }
    if (format === "zip") {
      const files = rows.map((row) => ({ name: `${safeSegment(row.category, "Без категории")}/${safeSegment(row.sub_category, "Без подкатегории")}/${safeSegment(row.technical_name, "parameter")}.json`, content: `${JSON.stringify(row, null, 2)}\n` }));
      if (body.gaps_only) { const gaps = await makeGaps(rows); files.push({ name: "gaps.json", content: `${JSON.stringify(gaps, null, 2)}\n` }); }
      files.push({ name: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` });
      return new NextResponse(new Uint8Array(createZip(files)), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=am-parameters-catalogue.zip" } });
    }
    if (format !== "json") return NextResponse.json({ error: "format должен быть json, jsonl или zip." }, { status: 400 });
    return NextResponse.json({ manifest, parameters: rows }, { headers: { "Content-Disposition": "attachment; filename=am-parameters-catalogue.json" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
