import { NextRequest, NextResponse } from "next/server";
import { enrich, searchText, readQueue, readCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
import { assessCompleteness } from "@/lib/am-parameters-catalogue/completeness";
import { loadTaxonomyMap } from "@/lib/am-parameters-catalogue/taxonomy";

const allowedSort = new Set(["technical_name", "category", "sub_category", "name_ru", "ui_element", "completeness", "missing_count", "updated_at", "domain"]);
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const [published, taxonomy] = await Promise.all([readCatalogueParameters(), loadTaxonomyMap()]);
    const queue = await readQueue();
    const queued = new Set(queue.items.filter((item) => item.status !== "done").map((item) => item.technical_name));
    const selectedCategories = new Set(params.getAll("category"));
    const selectedSubcategories = new Set(params.getAll("sub_category"));
    const selectedDomains = new Set(params.getAll("domain"));
    const selectedTypes = new Set(params.getAll("type"));
    const query = (params.get("q") ?? "").trim().toLocaleLowerCase();
    const completeness = params.get("completeness") ?? "all";
    const categoryPresence = params.get("category_presence") ?? "all";
    let rows = published.filter((row) => {
      if (query && !searchText(row).includes(query)) return false;
      if (selectedCategories.size && !selectedCategories.has(row.category ?? "")) return false;
      if (selectedSubcategories.size && !selectedSubcategories.has(row.sub_category ?? "")) return false;
      if (selectedDomains.size && !selectedDomains.has(String(row.domain ?? ""))) return false;
      if (selectedTypes.size && !selectedTypes.has(row.ui_element)) return false;
      const assessed = assessCompleteness(row, taxonomy);
      if (completeness === "complete" && assessed.missing_count > 0) return false;
      if (completeness === "missing" && assessed.missing_count === 0) return false;
      if (categoryPresence === "has" && !row.category?.trim()) return false;
      if (categoryPresence === "none" && row.category?.trim()) return false;
      if (params.get("queued") === "yes" && !queued.has(row.technical_name)) return false;
      if (params.get("queued") === "no" && queued.has(row.technical_name)) return false;
      return true;
    });
    const sort = allowedSort.has(params.get("sort") ?? "") ? params.get("sort")! : "category";
    const direction = params.get("direction") === "desc" ? -1 : 1;
    const valueFor = (row: (typeof rows)[number], field: string) => field === "completeness" ? assessCompleteness(row, taxonomy).completeness : field === "missing_count" ? assessCompleteness(row, taxonomy).missing_count : row[field as keyof typeof row];
    rows.sort((a, b) => {
      if (sort === "category") return direction * String(a.category ?? "").localeCompare(String(b.category ?? "")) || String(a.sub_category ?? "").localeCompare(String(b.sub_category ?? "")) || a.technical_name.localeCompare(b.technical_name);
      const left = valueFor(a, sort); const right = valueFor(b, sort);
      return direction * (typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""))) || a.technical_name.localeCompare(b.technical_name);
    });
    const total = rows.length; const page = Math.max(1, Number(params.get("page") ?? 1)); const pageSize = Math.max(1, Math.min(200, Number(params.get("page_size") ?? 50)));
    return NextResponse.json({ parameters: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => { const assessment = assessCompleteness(row, taxonomy); return { ...enrich(row), _catalogue: { source: "published", missing_fields: assessment.missing_fields, completeness: assessment.completeness }, queued: queued.has(row.technical_name) }; }), total, page, page_size: pageSize, pages: Math.ceil(total / pageSize), library_count: published.length, published_library_count: published.length });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
