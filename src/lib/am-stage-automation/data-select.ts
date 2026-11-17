export type DataSelectMode = "parameters_by_name" | "fields" | "summary";
export type DataSelectArtifact = { artifactId?: string; kind: string; validity?: string; data: unknown };

export function dataSelectAcceptsInputKind(mode: unknown, kind: string): boolean {
  if (mode === "parameters_by_name") return kind === "parameter-bank";
  if (mode === "fields") return kind === "parameter-bank" || kind === "record-set";
  return mode === "summary" && ["parameter-bank", "record-set", "text-feature-snapshot", "brief", "text"].includes(kind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parameterRows(data: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.parameters) ? data.parameters : null;
  if (!rows || rows.some((row) => !isRecord(row) || typeof row.technical_name !== "string")) {
    throw new Error("DATA_SELECT_INPUT_INVALID: parameter-bank must contain parameter objects with technical_name.");
  }
  return rows as Record<string, unknown>[];
}

function recordRows(data: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.records) ? data.records : null;
  if (!rows || rows.some((row) => !isRecord(row))) throw new Error("DATA_SELECT_INPUT_INVALID: record-set must contain an object records array.");
  return rows as Record<string, unknown>[];
}

function normalizedBankRows(data: unknown) {
  return parameterRows(data).map((row) => ({
    technical_name: typeof row.technical_name === "string" ? row.technical_name : "",
    name_ru: typeof row.name_ru === "string" ? row.name_ru : "",
    category: typeof row.category === "string" ? row.category : "",
    ui_element: typeof row.ui_element === "string" ? row.ui_element : "",
    ...(Object.prototype.hasOwnProperty.call(row, "current_value") ? { current_value: row.current_value } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "suggested_value") ? { suggested_value: row.suggested_value } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "selected_value") ? { selected_value: row.selected_value } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "input_value") ? { input_value: row.input_value } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "default") ? { default: row.default } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "catalogue_default") ? { catalogue_default: row.catalogue_default } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "value_status") ? { value_status: row.value_status } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "selection_detail") ? { selection_detail: row.selection_detail } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, "selection_evidence") ? { selection_evidence: row.selection_evidence } : {}),
    similarity: typeof row.similarity === "number" ? row.similarity : 0,
    domain_layer: typeof row.domain_layer === "string" ? row.domain_layer : "",
    source: typeof row.source === "string" ? row.source : "",
  }));
}

function retainedProvenance(data: unknown, selectedKeys?: Set<string>) {
  if (!isRecord(data) || !isRecord(data.provenance)) return undefined;
  return selectedKeys
    ? Object.fromEntries(Object.entries(data.provenance).filter(([key]) => selectedKeys.has(key)))
    : data.provenance;
}

export function validateDataSelectSettings(mode: unknown, fields: unknown): string[] {
  if (!(["parameters_by_name", "fields", "summary"] as unknown[]).includes(mode)) return ["DATA_SELECT_MODE_INVALID: select one supported mode."];
  if (mode !== "summary" && (!Array.isArray(fields) || fields.length === 0 || fields.some((field) => typeof field !== "string" || !field.trim()))) {
    return ["DATA_SELECT_FIELDS_REQUIRED: this mode requires a non-empty list of names or fields."];
  }
  if (Array.isArray(fields) && fields.some((field) => typeof field !== "string" || !field.trim())) return ["DATA_SELECT_FIELDS_INVALID: names and fields must be non-empty strings."];
  return [];
}

/** AM2-compatible selection and projection, with input artifact identity retained on the output envelope. */
export function selectAutomationData(input: DataSelectArtifact, mode: DataSelectMode, fields: string[]) {
  const problems = validateDataSelectSettings(mode, fields);
  if (problems.length) throw new Error(problems.join(" "));
  const inputRefs = input.artifactId ? [input.artifactId] : [];

  if (mode === "parameters_by_name") {
    if (input.kind !== "parameter-bank") throw new Error("DATA_SELECT_INPUT_KIND_INVALID: parameters_by_name requires a parameter-bank input.");
    const wanted = new Set(fields);
    const all = parameterRows(input.data);
    const parameters = all.filter((row) => wanted.has(String(row.technical_name)));
    const selected = new Set(parameters.map((row) => String(row.technical_name)));
    const missing = fields.filter((name) => !selected.has(name));
    return {
      kind: "parameter-bank" as const,
      data: { schema: "am2_param_bank_v1", parameters, ...(retainedProvenance(input.data, selected) ? { provenance: retainedProvenance(input.data, selected) } : {}) },
      inputRefs,
      warnings: missing.length ? [`Missing parameters: ${missing.join(", ")}`] : [],
      metrics: { selected: parameters.length, missing: missing.length },
    };
  }

  if (mode === "fields") {
    if (input.kind !== "parameter-bank" && input.kind !== "record-set") throw new Error("DATA_SELECT_INPUT_KIND_INVALID: fields requires a parameter-bank or record-set input.");
    const sourceRows = input.kind === "parameter-bank" ? normalizedBankRows(input.data) : recordRows(input.data).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null ? value : String(value)])));
    const records = sourceRows.map((row) => Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]])));
    const provenance = retainedProvenance(input.data);
    return {
      kind: "record-set" as const,
      data: { schema: "am2_record_set_v1", fields: [...new Set(records.flatMap((row) => Object.keys(row)))], records, sourceKind: input.kind, ...(provenance ? { provenance } : {}) },
      inputRefs,
      warnings: [],
      metrics: { rows: records.length, fields: fields.length },
    };
  }

  const data = input.data;
  const parameters = input.kind === "parameter-bank" ? parameterRows(data) : [];
  const records = input.kind === "record-set" ? recordRows(data) : [];
  const count = input.kind === "parameter-bank" ? parameters.length
    : input.kind === "record-set" ? records.length
      : input.kind === "segment-plan" && isRecord(data) && Array.isArray(data.windows) ? data.windows.length
        : input.kind === "vocal-allocation" && isRecord(data) && Array.isArray(data.parameters) ? data.parameters.length
          : ["brief", "text", "description", "transcription", "gap-descriptions", "natural-description", "reverse-query", "llm-advice"].includes(input.kind)
            ? (typeof data === "string" ? data.length : isRecord(data) && typeof (data.text ?? data.query ?? data.recommendation) === "string" ? String(data.text ?? data.query ?? data.recommendation).length : 0)
            : 0;
  const summaryRecords = [
    { field: "artifactId", value: input.artifactId ?? "" },
    { field: "kind", value: input.kind },
    { field: "count", value: count },
    { field: "validity", value: input.validity ?? "valid" },
    ...parameters.slice(0, 20).map((row) => ({
      field: String(row.technical_name),
      ...(Object.prototype.hasOwnProperty.call(row, "selected_value") ? { value: row.selected_value } : Object.prototype.hasOwnProperty.call(row, "current_value") ? { value: row.current_value } : {}),
      ...(Object.prototype.hasOwnProperty.call(row, "value_status") ? { value_status: row.value_status } : {}),
    })),
  ];
  return {
    kind: "record-set" as const,
    data: { schema: "am2_record_set_v1", fields: ["field", "value"], records: summaryRecords, sourceKind: input.kind },
    inputRefs,
    warnings: [],
    metrics: { count, fields: summaryRecords.length },
  };
}

