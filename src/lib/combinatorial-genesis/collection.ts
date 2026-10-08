import { createHash } from "node:crypto";

const UI_ELEMENTS = new Set(["Range", "Select", "Toggle", "Text", "Array", "String"]);
const TECHNICAL_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export interface CollectionInspection {
  collection_protocol: string | null;
  batch_index: number | null;
  raw_sha256: string;
  parameters: Array<Record<string, unknown>>;
  valid_count: number;
  reference_overlap_count: number;
  errors: string[];
  warnings: string[];
  acceptable_for_import: boolean;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Response is empty.");

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);
    throw new Error("Response does not contain valid JSON.");
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

export function inspectCollectionResponse(
  raw: string,
  existingNames: ReadonlySet<string>,
): CollectionInspection {
  const rawSha256 = createHash("sha256").update(raw, "utf8").digest("hex");
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = extractJson(raw);
  } catch (error) {
    return {
      collection_protocol: null,
      batch_index: null,
      raw_sha256: rawSha256,
      parameters: [],
      valid_count: 0,
      reference_overlap_count: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
      acceptable_for_import: false,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push("Top-level JSON must be an object.");
  }
  const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  const protocol = typeof root.collection_protocol === "string" ? root.collection_protocol : null;
  const batchIndex = finite(root.batch_index) && Number.isInteger(root.batch_index)
    ? root.batch_index
    : null;
  const technicalNameNormalizations: string[] = [];
  const parameters = Array.isArray(root.parameters)
    ? root.parameters.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item, index) => {
        const name = typeof item.technical_name === "string" ? item.technical_name : "";
        const normalized = name.toLowerCase().replaceAll("l-system", "lsystem").replaceAll(/-+/g, "_");
        if (name !== normalized && TECHNICAL_NAME.test(normalized)) {
          technicalNameNormalizations.push(`parameters[${index}].technical_name normalized: ${name} → ${normalized}.`);
          return { ...item, technical_name: normalized };
        }
        return item;
      })
    : [];

  if (protocol !== "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1") errors.push("collection_protocol must be FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1.");
  if (batchIndex === null || batchIndex < 1) errors.push("batch_index must be a positive integer.");
  if (!Array.isArray(root.parameters)) errors.push("parameters must be an array.");
  if (parameters.length === 0) errors.push("parameters must contain at least one parameter.");

  const names = new Set<string>();
  let validCount = 0;
  let referenceOverlapCount = 0;

  parameters.forEach((parameter, index) => {
    const prefix = `parameters[${index}]`;
    const startErrorCount = errors.length;
    const name = typeof parameter.technical_name === "string" ? parameter.technical_name : "";
    if (!TECHNICAL_NAME.test(name)) errors.push(`${prefix}.technical_name must be English snake_case.`);
    if (names.has(name)) errors.push(`${prefix}.technical_name duplicates another proposal.`);
    if (name) names.add(name);
    if (existingNames.has(name)) {
      referenceOverlapCount += 1;
    }

    const uiElement = typeof parameter.ui_element === "string" ? parameter.ui_element : "";
    if (!UI_ELEMENTS.has(uiElement)) errors.push(`${prefix}.ui_element is unsupported.`);
    if (typeof parameter.category !== "string" || !parameter.category.trim()) errors.push(`${prefix}.category is required.`);
    if (typeof parameter.sub_category !== "string" || !parameter.sub_category.trim()) errors.push(`${prefix}.sub_category is required.`);
    if (typeof parameter.unit !== "string" || !parameter.unit.trim()) errors.push(`${prefix}.unit is required.`);
    if (typeof parameter.name_ru !== "string" || !parameter.name_ru.trim()) errors.push(`${prefix}.name_ru is required.`);
    if (typeof parameter.description_en !== "string" || !parameter.description_en.trim()) errors.push(`${prefix}.description_en is required.`);
    if (typeof parameter.description_ru !== "string" || !parameter.description_ru.trim()) errors.push(`${prefix}.description_ru is required.`);
    if (String(parameter.name_ru ?? "").length > 120) errors.push(`${prefix}.name_ru exceeds 120 characters.`);
    if (String(parameter.description_en ?? "").length > 360) errors.push(`${prefix}.description_en exceeds 360 characters.`);
    if (String(parameter.description_ru ?? "").length > 420) errors.push(`${prefix}.description_ru exceeds 420 characters.`);
    if (typeof parameter.quantity_kind !== "string" || !TECHNICAL_NAME.test(parameter.quantity_kind)) {
      errors.push(`${prefix}.quantity_kind must be non-empty English snake_case.`);
    }

    if (uiElement === "Range") {
      const values = [parameter.min_value, parameter.max_value, parameter.step, parameter.default];
      if (!values.every(finite)) {
        errors.push(`${prefix} Range values must be finite numbers.`);
      } else {
        const [min, max, step, defaultValue] = values as number[];
        if (min > max) errors.push(`${prefix}.min_value must not exceed max_value.`);
        if (defaultValue < min || defaultValue > max) errors.push(`${prefix}.default must be inside the range.`);
        if (step <= 0) errors.push(`${prefix}.step must be positive.`);
      }
    }
    if (uiElement === "Select") {
      const options = stringArray(parameter.options);
      if (!options || options.length === 0) errors.push(`${prefix}.options must be a non-empty string array.`);
      else {
        if (new Set(options).size !== options.length) errors.push(`${prefix}.options must be unique.`);
        if (typeof parameter.default !== "string" || !options.includes(parameter.default)) errors.push(`${prefix}.default must be present in options.`);
      }
    }
    if (uiElement === "Toggle") {
      if (parameter.min_value !== 0 || parameter.max_value !== 1 || parameter.step !== 1 || (parameter.default !== 0 && parameter.default !== 1) || parameter.unit !== "boolean") {
        errors.push(`${prefix} Toggle requires min_value 0, max_value 1, step 1, default 0 or 1, and unit boolean.`);
      }
    }
    if (uiElement === "Text" && (typeof parameter.default !== "string" || parameter.unit !== "text")) {
      errors.push(`${prefix} Text requires a string default and unit text.`);
    }
    if (uiElement === "String" && typeof parameter.default !== "string") {
      errors.push(`${prefix} String requires a string default.`);
    }
    if (uiElement === "Array" && (!Array.isArray(parameter.default) || parameter.default.length === 0 || !parameter.default.every(finite))) {
      errors.push(`${prefix} Array requires a non-empty array of finite numbers as default.`);
    }

    const tags = stringArray(parameter.lyria_prompt_tags);
    if (!tags || tags.length !== 3 || tags.some((item) => !item.trim())) errors.push(`${prefix}.lyria_prompt_tags must contain exactly 3 non-empty strings.`);
    const keywords = stringArray(parameter.semantic_keywords);
    if (!keywords || keywords.length !== 7 || keywords.some((item) => !item.trim())) errors.push(`${prefix}.semantic_keywords must contain exactly 7 non-empty strings.`);
    else if (keywords.slice(0, 3).some((item) => !/[А-Яа-яЁё]/.test(item)) || keywords.slice(3).some((item) => /[А-Яа-яЁё]/.test(item))) {
      errors.push(`${prefix}.semantic_keywords must contain 3 Russian strings followed by 4 English strings.`);
    }
    if (errors.length === startErrorCount) validCount += 1;
  });

  if (referenceOverlapCount > 0) {
    warnings.push(
      `${referenceOverlapCount} technical_name value(s) also exist in the current V3 reference library; inbox import may preserve them as frequency/provenance evidence, while direct autonomous publication will reject collisions.`,
    );
  }

  if (parameters.length > 0 && validCount < parameters.length) {
    warnings.push("The batch can be reviewed, but invalid parameters must be corrected before import.");
  }
  warnings.push(...technicalNameNormalizations);

  return {
    collection_protocol: protocol,
    batch_index: batchIndex,
    raw_sha256: rawSha256,
    parameters,
    valid_count: validCount,
    reference_overlap_count: referenceOverlapCount,
    errors,
    warnings,
    acceptable_for_import: parameters.length > 0 && errors.length === 0 && validCount === parameters.length,
  };
}
