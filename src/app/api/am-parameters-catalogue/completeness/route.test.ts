import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rows: Array<Record<string, unknown>> = [];
vi.mock("@/lib/am-parameters-catalogue/catalogue", () => ({
  readCatalogueParameters: vi.fn(async () => rows),
  searchText: (row: Record<string, unknown>) => String(row.searchable ?? "").toLocaleLowerCase(),
}));
vi.mock("@/lib/am-parameters-catalogue/completeness", () => ({
  assessCompleteness: (row: Record<string, unknown>) => {
    const fields = Array.isArray(row.issueFields) ? row.issueFields as string[] : [];
    const gaps = fields.map((field) => ({ field, reason: "fixture issue", kind: "invalid" as const }));
    return { missing_fields: fields, missing_only_fields: [], invalid_fields: fields, gaps, missing_count: fields.length, required_count: 12, completeness: 100 - fields.length, complete: fields.length === 0 };
  },
}));
vi.mock("@/lib/am-parameters-catalogue/taxonomy", () => ({ loadTaxonomyMap: vi.fn(async () => ({})) }));

const { GET } = await import("./route");

describe("completeness route pagination", () => {
  beforeEach(() => {
    rows.splice(0, rows.length, ...Array.from({ length: 86 }, (_, index) => ({
      technical_name: `issue_${String(index).padStart(2, "0")}`,
      ui_element: "Range",
      category: index % 2 ? "sound" : "structure",
      searchable: `target ${index}`,
      issueFields: [index % 2 ? "description_en" : "quantity_kind"],
    })), { technical_name: "complete_row", ui_element: "Range", category: "sound", searchable: "target", issueFields: [] });
  });

  it("returns only incomplete records, sorted and filtered before slicing a maximum of 50 rows", async () => {
    const response = await GET(new NextRequest("http://localhost/api/am-parameters-catalogue/completeness?page=1&page_size=500&q=target"));
    const pageOne = await response.json();
    expect(pageOne.total).toBe(87);
    expect(pageOne.incomplete).toBe(86);
    expect(pageOne.completeness).toBe(1.15);
    expect(pageOne.filtered_count).toBe(86);
    expect(pageOne.parameters).toHaveLength(50);
    expect(pageOne.matching_technical_names).toHaveLength(86);
    expect(pageOne.page_size).toBe(50);

    const second = await GET(new NextRequest("http://localhost/api/am-parameters-catalogue/completeness?page=2&page_size=50&q=target&category=structure"));
    const pageTwo = await second.json();
    expect(pageTwo.filtered_count).toBe(43);
    expect(pageTwo.range_start).toBe(1);
    expect(pageTwo.range_end).toBe(43);
    expect(pageTwo.page).toBe(1);
    expect(pageTwo.page_count).toBe(1);
    expect(pageTwo.parameters).toHaveLength(43);
  });

  it("reports an empty filtered result as 0–0 and clamps a request beyond the last page", async () => {
    const empty = await GET(new NextRequest("http://localhost/api/am-parameters-catalogue/completeness?page=8&q=no-match"));
    expect(await empty.json()).toMatchObject({ filtered_count: 0, page: 1, page_count: 1, range_start: 0, range_end: 0, parameters: [] });

    const clamped = await GET(new NextRequest("http://localhost/api/am-parameters-catalogue/completeness?page=8&page_size=50"));
    expect(await clamped.json()).toMatchObject({ filtered_count: 86, page: 2, page_count: 2, range_start: 51, range_end: 86 });
  });
});
