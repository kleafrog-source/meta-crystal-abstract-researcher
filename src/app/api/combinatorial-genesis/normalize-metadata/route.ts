import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";
import { getActiveProvider } from "@/lib/llm/factory";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DATA_ROOT = path.join(process.cwd(), "data", "combinatorial-genesis");
interface CandidateInput {
  technical_name?: unknown;
  parent_parameters?: unknown;
  value_inference?: unknown;
  metadata?: unknown;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return JSON.parse(fenced);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("Chat model did not return valid JSON.");
}

function extractCandidateItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  for (const key of ["candidates", "results", "parameters", "items"]) {
    if (Array.isArray(record[key])) return record[key];
  }
  if (typeof record.technical_name === "string" || typeof record.name_ru === "string" || typeof record.description_en === "string") return [record];
  if (record.result && typeof record.result === "object") return extractCandidateItems(record.result);
  const objectValues = Object.values(record).filter((value) => value && typeof value === "object" && !Array.isArray(value));
  if (objectValues.length > 0 && objectValues.every((value) => typeof (value as Record<string, unknown>).technical_name === "string")) {
    return objectValues;
  }
  return [];
}

function compactDonor(parameter: Record<string, unknown>) {
  return {
    technical_name: parameter.technical_name,
    name_ru: parameter.name_ru,
    description_en: parameter.description_en,
    description_ru: parameter.description_ru,
    category: parameter.category,
    sub_category: parameter.sub_category,
    ui_element: parameter.ui_element,
    unit: parameter.unit,
    quantity_kind: parameter.quantity_kind,
    min_value: parameter.min_value,
    max_value: parameter.max_value,
    step: parameter.step,
    default: parameter.default,
    lyria_prompt_tags: parameter.lyria_prompt_tags,
    semantic_keywords: parameter.semantic_keywords,
  };
}

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("! "), shortened.lastIndexOf("? "));
  if (sentenceEnd >= Math.floor(maxLength * 0.55)) return shortened.slice(0, sentenceEnd + 1).trim();
  const wordEnd = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, wordEnd > 0 ? wordEnd : maxLength).trim().replace(/[,:;\-]+$/, "")}.`;
}

function validateResult(item: unknown, expectedName: string) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${expectedName}: result must be an object.`);
  const value = item as Record<string, unknown>;
  const nameRu = typeof value.name_ru === "string" ? clampText(value.name_ru.trim(), 120) : "";
  const descriptionEn = typeof value.description_en === "string" ? clampText(value.description_en.trim(), 360) : "";
  const descriptionRu = typeof value.description_ru === "string" ? clampText(value.description_ru.trim(), 420) : "";
  if (!nameRu || !descriptionEn || !descriptionRu) throw new Error(`${expectedName}: normalized descriptions are incomplete.`);
  return {
    technical_name: expectedName,
    name_ru: nameRu,
    description_en: descriptionEn,
    description_ru: descriptionRu,
    recommended: value.recommended === true,
    selection_reason: typeof value.selection_reason === "string" ? value.selection_reason.trim().slice(0, 300) : "",
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { candidates?: unknown };
    const candidates = Array.isArray(body.candidates) ? body.candidates as CandidateInput[] : [];
    if (candidates.length < 1 || candidates.length > 3) {
      return NextResponse.json({ error: "Provide between 1 and 3 candidates per normalization batch." }, { status: 400 });
    }

    const latest = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", "latest.json"), "utf8")) as { version_id: string };
    const frozen = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "datasets", latest.version_id, "parameters.json"), "utf8")) as Array<Record<string, unknown>>;
    const library = await readGenesisLibrary() as Array<Record<string, unknown>>;
    const byName = new Map([...library, ...frozen].map((parameter) => [String(parameter.technical_name), parameter]));
    const context = candidates.map((candidate) => {
      const technicalName = typeof candidate.technical_name === "string" ? candidate.technical_name : "";
      const parentNames = Array.isArray(candidate.parent_parameters) ? candidate.parent_parameters.map(String).slice(0, 6) : [];
      return {
        technical_name: technicalName,
        read_only: {
          category: (candidate.metadata as Record<string, unknown> | undefined)?.category,
          sub_category: (candidate.metadata as Record<string, unknown> | undefined)?.sub_category,
          ...(candidate.value_inference as Record<string, unknown> | undefined),
          lyria_prompt_tags: (candidate.metadata as Record<string, unknown> | undefined)?.lyria_prompt_tags,
          semantic_keywords: (candidate.metadata as Record<string, unknown> | undefined)?.semantic_keywords,
        },
        current_editable: {
          name_ru: (candidate.metadata as Record<string, unknown> | undefined)?.name_ru,
          description_en: (candidate.metadata as Record<string, unknown> | undefined)?.description_en,
          description_ru: (candidate.metadata as Record<string, unknown> | undefined)?.description_ru,
        },
        donors: parentNames.flatMap((name) => byName.get(name) ? [compactDonor(byName.get(name)!)] : []),
      };
    });
    if (context.some((candidate) => !candidate.technical_name)) {
      return NextResponse.json({ error: "Every candidate requires technical_name." }, { status: 400 });
    }

    const { provider, settings } = await getActiveProvider();
    const system = `You normalize metadata for machine-readable audio-control parameters. Return JSON only with shape {"candidates":[{"technical_name":"...","name_ru":"...","description_en":"...","description_ru":"...","recommended":true,"selection_reason":"..."}]}.

Read all read_only fields and full source records, but NEVER alter or reinterpret their stored values. You may write only name_ru, description_en, description_ru, recommended, and selection_reason. Preserve each technical_name exactly.

name_ru: concise natural Russian translation/interpretation of technical_name.
description_en: 1–2 short sentences, maximum 320 characters. State the actual audio behavior directly. For Range describe lower and higher values; for Select explain mode differences; for Toggle explain off/on; for text-like controls explain interpretation.
description_ru: faithful concise Russian equivalent, maximum 380 characters, with the same behavioral information.
Use source descriptions as evidence but write as if the candidate were an established native audio control. Avoid process-oriented boilerplate.
recommended is true only if the candidate is coherent, source evidence supports its meaning, and the supplied read-only control schema is usable without changes. selection_reason is one short Russian sentence.`;
    let correction = "";
    let normalized: ReturnType<typeof validateResult>[] | null = null;
    const collected = new Map<string, ReturnType<typeof validateResult>>();
    let lastError: unknown = null;
    let resultModel = settings.chatModel;
    let resultProvider = provider.id;
    const maxAttempts = context.length + 2;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const requestContext = context.filter((candidate) => !collected.has(candidate.technical_name));
      const result = await provider.chat(
        [{ role: "user", content: `${JSON.stringify({ candidates: requestContext }, null, 2)}${correction}` }],
        {
        model: settings.chatModel,
        temperature: 0.15,
        topP: 0.85,
        maxTokens: Math.max(900, Math.min(2200, settings.maxTokens * 2)),
          keepAlive: "15m",
          signal: request.signal,
          system,
        },
      );
      resultModel = result.model;
      resultProvider = result.provider;
      try {
        const parsed = extractJson(result.text);
        const items = extractCandidateItems(parsed);
        if (items.length === 0) throw new Error(`Chat model returned 0 recognizable candidates.`);
        const expectedNames = new Set(context.map((candidate) => candidate.technical_name));
        for (const item of items) {
          const returnedName = String((item as Record<string, unknown>)?.technical_name ?? "");
          const name = expectedNames.has(returnedName) ? returnedName : requestContext.length === 1 ? requestContext[0]!.technical_name : "";
          if (name) collected.set(name, validateResult(item, name));
        }
        if (collected.size === context.length) {
          normalized = context.map((candidate) => collected.get(candidate.technical_name)!);
          break;
        }
        const missing = context.map((candidate) => candidate.technical_name).filter((name) => !collected.has(name));
        correction = `\n\nYour response was accepted only partially. Return a complete JSON response containing ONLY these missing technical_name values: ${missing.join(", ")}. Do not return already completed candidates.`;
      } catch (error) {
        lastError = error;
        correction = `\n\nCORRECTION: your previous response failed validation: ${error instanceof Error ? error.message : String(error)}. Return a new complete JSON response. Do not copy the placeholder draft; describe the sound control directly.`;
      }
    }

    // Small local models sometimes truncate a multi-candidate JSON object. Keep the
    // accepted batch results and retry only missing candidates with a smaller payload.
    for (const candidate of context.filter((item) => !collected.has(item.technical_name))) {
      let candidateError: unknown = lastError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await provider.chat(
            [{
              role: "user",
              content: `${JSON.stringify({ candidates: [candidate] }, null, 2)}\n\nReturn exactly one candidate in valid JSON. No Markdown and no commentary.`,
            }],
            {
              model: settings.chatModel,
              temperature: 0.1,
              topP: 0.8,
              maxTokens: Math.max(700, Math.min(1400, settings.maxTokens)),
              keepAlive: "15m",
              signal: request.signal,
              system,
            },
          );
          resultModel = result.model;
          resultProvider = result.provider;
          const item = extractCandidateItems(extractJson(result.text))[0];
          collected.set(candidate.technical_name, validateResult(item, candidate.technical_name));
          candidateError = null;
          break;
        } catch (error) {
          candidateError = error;
        }
      }
      if (candidateError) {
        throw new Error(`${candidate.technical_name}: chat normalization failed after retries: ${candidateError instanceof Error ? candidateError.message : String(candidateError)}`);
      }
    }

    normalized = context.map((candidate) => collected.get(candidate.technical_name)!);
    if (normalized.some((item) => !item)) throw new Error("Chat model normalization failed.");
    return NextResponse.json({ model: resultModel, provider: resultProvider, candidates: normalized });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
