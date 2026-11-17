import { describe, expect, it } from "vitest";
import { filterCompletionRows, pageWindow, scopeSelectionState, toggleOneSelection, toggleScopeSelection } from "./completeness-ui-state";

describe("completeness page and scoped selection", () => {
  it("clamps page navigation and reports an empty result as 0–0 of 0", () => {
    expect(pageWindow(86, 2)).toEqual({ page: 2, pageCount: 2, start: 51, end: 86 });
    expect(pageWindow(86, 9)).toEqual({ page: 2, pageCount: 2, start: 51, end: 86 });
    expect(pageWindow(0, 9)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 });
  });

  it("selects all matching IDs once, supports indeterminate and individual deselection", () => {
    const scope = Array.from({ length: 86 }, (_, index) => `parameter_${index}`);
    const selected = toggleScopeSelection([], scope);
    expect(selected).toHaveLength(86);
    expect(new Set(selected).size).toBe(86);
    expect(scopeSelectionState(selected, scope)).toMatchObject({ checked: true, indeterminate: false, selectedInScope: 86 });

    const oneRemoved = toggleOneSelection(selected, scope[0]);
    expect(scopeSelectionState(oneRemoved, scope)).toMatchObject({ checked: false, indeterminate: true, selectedInScope: 85 });
    expect(toggleScopeSelection(oneRemoved, scope)).toHaveLength(86);
    expect(toggleScopeSelection(selected, scope)).toEqual([]);
  });

  it("preserves IDs across page changes but scopes select-all only to matching IDs", () => {
    const pageOne = ["a", "b"];
    const pageTwo = ["c", "d"];
    const selection = toggleScopeSelection([], [...pageOne, ...pageTwo]);
    expect(scopeSelectionState(selection, pageTwo).checked).toBe(true);
    const withoutC = toggleOneSelection(selection, "c");
    expect(withoutC).toEqual(["a", "b", "d"]);
    expect(toggleScopeSelection(withoutC, ["x", "y"])).toEqual(["a", "b", "d", "x", "y"]);
  });

  it("filters incomplete rows, sorts the entire selection before pagination, and supports search", () => {
    const rows = Array.from({ length: 86 }, (_, index) => ({
      technical_name: `issue_${String(index).padStart(2, "0")}`,
      ui_element: "Range",
      category: index % 2 ? "sound" : "structure",
      searchable: index >= 80 ? `term ${index}` : `other ${index}`,
      _completion: { missing_fields: [index % 2 ? "description_en" : "quantity_kind"], missing_count: index % 2 ? 1 : 2, gaps: [{}] },
    }));
    rows.push({ technical_name: "complete", ui_element: "Range", category: "sound", searchable: "term", _completion: { missing_fields: [], missing_count: 0, gaps: [] } });
    const filtered = filterCompletionRows(rows, { category: "structure", query: "term 8" }, (row) => row.searchable);
    expect(filtered.map((row) => row.technical_name)).toEqual(["issue_80", "issue_82", "issue_84"]);
    expect(filtered.every((row) => row._completion.gaps.length > 0)).toBe(true);
    expect(pageWindow(filtered.length, 2, 2)).toEqual({ page: 2, pageCount: 2, start: 3, end: 3 });
  });
});
