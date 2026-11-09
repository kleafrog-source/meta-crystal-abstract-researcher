import { createHash } from "node:crypto";
import { getActiveProvider } from "@/lib/llm/factory";
import type { JournalReverseQuery } from "./types";

const schema = {
  type: "object", additionalProperties: true,
  properties: {
    query_en: { type: "string" },
    query_ru: { type: "string" },
    sound_description: { type: "string" },
    description: { type: "string" },
    text: { type: "string" },
    key_concepts: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
  },
};

export const REVERSE_QUERY_PROMPT_VERSION = "reverse-query-v3";
export const REVERSE_QUERY_NORMALIZER_VERSION = "reverse-query-normalizer-v1";
export type ReverseQueryRequestDiagnostics = {
  promptRouteVersion: string;
  provider: string;
  requestedModel: string;
  messageSha256: string;
  messageBytes: number;
  credentialsPersisted: false;
  actualModel?: string;
  /** Messages and safe generation settings only; provider credentials/headers are never included. */
  requestPayload?: { messages: Array<{ role: string; content: string }>; model: string; temperature: number; topP: number; maxTokens: number; format: "json_object" };
};

export interface ReverseQueryArtifact extends Partial<JournalReverseQuery> {
  text?: string;
  textSourceField?: string;
  missingFields: string[];
  fieldErrors: string[];
  warnings: string[];
  modelFields: Record<string, unknown>;
  normalizerVersion: string;
}

export class ReverseQueryProviderError extends Error {
  constructor(message: string, readonly diagnostics: ReverseQueryRequestDiagnostics, readonly upstreamStatus?: number, readonly retryAfterMs?: number) {
    super(message);
    this.name = "ReverseQueryProviderError";
  }
}

export class ReverseQueryOutputError extends Error {
  constructor(message: string, readonly category: "format" | "invalid", readonly rawResponse: string, public diagnostics?: ReverseQueryRequestDiagnostics) {
    super(message);
    this.name = "ReverseQueryOutputError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractModelText(value: unknown): { value: unknown; source: string } | null {
  if (!isObject(value)) return null;
  const choice = Array.isArray(value.choices) ? value.choices[0] : null;
  if (isObject(choice) && isObject(choice.message) && typeof choice.message.content === "string") return { value: choice.message.content, source: "choices[0].message.content" };
  if (typeof value.output_text === "string") return { value: value.output_text, source: "output_text" };
  if (typeof value.response === "string") return { value: value.response, source: "response" };
  if (typeof value.result === "string") return { value: value.result, source: "result" };
  const result = value.result;
  if (isObject(result) && ["query_en", "query_ru", "sound_description", "description", "text", "content"].some((key) => key in result)) return { value: result, source: "result" };
  return null;
}

function findJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  try { return JSON.parse(trimmed) as unknown; } catch { /* Try a balanced object embedded in surrounding prose. */ }
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      try { return JSON.parse(trimmed.slice(start, index + 1)) as unknown; } catch { return null; }
    }
  }
  return null;
}

function providerErrorText(text: string): boolean {
  return /<\s*!doctype|<\s*html|<\s*body|(?:unauthori[sz]ed|invalid (?:api )?key|authentication failed|quota exceeded|billing|model not found|unsupported request|invalid request|bad gateway|gateway timeout|internal server error)/iu.test(text);
}

function usefulString(value: unknown, field: string, errors: string[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") { errors.push(`${field}: expected text, received ${Array.isArray(value) ? "array" : typeof value}.`); return undefined; }
  const clean = value.trim();
  if (!clean) { errors.push(`${field}: text is empty.`); return undefined; }
  if (clean.length > 32_768) { errors.push(`${field}: text exceeds the 32,768 character safety limit.`); return undefined; }
  return clean;
}

function stringArray(value: unknown, field: string, maxItemLength: number, errors: string[]): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) { errors.push(`${field}: expected an array of text values.`); return undefined; }
  const result: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !item.trim()) { errors.push(`${field}[${index}]: expected non-empty text.`); continue; }
    const clean = item.trim();
    if (clean.length > maxItemLength) { errors.push(`${field}[${index}]: exceeds ${maxItemLength} characters.`); continue; }
    result.push(clean);
  }
  return result;
}

