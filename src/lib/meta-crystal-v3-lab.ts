import { promises as fs } from "node:fs";
import path from "node:path";

import { inspectCollectionResponse } from "@/lib/combinatorial-genesis/collection";
import { readGenesisLibrary, type GenesisLibraryParameter } from "@/lib/combinatorial-genesis/library";

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");

export interface LabPackageCandidate {
  technical_name: string;
  parent_parameters: string[];
  query_similarity: number;
  selection_score: number;
  value_inference: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ValidatedLabCandidate {
  parameter: Record<string, unknown>;
  package_candidate: LabPackageCandidate;
  errors: string[];
  warnings: string[];
}

export async function readV3ParameterUnion(): Promise<{
  datasetVersion: string;
  records: Map<string, GenesisLibraryParameter>;
}> {
  const latest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8")) as { version_id: string };
  const frozen = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", latest.version_id, "parameters.json"), "utf8")) as GenesisLibraryParameter[];
  const library = await readGenesisLibrary();
  const records = new Map<string, GenesisLibraryParameter>();
  for (const parameter of frozen) if (parameter.technical_name) records.set(parameter.technical_name, parameter);
  for (const parameter of library) if (parameter.technical_name) records.set(parameter.technical_name, parameter);
  return { datasetVersion: latest.version_id, records };
}

function candidateErrors(allErrors: string[], index: number): string[] {
  const prefix = `parameters[${index}]`;
  return allErrors.filter((error) => error.startsWith(prefix));
}

function nearestLexicalNames(name: string, existingNames: ReadonlySet<string>): string[] {
  const proposed = new Set(name.split("_").filter(Boolean));
  if (proposed.size < 3) return [];
  return [...existingNames].map((existing) => {
    const tokens = new Set(existing.split("_").filter(Boolean));
    const intersection = [...proposed].filter((token) => tokens.has(token)).length;
    const union = new Set([...proposed, ...tokens]).size;
    return { existing, score: union ? intersection / union : 0 };
  }).filter((item) => item.score >= 0.72).sort((left, right) => right.score - left.score).slice(0, 3).map((item) => item.existing);
}

export function validateLabParameters(
  parameters: Array<Record<string, unknown>>,
  existingNames: ReadonlySet<string>,
  parentParameters: string[] = [],
): ValidatedLabCandidate[] {
  const raw = JSON.stringify({
    collection_protocol: "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1",
    batch_index: 1,
    parameters,
  });
  const inspection = inspectCollectionResponse(raw, existingNames);
  return inspection.parameters.map((parameter, index) => {
    const errors = candidateErrors(inspection.errors, index);
    const quantityKind = typeof parameter.quantity_kind === "string" ? parameter.quantity_kind.trim() : "";
    if (!quantityKind || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(quantityKind)) {
      errors.push(`parameters[${index}].quantity_kind must be non-empty English snake_case.`);
    }
    const name = String(parameter.technical_name ?? "");
    if (existingNames.has(name)) errors.push(`parameters[${index}].technical_name already exists in V3.`);
    const lexicalNeighbours = nearestLexicalNames(name, existingNames);
    const uiElement = String(parameter.ui_element ?? "");
    const packageCandidate: LabPackageCandidate = {
      technical_name: name,
      parent_parameters: parentParameters,
      query_similarity: 0,
      selection_score: 1,
      value_inference: {
        status: errors.length === 0 ? "auto_resolved" : "needs_review",
        confidence: errors.length === 0 ? 0.8 : 0,
        ui_element: uiElement,
        unit: parameter.unit,
        quantity_kind: quantityKind,
        ...(uiElement === "Range" || uiElement === "Toggle" ? {
          min_value: parameter.min_value,
          max_value: parameter.max_value,
          step: parameter.step,
        } : {}),
        ...(uiElement === "Select" ? { options: parameter.options } : {}),
        default: parameter.default,
      },
      metadata: {
        name_ru: parameter.name_ru,
        description_en: parameter.description_en,
        description_ru: parameter.description_ru,
        category: parameter.category,
        sub_category: parameter.sub_category,
        lyria_prompt_tags: parameter.lyria_prompt_tags,
        semantic_keywords: parameter.semantic_keywords,
        review_status: "needs_review",
      },
    };
    return {
      parameter,
      package_candidate: packageCandidate,
      errors: [...new Set(errors)],
      warnings: [
        ...inspection.warnings,
        ...(lexicalNeighbours.length ? [`Possible near-duplicate technical_name values: ${lexicalNeighbours.join(", ")}.`] : []),
      ],
    };
  });
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced ?? trimmed;
  try {
    const parsed = JSON.parse(source) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    }
  }
  throw new Error("Chat model did not return a JSON object.");
}
