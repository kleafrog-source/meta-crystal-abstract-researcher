import { NextRequest, NextResponse } from "next/server";
import { hasForbiddenParameterKeys } from "@/lib/combinatorial-genesis/parameter-schema";
import { readCatalogueParameters, readRawCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
import { assessCompleteness } from "@/lib/am-parameters-catalogue/completeness";
import { loadTaxonomyMap } from "@/lib/am-parameters-catalogue/taxonomy";

export async function GET(request: NextRequest) {
  try {
    const [rows, raw, taxonomy] = await Promise.all([readCatalogueParameters(), readRawCatalogueParameters(), loadTaxonomyMap()]);
    const forbidden = new Set<string>();
    let forbiddenRows = 0;
    for (const row of raw) { const keys = hasForbiddenParameterKeys(row); if (keys.length) forbiddenRows += 1; for (const key of keys) forbidden.add(key); }
    const parameters = rows.map((row) => ({ ...row, _completion: assessCompleteness(row, taxonomy) }));
    const type = request.nextUrl.searchParams.get("type");
    const category = request.nextUrl.searchParams.get("category");
    const missingField = request.nextUrl.searchParams.get("missing_field");
    const filtered = parameters.filter((row) => (!type || row.ui_element === type) && (!category || row.category === category) && (!missingField || row._completion.missing_fields.includes(missingField)));
    const fields: Record<string, number> = {};
    for (const row of parameters) for (const field of row._completion.missing_fields) fields[field] = (fields[field] ?? 0) + 1;
    const complete = parameters.filter((row) => row._completion.complete).length;
    const sort = (a: typeof filtered[number], b: typeof filtered[number]) => b._completion.missing_count - a._completion.missing_count || a.ui_element.localeCompare(b.ui_element) || String(a.category ?? "").localeCompare(String(b.category ?? "")) || a.technical_name.localeCompare(b.technical_name);
    filtered.sort(sort);
    return NextResponse.json({ total: parameters.length, complete, incomplete: parameters.length - complete, completeness: parameters.length ? Math.round(complete / parameters.length * 100) : 100, forbidden_count: forbiddenRows, forbidden_keys: [...forbidden], missing_counts: fields, parameters: filtered });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
