import { NextRequest, NextResponse } from "next/server";
import { readCatalogueParameters, searchText } from "@/lib/am-parameters-catalogue/catalogue";
import { assessCompleteness } from "@/lib/am-parameters-catalogue/completeness";
import { filterCompletionRows, pageWindow } from "@/lib/am-parameters-catalogue/completeness-ui-state";
import { loadTaxonomyMap } from "@/lib/am-parameters-catalogue/taxonomy";

export async function GET(request: NextRequest) {
  try {
    const [rows, taxonomy] = await Promise.all([readCatalogueParameters(), loadTaxonomyMap()]);
    const parameters = rows.map((row) => ({ ...row, _completion: assessCompleteness(row, taxonomy) }));
    const type = request.nextUrl.searchParams.get("type");
    const category = request.nextUrl.searchParams.get("category");
    const missingField = request.nextUrl.searchParams.get("missing_field");
    const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
    const filtered = filterCompletionRows(parameters, { type: type ?? undefined, category: category ?? undefined, missingField: missingField ?? undefined, query }, searchText);
    const fields: Record<string, number> = {};
    const missingValues: Record<string, number> = {};
    const invalidValues: Record<string, number> = {};
    for (const row of parameters) for (const gap of row._completion.gaps) {
      fields[gap.field] = (fields[gap.field] ?? 0) + 1;
      const target = gap.kind === "missing" ? missingValues : invalidValues;
      target[gap.field] = (target[gap.field] ?? 0) + 1;
    }
    const complete = parameters.filter((row) => row._completion.complete).length;
    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(request.nextUrl.searchParams.get("page_size") ?? 50)) || 50));
    const window = pageWindow(filtered.length, Number(request.nextUrl.searchParams.get("page") ?? 1), pageSize);
    const pageRows = filtered.slice((window.page - 1) * pageSize, window.page * pageSize);
    return NextResponse.json({
      total: parameters.length,
      complete,
      incomplete: parameters.length - complete,
      completeness: parameters.length ? Number((complete / parameters.length * 100).toFixed(2)) : 100,
      filtered_count: filtered.length,
      page: window.page,
      page_size: pageSize,
      page_count: window.pageCount,
      range_start: window.start,
      range_end: window.end,
      matching_technical_names: filtered.map((row) => row.technical_name),
      summary_scope: "entire effective catalogue; parameters array respects the requested filters",
      count_semantics: {
        total_complete_incomplete: "Unique effective published records.",
        missing_counts: "Applicable field issues (missing values plus present-but-invalid values), counted once per record and field.",
        missing_value_counts: "Applicable fields whose value is absent, null, whitespace, or an empty array.",
        invalid_value_counts: "Applicable fields whose value exists but fails its type or quality rule.",
      },
      missing_counts: fields,
      field_issue_counts: fields,
      missing_value_counts: missingValues,
      invalid_value_counts: invalidValues,
      parameters: pageRows,
    });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
