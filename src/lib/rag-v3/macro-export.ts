import type { ActiveParameter } from "@/lib/rag-v3/types";

export type MacroExportFormat = "short" | "json" | "markdown";
export type MacroExportField = "technical_name" | "unit" | "name_ru" | "category" | "ui_element" | "description_en" | "description_ru" | "lyria_prompt_tags" | "semantic_keywords";

export const MACRO_EXPORT_FIELDS: Array<{ key: MacroExportField; label: string }> = [
  { key: "technical_name", label: "technical_name" }, { key: "unit", label: "unit" },
  { key: "name_ru", label: "name_ru" }, { key: "category", label: "category / sub_category" },
  { key: "ui_element", label: "ui_element + config" }, { key: "description_en", label: "description_en" },
  { key: "description_ru", label: "description_ru" }, { key: "lyria_prompt_tags", label: "lyria_prompt_tags" },
  { key: "semantic_keywords", label: "semantic_keywords" },
];

export const DEFAULT_MACRO_EXPORT_FIELDS: MacroExportField[] = ["technical_name", "unit", "name_ru", "category", "ui_element"];

function uiConfig(parameter: ActiveParameter) {
  const type = parameter.ui_element ?? "Range";
  const unit = parameter.unit ?? "";
  if (type === "Range" || type === "Toggle") return { type, config: { min_value: parameter.min_value, max_value: parameter.max_value, step: parameter.step, default: parameter.default, unit } };
  if (type === "Select") return { type, config: { options: parameter.options ?? [], default: parameter.default, unit } };
  return { type, config: { default: parameter.default, unit } };
}

function compactUi(parameter: ActiveParameter) {
  const unit = parameter.unit ?? ""; const type = parameter.ui_element ?? "Range";
  if (type === "Range" || type === "Toggle") return `${type} [min: ${parameter.min_value ?? ""}, max: ${parameter.max_value ?? ""}, step: ${parameter.step ?? ""}, default: ${parameter.default}, unit: ${unit}]`;
  if (type === "Select") return `${type} [options: ${(parameter.options ?? []).join(", ")}; default: ${parameter.default}, unit: ${unit}]`;
  return `${type} [default: ${Array.isArray(parameter.default) ? `[${parameter.default.join(", ")}]` : parameter.default}, unit: ${unit}]`;
}

function selectedRecord(parameter: ActiveParameter, fields: Set<MacroExportField>) {
  const result: Record<string, unknown> = { value: parameter.current_value };
  if (fields.has("technical_name")) result.technical_name = parameter.technical_name;
  if (fields.has("unit")) result.unit = parameter.unit ?? "";
  if (fields.has("name_ru")) result.name_ru = parameter.name_ru ?? "";
  if (fields.has("category")) result.category_sub_category = [parameter.category, parameter.sub_category].filter(Boolean).join(" / ");
  if (fields.has("ui_element")) result.ui_element = uiConfig(parameter);
  if (fields.has("description_en")) result.description_en = parameter.description_en ?? "";
  if (fields.has("description_ru")) result.description_ru = parameter.description_ru ?? "";
  if (fields.has("lyria_prompt_tags")) result.lyria_prompt_tags = parameter.lyria_prompt_tags ?? [];
  if (fields.has("semantic_keywords")) result.semantic_keywords = parameter.semantic_keywords ?? [];
  return result;
}

export function buildMacroExport(parameters: ActiveParameter[], format: MacroExportFormat, enabledFields: MacroExportField[]): string {
  if (format === "short") return parameters.map((item) => `${item.technical_name}: ${item.current_value}`).join("\n");
  const fields = new Set(enabledFields);
  if (format === "json") return JSON.stringify(parameters.map((item) => selectedRecord(item, fields)), null, 2);
  return parameters.map((item) => {
    const lines = [`## ${item.technical_name}`, `**Value:** ${item.current_value}${fields.has("unit") && item.unit ? ` ${item.unit}` : ""}`];
    if (fields.has("name_ru") && item.name_ru) lines.push(`**Название:** ${item.name_ru}`);
    if (fields.has("category")) lines.push(`**Раздел:** ${[item.category, item.sub_category].filter(Boolean).join(" / ")}`);
    if (fields.has("ui_element")) lines.push(compactUi(item));
    if (fields.has("description_en") && item.description_en) lines.push(item.description_en);
    if (fields.has("description_ru") && item.description_ru) lines.push(item.description_ru);
    if (fields.has("lyria_prompt_tags") && item.lyria_prompt_tags?.length) lines.push(`**Lyria:** ${item.lyria_prompt_tags.join(", ")}`);
    if (fields.has("semantic_keywords") && item.semantic_keywords?.length) lines.push(`**Keywords:** ${item.semantic_keywords.join(", ")}`);
    return lines.join("\n\n");
  }).join("\n\n---\n\n");
}

export function macroExtension(format: MacroExportFormat) { return format === "json" ? "json" : format === "markdown" ? "md" : "txt"; }
