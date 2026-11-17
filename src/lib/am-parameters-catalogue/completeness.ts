import type { GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";
import { DOMAIN_SET, normalizedCategoryKey, type TaxonomyMap } from "./taxonomy";
import { isPublishedParameterType } from "@/lib/combinatorial-genesis/parameter-schema";

export interface CompletionGap { field: string; reason: string; kind: "missing" | "invalid" }
export interface CompletionAssessment {
  /** Fields that need attention. Kept under its old name for API compatibility. */
  missing_fields: string[];
  missing_only_fields: string[];
  invalid_fields: string[];
  gaps: CompletionGap[];
  missing_count: number;
  required_count: number;
  completeness: number;
  complete: boolean;
}

const SNAKE_CASE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const CYRILLIC = /[А-Яа-яЁё]/;
const LATIN = /[A-Za-z]/;
const PATH_OR_PROVENANCE = /(?:[A-Za-z]:[\\/]|\\\\[^\s]+|\b(?:source_file|source_label|batch_id|package_id|raw_sha256|selection_score)\b|freellmapi|ollama)/i;
const ALWAYS_REQUIRED = [
  "technical_name", "name_ru", "description_en", "description_ru", "category", "ui_element",
  "default", "unit", "quantity_kind", "lyria_prompt_tags", "semantic_keywords", "domain",
] as const;

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function safeLexicalText(value: string): boolean { return !PATH_OR_PROVENANCE.test(value); }

export function assessCompleteness(row: GenesisLibraryParameter, map: TaxonomyMap): CompletionAssessment {
  const gaps = new Map<string, CompletionGap>();
  const mark = (field: string, reason: string) => {
    const value = (row as unknown as Record<string, unknown>)[field];
    const absent = value === undefined || value === null || typeof value === "string" && !value.trim() || Array.isArray(value) && value.length === 0;
    gaps.set(field, { field, reason, kind: absent ? "missing" : "invalid" });
  };
  const category = text(row.category);
  const type = row.ui_element;
  let requiredCount = ALWAYS_REQUIRED.length;

  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(text(row.technical_name))) mark("technical_name", "Требуется имя в формате snake_case.");
  if (!text(row.name_ru) || !safeLexicalText(text(row.name_ru))) mark("name_ru", "Требуется краткое русское название без путей и provenance.");
  if (!text(row.description_en) || text(row.description_en).length > 360 || !safeLexicalText(text(row.description_en))) mark("description_en", "Нужно описание EN длиной до 360 символов.");
  if (!text(row.description_ru) || text(row.description_ru).length > 420 || !safeLexicalText(text(row.description_ru))) mark("description_ru", "Нужно описание RU длиной до 420 символов.");
  if (!category || map.synonym_map[normalizedCategoryKey(category, map)] !== category) mark("category", "Категория должна входить в закрытый список taxonomy.");
  if (!isPublishedParameterType(type)) mark("ui_element", "Тип должен быть Range, Select, Toggle, Text, String или Array.");
  if (!text(row.unit)) mark("unit", "Требуется единица или понятная метка типа значения.");
  const quantityKind = text(row.quantity_kind);
  if (!SNAKE_CASE.test(quantityKind) || quantityKind === text(row.unit)) mark("quantity_kind", "Требуется короткий snake_case тип величины, отличный от unit.");
  if (!DOMAIN_SET.includes(row.domain as (typeof DOMAIN_SET)[number])) mark("domain", "Домен должен входить в закрытый enum.");

  if (category) {
    requiredCount += 1;
    const subCategory = text(row.sub_category);
    if (!SNAKE_CASE.test(subCategory)) mark("sub_category", "Для категории требуется подкатегория snake_case.");
  }

  const tags = row.lyria_prompt_tags;
  if (!Array.isArray(tags) || tags.length !== 3 || tags.some((item) => typeof item !== "string" || !text(item) || !LATIN.test(item) || CYRILLIC.test(item) || !safeLexicalText(item))) {
    mark("lyria_prompt_tags", "Требуются ровно 3 непустые англоязычные фразы.");
  }
  const keywords = row.semantic_keywords;
  if (!Array.isArray(keywords) || keywords.length !== 7 || keywords.some((item) => typeof item !== "string" || !text(item) || !safeLexicalText(item)) ||
      keywords.slice(0, 3).some((item) => typeof item !== "string" || !CYRILLIC.test(item)) ||
      keywords.slice(3).some((item) => typeof item !== "string" || !LATIN.test(item) || CYRILLIC.test(item))) {
    mark("semantic_keywords", "Требуются 7 ключевых слов: первые 3 на русском, следующие 4 на английском.");
  }

  const hasOptions = Array.isArray(row.options) && row.options.length > 0;
  if (type === "Range") {
    requiredCount += 3;
    if (!finite(row.min_value)) mark("min_value", "Range требует конечный min_value.");
    if (!finite(row.max_value)) mark("max_value", "Range требует конечный max_value.");
    if (!finite(row.step) || row.step <= 0) mark("step", "Range требует step > 0.");
    if (!finite(row.default) || (finite(row.min_value) && row.default < row.min_value) || (finite(row.max_value) && row.default > row.max_value)) mark("default", "default должен быть числом внутри min_value…max_value.");
    const en = text(row.description_en).toLocaleLowerCase();
    const ru = text(row.description_ru).toLocaleLowerCase();
    const timeLikeRange = /^(?:ms|s|sec|secs|second|seconds|millisecond|milliseconds)$/i.test(text(row.unit)) || /^(?:time|duration|delay_time)$/i.test(text(row.quantity_kind));
    const englishLow = /\b(low|lower|negative|below)\b/.test(en) || timeLikeRange && /\b(short|shorter)\b/.test(en);
    const englishHigh = /\b(high|higher|positive|above)\b/.test(en) || timeLikeRange && /\b(long|longer)\b/.test(en);
    const russianLow = /(низк|нижн|меньш|отрицат|ниже)/.test(ru) || timeLikeRange && /(коротк|кратк)/.test(ru);
    const russianHigh = /(высок|высш|верхн|больш|положит|выше)/.test(ru) || timeLikeRange && /(длинн|длитель)/.test(ru);
    if (!englishLow || !englishHigh) mark("description_en", "Для Range нужно объяснить направление низких и высоких значений.");
    if (!russianLow || !russianHigh) mark("description_ru", "Для Range нужно объяснить направление низких и высоких значений.");

  } else if (type === "Select") {
    requiredCount += 1;
    const options = row.options;
    if (!Array.isArray(options) || options.length < 2 || options.some((item) => typeof item !== "string" || !text(item)) || new Set(options).size !== options.length) mark("options", "Select требует минимум 2 уникальных непустых options.");
    if (typeof row.default !== "string" || !Array.isArray(options) || !options.includes(row.default)) mark("default", "default Select должен точно совпадать с одним option.");
    if (finite(row.min_value) || finite(row.max_value) || finite(row.step)) {
      mark("min_value", "Select не должен содержать min_value, max_value или step.");
    }
  } else if (type === "Toggle") {
    requiredCount += 3;
    if (!finite(row.min_value) || row.min_value !== 0) mark("min_value", "Toggle требует min_value = 0.");
    if (!finite(row.max_value) || row.max_value !== 1) mark("max_value", "Toggle требует max_value = 1.");
    if (!finite(row.step) || row.step !== 1) mark("step", "Toggle требует step = 1.");
    if (row.default !== 0 && row.default !== 1) mark("default", "Toggle default должен быть 0 или 1.");
    if (text(row.unit) !== "boolean") mark("unit", "Toggle unit должен быть boolean.");
    const descriptionEn = text(row.description_en);
    const hasEnglishStateLabels = /\b(off|disabled)\b/i.test(descriptionEn) && /\b(on|enabled)\b/i.test(descriptionEn);
    const hasEnglishNumericStates = /(?:^|\D)0(?:\D|$)/.test(descriptionEn) && /(?:^|\D)1(?:\D|$)/.test(descriptionEn) &&
      /\b(allow|allows|let|lets|follow|follows|manual|fixed)\b/i.test(descriptionEn) &&
      /\b(pin|pins|hold|holds|lock|locks|automatic|automatically|prevent|prevents)\b/i.test(descriptionEn);
    if (!hasEnglishStateLabels && !hasEnglishNumericStates) mark("description_en", "Toggle должен объяснять состояния off/on либо различимые состояния 0/1.");
    const descriptionRu = text(row.description_ru);
    const hasRussianStateLabels = /(?:выкл(?:юч\p{L}*)?|отключ\p{L}*)/iu.test(descriptionRu) && /(?:вкл(?:юч\p{L}*)?|актив\p{L}*)/iu.test(descriptionRu);
    const hasRussianNumericStates = /(?:^|\D)0(?:\D|$)/.test(descriptionRu) && /(?:^|\D)1(?:\D|$)/.test(descriptionRu) &&
      /(позвол|разреш|след|ручн)/iu.test(descriptionRu) && /(удерж|фикс|автомат|запрет)/iu.test(descriptionRu);
    if (!hasRussianStateLabels && !hasRussianNumericStates) mark("description_ru", "Toggle должен объяснять выключенное/включённое состояния или различимые состояния 0/1.");

  } else if (type === "Text") {
    // Text controls may intentionally start empty; the published collection contract requires a string, not non-empty text.
    if (typeof row.default !== "string") mark("default", "Text требует строковый default.");
    if (text(row.unit) !== "text") mark("unit", "Text unit должен быть text.");
  } else if (type === "String") {
    if (typeof row.default !== "string") mark("default", "String требует строковый default.");
  } else if (type === "Array") {
    if (!Array.isArray(row.default) || row.default.length === 0 || row.default.some((value) => !finite(value))) mark("default", "Array default должен быть непустым массивом конечных чисел.");
  } else if (!(finite(row.default) || typeof row.default === "string" && Boolean(text(row.default)) || Array.isArray(row.default) && row.default.every(finite))) {
    mark("default", "Значение default не соответствует допустимому JSON-типу.");
  }

  const result = [...gaps.values()];
  const missingCount = result.length;
  return {
    missing_fields: result.map(({ field }) => field),
    missing_only_fields: result.filter(({ kind }) => kind === "missing").map(({ field }) => field),
    invalid_fields: result.filter(({ kind }) => kind === "invalid").map(({ field }) => field),
    gaps: result,
    missing_count: missingCount,
    required_count: requiredCount,
    completeness: requiredCount ? Math.round(((requiredCount - missingCount) / requiredCount) * 100) : 100,
    complete: missingCount === 0,
  };
}

export function requiredFieldsForParameter(row: GenesisLibraryParameter, map: TaxonomyMap): string[] {
  return assessCompleteness(row, map).missing_fields;
}

export function patchImprovesCompleteness(before: GenesisLibraryParameter, after: GenesisLibraryParameter, map: TaxonomyMap): boolean {
  const previous = assessCompleteness(before, map);
  const next = assessCompleteness(after, map);
  return next.missing_count < previous.missing_count;
}