/**
 * Normalize model output as an inspectable partial artifact. Optional fields and provider-specific
 * text shapes are retained; this only rejects content that cannot serve as text at all.
 */
export function parseReverseQueryOutput(raw: string): { reverse_query: ReverseQueryArtifact; raw_response: string; extracted_model_text: string } {
  const trimmed = raw.trim();
  if (!trimmed) throw new ReverseQueryOutputError("Model response is empty; no Reverse Query text was received.", "format", raw);
  if (providerErrorText(trimmed)) throw new ReverseQueryOutputError("Provider/transport error content was returned instead of a Reverse Query.", "invalid", raw);

  let modelText = trimmed;
  let parsed = findJsonObject(modelText);
  if (isObject(parsed)) {
    const envelope = extractModelText(parsed);
    if (envelope) {
      if (typeof envelope.value === "string") {
        modelText = envelope.value;
        parsed = findJsonObject(modelText);
      } else if (isObject(envelope.value)) {
        parsed = envelope.value;
        modelText = JSON.stringify(envelope.value);
      } else {
        throw new ReverseQueryOutputError(`Transport envelope ${envelope.source} does not contain model text or a structured model result.`, "format", raw);
      }
    }
  }

  const fieldErrors: string[] = [];
  const warnings: string[] = [];
  let modelFields: Record<string, unknown> = {};
  let queryEn: string | undefined;
  let queryRu: string | undefined;
  let soundDescription: string | undefined;
  let description: string | undefined;
  let text: string | undefined;
  let concepts: string[] | undefined;
  let uncertainties: string[] | undefined;
  const structuredValue = isObject(parsed) ? parsed : null;
  const structured = Boolean(structuredValue);
  if (structuredValue) {
    modelFields = structuredValue;
    const nested = isObject(structuredValue.reverse_query) ? structuredValue.reverse_query : structuredValue;
    if (nested !== structuredValue) modelFields = nested;
    queryEn = usefulString(nested.query_en, "query_en", fieldErrors);
    queryRu = usefulString(nested.query_ru, "query_ru", fieldErrors);
    soundDescription = usefulString(nested.sound_description, "sound_description", fieldErrors);
    description = usefulString(nested.description, "description", fieldErrors);
    text = usefulString(nested.text ?? nested.query ?? nested.content ?? nested.natural_description, "text/query/content", fieldErrors);
    concepts = stringArray(nested.key_concepts, "key_concepts", 1000, fieldErrors);
    uncertainties = stringArray(nested.uncertainties, "uncertainties", 1000, fieldErrors);
    if (nested.error !== undefined && ![queryEn, queryRu, soundDescription, description, text].some(Boolean)) {
      throw new ReverseQueryOutputError(`Provider/model error field: ${String(nested.error).slice(0, 400)}`, "invalid", raw);
    }
  } else {
    if (typeof parsed === "string") modelText = parsed.trim();
    if (providerErrorText(modelText)) throw new ReverseQueryOutputError("Provider/transport error content was returned instead of a Reverse Query.", "invalid", raw);
    const unfenced = modelText.trim().replace(/^```(?:json)?\s*/iu, "").trim();
    if (/^\s*[{[]/u.test(unfenced)) throw new ReverseQueryOutputError("Model returned malformed or truncated JSON; no complete object could be extracted.", "format", raw);
    text = usefulString(modelText, "plain_text", fieldErrors);
  }

  const sourceText = queryEn ?? queryRu ?? soundDescription ?? description ?? text;
  const sourceField = queryEn ? "query_en" : queryRu ? "query_ru" : soundDescription ? "sound_description" : description ? "description" : text ? (structured ? "text" : "plain_text") : undefined;
  if (!sourceText || !/[\p{L}\p{N}]/u.test(sourceText)) {
    const detail = fieldErrors.length ? fieldErrors.join(" ") : "No non-empty sound_description, description, text, query_en, query_ru, or plain-text response was found.";
    throw new ReverseQueryOutputError(`No usable Reverse Query text: ${detail}`, "invalid", raw);
  }
  const missingFields = ["query_en", "query_ru", "key_concepts", "uncertainties"].filter((field) => {
    if (field === "query_en") return !queryEn;
    if (field === "query_ru") return !queryRu;
    if (field === "key_concepts") return concepts === undefined;
    return uncertainties === undefined;
  });
  if (sourceText.length < 8) warnings.push("Usable text is shorter than the former 8-character threshold; it was retained rather than rejected.");
  if (concepts && (concepts.length < 3 || concepts.length > 12)) warnings.push(`key_concepts contains ${concepts.length} values; the former 3–12 range is informational only.`);
  if (uncertainties && uncertainties.length > 8) warnings.push(`uncertainties contains ${uncertainties.length} values; no consumer requires a maximum of 8.`);
  const known = new Set(["query_en", "query_ru", "sound_description", "description", "text", "query", "content", "natural_description", "key_concepts", "uncertainties", "reverse_query"]);
  const extraKeys = Object.keys(modelFields).filter((key) => !known.has(key));
  if (extraKeys.length) warnings.push(`Additional model fields preserved: ${extraKeys.join(", ")}.`);
  return {
    reverse_query: {
      ...(queryEn ? { query_en: queryEn } : {}),
      ...(queryRu ? { query_ru: queryRu } : {}),
      ...(concepts !== undefined ? { key_concepts: concepts } : {}),
      ...(uncertainties !== undefined ? { uncertainties } : {}),
      text: sourceText,
      textSourceField: sourceField,
      missingFields,
      fieldErrors,
      warnings,
      modelFields,
      normalizerVersion: REVERSE_QUERY_NORMALIZER_VERSION,
    },
    raw_response: raw,
    extracted_model_text: modelText,
  };
}

function requireJournalFields(value: ReverseQueryArtifact): asserts value is ReverseQueryArtifact & JournalReverseQuery {
  const missing = [!value.query_en && "query_en", !value.query_ru && "query_ru", !value.key_concepts?.length && "key_concepts"].filter(Boolean);
  if (missing.length) throw new ReverseQueryOutputError(`Journal verification cannot run: missing ${missing.join(", ")}; the saved text remains available for text-only use.`, "invalid", JSON.stringify(value.modelFields));
}

export interface ReverseQueryInput {
  source_modality: "audio" | "image" | "transition" | "text";
  primary_original_request?: string | null;
  ranked_acoustic_evidence: Array<Record<string, unknown>>;
}

type ReverseQueryResult = {
  raw_response: string;
  extracted_model_text: string;
  provider: string;
  model: string;
  request_diagnostics: ReverseQueryRequestDiagnostics;
};

export async function generateReverseQuery(
  providerContext: Awaited<ReturnType<typeof getActiveProvider>>,
  input: ReverseQueryInput,
  signal?: AbortSignal,
): Promise<ReverseQueryResult & { reverse_query: JournalReverseQuery }>;
export async function generateReverseQuery(
  providerContext: Awaited<ReturnType<typeof getActiveProvider>>,
  input: ReverseQueryInput,
  signal: AbortSignal | undefined,
  options: { allowPartial: true },
): Promise<ReverseQueryResult & { reverse_query: ReverseQueryArtifact }>;
export async function generateReverseQuery(
  providerContext: Awaited<ReturnType<typeof getActiveProvider>>,
  input: ReverseQueryInput,
  signal?: AbortSignal,
  options: { allowPartial?: boolean } = {},
): Promise<ReverseQueryResult & { reverse_query: ReverseQueryArtifact | JournalReverseQuery }> {
  const { provider, settings } = providerContext;
  const modalityGoal = input.source_modality === "audio"
    ? "Reconstruct what the retained audio fragment sounds like: timbre, space, motion, rhythm, density, dynamics and spectral character."
    : input.source_modality === "image"
      ? "Translate the visual morphology into an imagined sound: shape, material, texture, color, spatial composition, motion and contrast become acoustic qualities."
      : input.source_modality === "transition"
        ? "Describe the audible intermediate state represented by this parameter configuration."
        : "Reconstruct a standalone sound-design request. Preserve the intent of primary_original_request while using the selected configuration as supporting evidence.";
  const system = [
    "You are a reverse sound-design interpreter. Your only task is to write a standalone request describing the sound that the supplied result represents.",
    modalityGoal,
    "Return a useful sound description. Prefer query_en when you can provide it; include query_ru only when you can provide a genuine Russian version, never a guessed translation. sound_description, description, or text are acceptable alternatives. key_concepts and uncertainties are optional and should only be included when supported by the evidence.",
    "Describe audible/structural qualities and their interactions. Do not explain the input, software, UI, parameters, controls, metadata, technical names, or the fact that a list was supplied.",
    "Do not begin with phrases such as 'a set of parameters', 'you are using', 'the parameters control', 'this image shows', or their translations.",
    "The evidence deliberately omits technical control names. Do not invent them. uncertainties must contain only genuine ambiguities about the inferred sound.",
    "For text modality, primary_original_request is the primary semantic evidence: produce a faithful compact reformulation, not a generic summary.",
    "Return one JSON object when possible. Extra fields and plain useful text are acceptable; do not fabricate missing languages or concepts.",
    `Suggested JSON shape (all fields optional): ${JSON.stringify(schema)}`,
  ].join("\n");
  const messages = [{ role: "user" as const, content: ["Create the reverse sound query now. Output a sound description, never a question about controls.", JSON.stringify(input)].join("\n") }];
  const chatOptions = { model: settings.chatModel, temperature: Math.min(settings.temperature, 0.1), topP: Math.min(settings.topP, 0.85), maxTokens: Math.max(1024, settings.maxTokens), keepAlive: "15m", signal, format: schema };
  const diagnosticsPayload = { system, messages, model: chatOptions.model, temperature: chatOptions.temperature, topP: chatOptions.topP, maxTokens: chatOptions.maxTokens, format: schema };
  const serializedDiagnostics = JSON.stringify(diagnosticsPayload);
  const diagnostics: ReverseQueryRequestDiagnostics = {
    promptRouteVersion: REVERSE_QUERY_PROMPT_VERSION,
    provider: provider.id,
    requestedModel: settings.chatModel,
    messageSha256: createHash("sha256").update(serializedDiagnostics).digest("hex"),
    messageBytes: Buffer.byteLength(serializedDiagnostics, "utf8"),
    credentialsPersisted: false,
    requestPayload: { messages: [{ role: "system", content: system }, ...messages], model: chatOptions.model, temperature: chatOptions.temperature, topP: chatOptions.topP, maxTokens: chatOptions.maxTokens, format: "json_object" },
  };
  let response: Awaited<ReturnType<typeof provider.chat>>;
  try {
    response = await provider.chat(messages, { ...chatOptions, signal, format: schema, system });
  } catch (error) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : undefined;
    const retryAfterMs = error && typeof error === "object" && typeof (error as { retryAfterMs?: unknown }).retryAfterMs === "number" ? (error as { retryAfterMs: number }).retryAfterMs : undefined;
    throw new ReverseQueryProviderError(error instanceof Error ? error.message : String(error), diagnostics, status, retryAfterMs);
  }
  diagnostics.actualModel = response.model;
  let parsed;
  try { parsed = parseReverseQueryOutput(response.text); }
  catch (error) { if (error instanceof ReverseQueryOutputError) error.diagnostics = diagnostics; throw error; }
  if (!options.allowPartial) {
    try { requireJournalFields(parsed.reverse_query); }
    catch (error) { if (error instanceof ReverseQueryOutputError) error.diagnostics = diagnostics; throw error; }
  }
  return {
    ...parsed,
    reverse_query: parsed.reverse_query as ReverseQueryArtifact | JournalReverseQuery,
    provider: response.provider,
    model: response.model,
    request_diagnostics: diagnostics,
  };
}
