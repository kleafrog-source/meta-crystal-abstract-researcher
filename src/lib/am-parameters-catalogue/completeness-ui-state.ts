export const COMPLETENESS_PAGE_SIZE = 50;

export interface PageWindow {
  page: number;
  pageCount: number;
  start: number;
  end: number;
}

export function pageWindow(total: number, requestedPage: number, pageSize = COMPLETENESS_PAGE_SIZE): PageWindow {
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);
  return { page, pageCount, start, end };
}

export interface CompletionFilterRow {
  technical_name: string;
  ui_element: string;
  category?: string;
  _completion: { missing_fields: string[]; missing_count: number; gaps: unknown[] };
}

export function filterCompletionRows<T extends CompletionFilterRow>(
  rows: readonly T[],
  filters: { type?: string; category?: string; missingField?: string; query?: string },
  getSearchText: (row: T) => string,
): T[] {
  const query = (filters.query ?? "").trim().toLocaleLowerCase();
  return rows.filter((row) => row._completion.gaps.length > 0 &&
    (!filters.type || row.ui_element === filters.type) &&
    (!filters.category || row.category === filters.category) &&
    (!filters.missingField || row._completion.missing_fields.includes(filters.missingField)) &&
    (!query || getSearchText(row).includes(query)))
    .sort((a, b) => b._completion.missing_count - a._completion.missing_count || a.ui_element.localeCompare(b.ui_element) || String(a.category ?? "").localeCompare(String(b.category ?? "")) || a.technical_name.localeCompare(b.technical_name));
}

export function scopeSelectionState(selected: readonly string[], scope: readonly string[]) {
  const selectedSet = new Set(selected);
  const selectedInScope = scope.reduce((count, id) => count + Number(selectedSet.has(id)), 0);
  return {
    selectedInScope,
    checked: scope.length > 0 && selectedInScope === scope.length,
    indeterminate: selectedInScope > 0 && selectedInScope < scope.length,
  };
}

export function toggleScopeSelection(selected: readonly string[], scope: readonly string[]): string[] {
  const current = new Set(selected);
  const { checked } = scopeSelectionState(selected, scope);
  if (checked) {
    for (const id of scope) current.delete(id);
  } else {
    for (const id of scope) current.add(id);
  }
  return [...current];
}

export function toggleOneSelection(selected: readonly string[], id: string): string[] {
  const current = new Set(selected);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  return [...current];
}
