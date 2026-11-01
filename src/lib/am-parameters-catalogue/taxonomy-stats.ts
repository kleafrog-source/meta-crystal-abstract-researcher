import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { TAXONOMY_HISTORY_DIR, TAXONOMY_STATS_PATH, normalizedCategoryKey, type TaxonomyMap } from "./taxonomy";
import type { GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";

function nonEmpty(value: unknown): boolean { return typeof value === "string" && value.trim().length > 0; }

export function createTaxonomyStats(rows: GenesisLibraryParameter[], map: TaxonomyMap) {
  const categories = new Map<string, number>();
  const subCategories = new Map<string, number>();
  const domainCategory = new Map<string, number>();
  const hasDomainCategory = { has_domain_has_category: 0, has_domain_missing_category: 0, missing_domain_has_category: 0, missing_domain_missing_category: 0 };
  const rawLabels = new Map<string, number>();
  const invalidDomains = new Map<string, number>();
  const allowedDomains = new Set<string>(["sound", "structure", "metadata", "provenance", "administrative"]);
  const priority = new Set(map.enrichment?.priority_categories ?? []);
  let missingCategory = 0; let missingSubCategory = 0; let missingDomain = 0;
  let missingPriorityEn = 0; let missingPriorityRu = 0; let missingPriorityKeywords = 0;
  for (const row of rows) {
    const category = nonEmpty(row.category) ? (row.category as string).trim() : "";
    const subCategory = nonEmpty(row.sub_category) ? (row.sub_category as string).trim() : "";
    const domain = nonEmpty(row.domain) ? String(row.domain).trim() : "";
    if (!category) missingCategory += 1;
    else {
      categories.set(category, (categories.get(category) ?? 0) + 1);
      if (!map.synonym_map[normalizedCategoryKey(category, map)]) rawLabels.set(category, (rawLabels.get(category) ?? 0) + 1);
    }
    if (!subCategory) missingSubCategory += 1; else subCategories.set(subCategory, (subCategories.get(subCategory) ?? 0) + 1);
    if (!domain) missingDomain += 1;
    else if (!allowedDomains.has(domain)) invalidDomains.set(domain, (invalidDomains.get(domain) ?? 0) + 1);
    const domainKey = domain || "(missing)"; const categoryKey = category || "(missing)";
    const key = `${domainKey}|||${categoryKey}`; domainCategory.set(key, (domainCategory.get(key) ?? 0) + 1);
    const cell = `${domain ? "has_domain" : "missing_domain"}_${category ? "has_category" : "missing_category"}` as keyof typeof hasDomainCategory;
    hasDomainCategory[cell] += 1;
    if (priority.has(category)) {
      if (!nonEmpty(row.description_en)) missingPriorityEn += 1;
      if (!nonEmpty(row.description_ru)) missingPriorityRu += 1;
      if (!Array.isArray(row.semantic_keywords) || row.semantic_keywords.length === 0) missingPriorityKeywords += 1;
    }
  }
  const sortedCounts = (source: Map<string, number>) => [...source].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    generated_at: new Date().toISOString(), total_parameters: rows.length,
    distinct_categories: categories.size, distinct_sub_categories: subCategories.size,
    missing_category: missingCategory, missing_sub_category: missingSubCategory, missing_domain: missingDomain,
    invalid_domain_count: [...invalidDomains.values()].reduce((sum, count) => sum + count, 0), invalid_domain_values: sortedCounts(invalidDomains),
    priority_categories: [...priority].sort(), missing_priority_description_en: missingPriorityEn,
    missing_priority_description_ru: missingPriorityRu, missing_priority_semantic_keywords: missingPriorityKeywords,
    domain_category_matrix: [...domainCategory].map(([key, count]) => { const [domain, category] = key.split("|||"); return { domain, category, count }; }).sort((a, b) => a.domain.localeCompare(b.domain) || a.category.localeCompare(b.category)),
    has_domain_category_matrix: hasDomainCategory,
    top_categories: sortedCounts(categories).slice(0, 20),
    small_categories: sortedCounts(categories).filter(({ count }) => count < 3),
    unmapped_raw_labels: sortedCounts(rawLabels),
  };
}

export async function persistTaxonomyStats(report: unknown): Promise<void> {
  await fs.mkdir(TAXONOMY_HISTORY_DIR, { recursive: true });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const temporary = `${TAXONOMY_STATS_PATH}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, serialized, "utf8");
  await fs.rename(temporary, TAXONOMY_STATS_PATH);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(`${TAXONOMY_HISTORY_DIR}/stats-${stamp}.json`, serialized, "utf8");
}
