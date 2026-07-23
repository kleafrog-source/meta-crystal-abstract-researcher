import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/llm/factory";
import { buildRAGContext } from "@/lib/rag";
import { db } from "@/lib/db";
import type { PipelineStep } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a pipeline builder for Meta Crystal v7.2.
Return only valid JSON without markdown.

Schema:
{
  "name": "short_name",
  "description": "goal",
  "mode": "standard|manifestation",
  "profile": {
    "params": {},
    "flags": {},
    "metrics": {
      "enabled": true,
      "influencing": [],
      "observational": []
    },
    "disabled_patterns": []
  },
  "steps": [
    {
      "name": "step name",
      "action": "generate|filter|catalog|save|evolve|transform|manifest_micro_notes|manifest_manifest|manifest_palette_query|manifest_diffuse|manifest_embeddings_index|manifest_isomorphisms_scan",
      "params": {}
    }
  ]
}

Rules:
- Always return at least 3 steps when the task is non-trivial.
- Prefer executable params over prose.
- The profile must preserve generation constraints: active domain flags, metric roles, and disabled patterns.
- If the user asks for manifestation / проявление / pallette / micro-notes / diffusion synthesis, prefer a manifestation pipeline and use only manifestation actions.
- "generate" params: { "batch": number, "top": number, "generations": number, "focus"?: string, "disabled_patterns"?: string[], "flags"?: object, "metrics"?: object }
- "filter" params: { "min_v"?: number, "min_s"?: number, "target"?: number }
- "catalog" params: {}
- "save" params: {}
- "evolve" params: { "generations": number, "batch": number, "top": number, "disabled_patterns"?: string[], "flags"?: object, "metrics"?: object }
- "transform" params: { "operators": string[] }
- "manifest_micro_notes" params: { "crystal_ids": string[], "temperature"?: number }
- "manifest_manifest" params: { "crystal_ids": string[], "temperature"?: number, "include_isomorphs"?: boolean }
- "manifest_palette_query" params: { "q"?: string, "vector"?: string, "semantic_query"?: string, "has_micro_note"?: boolean, "has_vector"?: boolean, "limit"?: number }
- "manifest_diffuse" params: { "donor_ids": string[], "temperature"?: number, "guidance"?: number, "superposition_size"?: number, "collapse_mode"?: "best"|"diverse"|"manual", "include_isomorphic_donors"?: boolean }
- "manifest_embeddings_index" params: { "crystal_ids"?: string[], "force_reindex"?: boolean }
- "manifest_isomorphisms_scan" params: { "crystal_ids"?: string[], "threshold"?: number }
- Do not explain the pipeline outside JSON.
- Make the pipeline directly executable by backend routes.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const description = body.description?.trim();
    if (!description) {
      return NextResponse.json({ ok: false, error: "description is required" }, { status: 400 });
    }

    const { provider, settings } = await getActiveProvider();
    let ragContextText = "";
    let ragResults: any[] = [];

    if (body.useRAG !== false) {
      try {
        const rag = await buildRAGContext(description);
        ragContextText = rag.contextText;
        ragResults = rag.results;
      } catch {}
    }

    const profileContext = body.profile ? JSON.stringify(body.profile) : "";
    const result = await provider.chat(
      [{ role: "user", content: `Build an executable pipeline for this task:\n${description}${profileContext ? `\n\nCurrent generation profile constraints:\n${profileContext}` : ""}` }],
      {
        model: settings.chatModel,
        temperature: 0.2,
        topP: 0.85,
        maxTokens: 1800,
        system: SYSTEM_PROMPT,
        ragContext: ragContextText || undefined,
      },
    );

    const raw = result.text;
    const parsed = extractJsonObject(raw);
    const pipeline = normalizePipeline(parsed, description, body.profile);

    if (body.saveToDb === true) {
      const uniqueName = await makeUniquePipelineName(pipeline.name);
      const created = await db.pipeline.create({
        data: {
          name: uniqueName,
          description: pipeline.description ?? description,
          stepsJson: JSON.stringify({
            steps: pipeline.steps,
            profile: pipeline.profile,
          }),
        },
      });
      return NextResponse.json({
        ok: true,
        pipeline: { ...pipeline, id: created.id, name: uniqueName },
        raw,
        ragResults,
        provider: result.provider,
        model: result.model,
        savedToDb: true,
      });
    }

    return NextResponse.json({
      ok: true,
      pipeline,
      raw,
      ragResults,
      provider: result.provider,
      model: result.model,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

function extractJsonObject(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {}

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function normalizePipeline(
  pipeline: any,
  description: string,
  sourceProfile?: any,
): { name: string; description: string; profile: Record<string, unknown>; steps: PipelineStep[] } {
  const fallback: { name: string; description: string; profile: Record<string, unknown>; steps: PipelineStep[] } = {
    name: "Generated Pipeline",
    description,
    profile: normalizeProfile(sourceProfile),
    steps: [
      { name: "Generate", action: "generate", params: { batch: 50, top: 3, generations: 1 } },
      { name: "Filter", action: "filter", params: { min_v: 0.6, min_s: 0.5, target: 10 } },
      { name: "Save", action: "save", params: {} },
    ],
  };

  if (!pipeline || typeof pipeline !== "object") return fallback;
  const rawSteps = Array.isArray(pipeline.steps) ? pipeline.steps : [];
  const steps = rawSteps
    .map(normalizeStep)
    .filter((step): step is PipelineStep => Boolean(step));

  return {
    name: typeof pipeline.name === "string" && pipeline.name.trim() ? pipeline.name.trim() : fallback.name,
    description:
      typeof pipeline.description === "string" && pipeline.description.trim()
        ? pipeline.description.trim()
        : description,
    profile: normalizeProfile(pipeline.profile ?? sourceProfile),
    steps: steps.length ? steps : fallback.steps,
  };
}

function normalizeStep(step: any): PipelineStep | null {
  if (!step || typeof step !== "object") return null;
  const action = normalizeAction(step.action);
  if (!action) return null;

  return {
    name: typeof step.name === "string" && step.name.trim() ? step.name.trim() : action,
    action,
    params: normalizeParams(action, step.params),
  };
}

function normalizeAction(action: unknown): PipelineStep["action"] | null {
  if (typeof action !== "string") return null;
  const normalized = action.trim().toLowerCase();
  if ([
    "generate",
    "filter",
    "catalog",
    "save",
    "evolve",
    "transform",
    "manifest_micro_notes",
    "manifest_manifest",
    "manifest_palette_query",
    "manifest_diffuse",
    "manifest_embeddings_index",
    "manifest_isomorphisms_scan",
  ].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeParams(action: string, params: unknown) {
  const source = params && typeof params === "object" ? (params as Record<string, unknown>) : {};

  switch (action) {
    case "generate":
      return {
        batch: toInt(source.batch, 50),
        top: toInt(source.top, 3),
        generations: toInt(source.generations, 1),
        ...(typeof source.focus === "string" && source.focus.trim() ? { focus: source.focus.trim() } : {}),
        ...(Array.isArray(source.disabled_patterns) ? { disabled_patterns: source.disabled_patterns.map(String) } : {}),
        ...(source.flags && typeof source.flags === "object" ? { flags: source.flags } : {}),
        ...(source.metrics && typeof source.metrics === "object" ? { metrics: source.metrics } : {}),
      };
    case "filter":
      return {
        ...(source.min_v != null ? { min_v: toFloat(source.min_v, 0.6) } : {}),
        ...(source.min_s != null ? { min_s: toFloat(source.min_s, 0.5) } : {}),
        ...(source.target != null ? { target: toInt(source.target, 10) } : {}),
      };
    case "evolve":
      return {
        generations: toInt(source.generations, 1),
        batch: toInt(source.batch, 50),
        top: toInt(source.top, 3),
        ...(Array.isArray(source.disabled_patterns) ? { disabled_patterns: source.disabled_patterns.map(String) } : {}),
        ...(source.flags && typeof source.flags === "object" ? { flags: source.flags } : {}),
        ...(source.metrics && typeof source.metrics === "object" ? { metrics: source.metrics } : {}),
      };
    case "transform":
      return {
        operators: Array.isArray(source.operators)
          ? source.operators.map(String).filter(Boolean)
          : [],
      };
    case "catalog":
    case "save":
    case "manifest_micro_notes":
      return {
        crystal_ids: Array.isArray(source.crystal_ids) ? source.crystal_ids.map(String).filter(Boolean) : [],
        ...(source.temperature != null ? { temperature: toFloat(source.temperature, 0.75) } : {}),
      };
    case "manifest_manifest":
      return {
        crystal_ids: Array.isArray(source.crystal_ids) ? source.crystal_ids.map(String).filter(Boolean) : [],
        ...(source.temperature != null ? { temperature: toFloat(source.temperature, 0.45) } : {}),
        ...(source.include_isomorphs != null ? { include_isomorphs: Boolean(source.include_isomorphs) } : {}),
      };
    case "manifest_palette_query":
      return {
        ...(typeof source.q === "string" && source.q.trim() ? { q: source.q.trim() } : {}),
        ...(typeof source.vector === "string" && source.vector.trim() ? { vector: source.vector.trim() } : {}),
        ...(typeof source.semantic_query === "string" && source.semantic_query.trim()
          ? { semantic_query: source.semantic_query.trim() }
          : {}),
        ...(source.has_micro_note != null ? { has_micro_note: Boolean(source.has_micro_note) } : {}),
        ...(source.has_vector != null ? { has_vector: Boolean(source.has_vector) } : {}),
        ...(source.limit != null ? { limit: toInt(source.limit, 50) } : {}),
      };
    case "manifest_diffuse":
      return {
        donor_ids: Array.isArray(source.donor_ids) ? source.donor_ids.map(String).filter(Boolean) : [],
        ...(source.temperature != null ? { temperature: toFloat(source.temperature, 0.6) } : {}),
        ...(source.guidance != null ? { guidance: toFloat(source.guidance, 0.6) } : {}),
        ...(source.superposition_size != null ? { superposition_size: toInt(source.superposition_size, 1) } : {}),
        ...(typeof source.collapse_mode === "string" ? { collapse_mode: source.collapse_mode } : {}),
        ...(source.include_isomorphic_donors != null
          ? { include_isomorphic_donors: Boolean(source.include_isomorphic_donors) }
          : {}),
      };
    case "manifest_embeddings_index":
      return {
        ...(Array.isArray(source.crystal_ids) ? { crystal_ids: source.crystal_ids.map(String).filter(Boolean) } : {}),
        ...(source.force_reindex != null ? { force_reindex: Boolean(source.force_reindex) } : {}),
      };
    case "manifest_isomorphisms_scan":
      return {
        ...(Array.isArray(source.crystal_ids) ? { crystal_ids: source.crystal_ids.map(String).filter(Boolean) } : {}),
        ...(source.threshold != null ? { threshold: toFloat(source.threshold, 0.8) } : {}),
      };
    default:
      return {};
  }
}

function normalizeProfile(profile: any) {
  const source = profile && typeof profile === "object" ? profile : {};
  const metrics = source.metrics && typeof source.metrics === "object" ? source.metrics as Record<string, unknown> : {};
  return {
    params: source.params && typeof source.params === "object" ? source.params : {},
    flags: source.flags && typeof source.flags === "object" ? source.flags : {},
    metrics: {
      enabled: metrics.enabled !== false,
      influencing: Array.isArray(metrics.influencing) ? metrics.influencing.map(String) : [],
      observational: Array.isArray(metrics.observational) ? metrics.observational.map(String) : [],
    },
    disabled_patterns: Array.isArray(source.disabled_patterns)
      ? source.disabled_patterns.map(String)
      : Array.isArray(source.disabledPatterns)
        ? source.disabledPatterns.map(String)
        : [],
  };
}

function toInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value: unknown, fallback: number) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function makeUniquePipelineName(baseName: string) {
  const trimmed = baseName.trim() || "Generated Pipeline";
  let candidate = trimmed;
  let index = 2;

  while (await db.pipeline.findUnique({ where: { name: candidate } })) {
    candidate = `${trimmed} ${index}`;
    index += 1;
  }

  return candidate;
}
