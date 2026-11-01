import { promises as fs } from "node:fs";
import path from "node:path";
import { GENESIS_DATA_ROOT } from "@/lib/combinatorial-genesis/library";
import taxonomyConfig from "./taxonomy-config.json";

export const TAXONOMY_MAP_PATH = path.join(GENESIS_DATA_ROOT, "library", "taxonomy", "category-synonym-map.json");
export const TAXONOMY_STATS_PATH = path.join(GENESIS_DATA_ROOT, "library", "taxonomy", "stats-latest.json");
export const TAXONOMY_HISTORY_DIR = path.join(GENESIS_DATA_ROOT, "library", "taxonomy", "history");
export const DOMAIN_SET = ["sound", "structure", "metadata", "provenance", "administrative"] as const;
export type Domain = (typeof DOMAIN_SET)[number];

export interface TaxonomyMap {
  version: string;
  normalization_rules: { empty_tokens: string[] };
  synonym_map: Record<string, string>;
  sub_category_rules: { promote_to_sub_when_merged: Record<string, { category: string; sub_category: string | null }> };
  domain_rules: { default_domain: Domain; map: Record<string, Domain> };
  enrichment?: { priority_categories?: string[] };
}

export async function loadTaxonomyMap(): Promise<TaxonomyMap> {
  const map = JSON.parse(await fs.readFile(TAXONOMY_MAP_PATH, "utf8")) as TaxonomyMap;
  if (!map || typeof map.version !== "string" || !map.synonym_map || !map.sub_category_rules?.promote_to_sub_when_merged || !map.domain_rules?.map) throw new Error("Taxonomy synonym map has an invalid schema.");
  const allowedDomains = new Set<string>(DOMAIN_SET);
  for (const category of Object.values(map.synonym_map)) if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(category)) throw new Error(`Non-canonical category in synonym map: ${category}`);
  for (const [category, domain] of Object.entries(map.domain_rules.map)) if (!canonicalCategoryValues(map).includes(category) || !allowedDomains.has(domain)) throw new Error(`Invalid category/domain mapping: ${category} -> ${domain}`);
  for (const [label, rule] of Object.entries(map.sub_category_rules.promote_to_sub_when_merged)) if (!rule || !canonicalCategoryValues(map).includes(rule.category) || (rule.sub_category !== null && !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(rule.sub_category))) throw new Error(`Invalid sub-category promotion rule: ${label}`);
  map.enrichment = { priority_categories: taxonomyConfig.priority_categories };
  return map;
}

export function snakeCaseLabel(value: unknown, emptyTokens: readonly string[] = []): string {
  if (typeof value !== "string") return "";
  const source = value.trim().replace(/&amp;/gi, "&");
  const empty = new Set(emptyTokens.map((token) => token.trim().toLocaleLowerCase()));
  if (!source || empty.has(source.toLocaleLowerCase())) return "";
  const normalized = source.toLocaleLowerCase()
    .replace(/[\s/\-&]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return empty.has(normalized) ? "" : normalized;
}

export function canonicalCategoryValues(map: TaxonomyMap): string[] {
  return [...new Set(Object.values(map.synonym_map))].sort();
}

export function normalizedCategoryKey(value: unknown, map: TaxonomyMap): string {
  return snakeCaseLabel(value, map.normalization_rules.empty_tokens);
}

export function normalizeCategoryPair(categoryValue: unknown, subValue: unknown, map: TaxonomyMap): { category: string; sub_category: string } {
  const oldRaw = typeof categoryValue === "string" ? categoryValue : "";
  const oldKey = normalizedCategoryKey(oldRaw, map);
  let category = oldKey ? (map.synonym_map[oldKey] ?? oldKey) : "";
  let sub_category = snakeCaseLabel(subValue, map.normalization_rules.empty_tokens);
  const promotion = map.sub_category_rules.promote_to_sub_when_merged[oldKey];
  if (promotion && (typeof subValue !== "string" || !subValue.trim() || normalizedCategoryKey(subValue, map) === oldKey)) {
    category = promotion.category;
    sub_category = promotion.sub_category ?? "";
  }
  if (sub_category === category) sub_category = "";
  return { category, sub_category };
}

export function domainForCategory(category: string, map: TaxonomyMap): Domain | null {
  return map.domain_rules.map[category] ?? null;
}
