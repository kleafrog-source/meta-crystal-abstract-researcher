import { NextResponse } from "next/server";
import { makeGaps, readCatalogueParameters } from "@/lib/am-parameters-catalogue/catalogue";
export async function GET() {
  try {
    const rows = await readCatalogueParameters();
    const tree = new Map<string, Map<string, number>>();
    for (const row of rows) { const category = row.category?.trim() || "Без категории"; const sub = row.sub_category?.trim() || "Без подкатегории"; const children = tree.get(category) ?? new Map<string, number>(); children.set(sub, (children.get(sub) ?? 0) + 1); tree.set(category, children); }
    const gaps = await makeGaps(rows);
    const incompleteNames = new Set(gaps.incomplete.map((row) => row.technical_name));
    const sparse = new Map(gaps.sparse_categories.map((node) => [`${node.category}|||${node.sub_category ?? ""}`, node.count]));
    const categories = [...tree].map(([category, children]) => ({ category, count: [...children.values()].reduce((sum, value) => sum + value, 0), incomplete: rows.filter((row) => (row.category?.trim() || "Без категории") === category && incompleteNames.has(row.technical_name)).length, subcategories: [...children].map(([sub_category, count]) => ({ sub_category, count, incomplete: rows.filter((row) => (row.category?.trim() || "Без категории") === category && (row.sub_category?.trim() || "Без подкатегории") === sub_category && incompleteNames.has(row.technical_name)).length })) })).sort((a, b) => a.category.localeCompare(b.category));
    return NextResponse.json({ categories, sparse: [...sparse].map(([key, count]) => { const [category, sub_category] = key.split("|||"); return { category, sub_category: sub_category || null, count }; }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
