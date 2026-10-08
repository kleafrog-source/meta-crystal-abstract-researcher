type CrystalOperator =
  | string
  | {
      key?: unknown;
      symbol?: unknown;
      type?: unknown;
      formula?: unknown;
      description?: unknown;
    };

type CrystalSource = {
  code?: unknown;
  type?: unknown;
  category?: unknown;
  focus?: unknown;
  pattern?: unknown;
  combination?: unknown;
  llmMicroNote?: unknown;
  vectorDirection?: unknown;
  elements?: unknown;
  operators?: unknown;
  metrics?: unknown;
};

type CrystalDetailPayload = {
  crystal?: CrystalSource;
};

export function buildCrystalQueryText(source: CrystalSource | CrystalDetailPayload): string {
  const crystal = resolveCrystalSource(source);
  const elements = normalizeArray(crystal.elements).slice(0, 5).map(stringifyUnknown);
  const operators = normalizeOperators(crystal.operators).slice(0, 4);
  const metrics = normalizeMetrics(crystal.metrics).slice(0, 4);

  const lines = [
    crystal.code ? `Meta-crystal seed: ${normalizeText(crystal.code)}` : null,
    crystal.type ? `Type: ${normalizeText(crystal.type)}` : null,
    crystal.category ? `Category: ${normalizeText(crystal.category)}` : null,
    crystal.focus ? `Focus: ${normalizeText(crystal.focus)}` : null,
    crystal.pattern ? `Pattern: ${normalizeText(crystal.pattern)}` : null,
    crystal.vectorDirection ? `Vector: ${normalizeText(crystal.vectorDirection)}` : null,
    crystal.llmMicroNote ? `Semantic note: ${normalizeText(crystal.llmMicroNote)}` : null,
    crystal.combination ? `Combination: ${normalizeText(crystal.combination)}` : null,
    elements.length > 0 ? `Elements: ${elements.join(", ")}` : null,
    operators.length > 0 ? `Operators: ${operators.join(", ")}` : null,
    metrics.length > 0 ? `Metrics: ${metrics.join(", ")}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n").slice(0, 2600);
}

export function buildCrystalPreviewText(source: CrystalSource | CrystalDetailPayload): string {
  const text = buildCrystalQueryText(source);
  if (!text) {
    return "No semantic preview available.";
  }

  return text.split("\n").slice(0, 6).join("\n");
}

export function mergeQueryWithCrystal(existingQuery: string, crystalQuery: string): string {
  const normalizedExisting = existingQuery.trim();
  const normalizedCrystal = crystalQuery.trim();

  if (!normalizedExisting) {
    return normalizedCrystal;
  }
  if (!normalizedCrystal) {
    return normalizedExisting;
  }

  return `${normalizedExisting}\n\nMeta-crystal context:\n${normalizedCrystal}`;
}

function resolveCrystalSource(source: CrystalSource | CrystalDetailPayload): CrystalSource {
  const maybeDetail = source as CrystalDetailPayload;
  if (maybeDetail.crystal && typeof maybeDetail.crystal === "object") {
    return maybeDetail.crystal;
  }
  return source as CrystalSource;
}

function normalizeText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, nested]) => `${normalizeText(key)}=${normalizeText(nested)}`)
      .filter(Boolean)
      .join(", ");
  }

  return String(value)
    .replace(/\s+/g, " ")
    .replace(/[{}[\]]/g, " ")
    .trim();
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringifyUnknown(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return normalizeText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 3)
      .map(([key, nested]) => `${normalizeText(key)}=${normalizeText(nested)}`)
      .filter(Boolean);
    return entries.join(", ");
  }
  return normalizeText(value);
}

function normalizeOperators(value: unknown): string[] {
  return normalizeArray(value)
    .map((item) => {
      if (typeof item === "string") {
        return normalizeText(item);
      }

      if (!item || typeof item !== "object") {
        return "";
      }

      const operator = item as Record<string, unknown>;
      return [
        operator.symbol ? normalizeText(operator.symbol) : null,
        operator.key ? normalizeText(operator.key) : null,
        operator.type ? normalizeText(operator.type) : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ");
    })
    .filter(Boolean);
}

function normalizeMetrics(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, nested]) => `${normalizeText(key)}=${normalizeText(nested)}`)
    .filter(Boolean);
}
