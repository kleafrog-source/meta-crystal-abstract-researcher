import { NextResponse } from "next/server";

import {
  CombinatorialGenerator,
  GenesisAtomicToken,
  TokenDecomposer,
  mergeAtomicTokens,
} from "@/lib/combinatorial-genesis/core";
import {
  rankRuntimeAtoms,
  type RuntimeParameterRecord,
} from "@/lib/combinatorial-genesis/runtime-index";
import {
  buildEligibleDonorMap,
  createDonorPolicy,
  readDonorRestrictions,
  resolveDonorReferences,
} from "@/lib/combinatorial-genesis/donor-policy";
import { inferCandidateValues } from "@/lib/combinatorial-genesis/value-inference";
import { normalizedCosine } from "@/lib/combinatorial-genesis/similarity";
import { readGenesisLibrary } from "@/lib/combinatorial-genesis/library";
import { embedText, embedTexts, getOllamaModel } from "@/lib/ollama-client";

export const dynamic = "force-dynamic";

interface PreviewRequest {
  macro?: string;
  query?: string;
  seed?: number;
  limit?: number;
}

const CONNECTOR_ATOMS = new Set(["and", "for", "in", "of", "on", "or", "out", "over", "per", "the", "to", "with"]);

function runtimeRole(role: string): GenesisAtomicToken["roles"] {
  if (role === "property") return ["property"];
  if (role === "unit") return ["unit"];
  return ["descriptor", "concept"];
}

function parseMacroNames(macro: string): string[] {
  const names = macro
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*`]\s*/, ""))
    .map((line) => line.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*(?::|=|$)/)?.[1] ?? "")
    .filter(Boolean)
    .map((name) => name.toLowerCase());
  return Array.from(new Set(names));
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())));
}

function inferredMetadata(
  technicalName: string,
  parentNames: string[],
  parameters: Map<string, RuntimeParameterRecord>,
) {
  const tokens = technicalName.split("_");
  const parents = parentNames.flatMap((name) => parameters.get(name) ? [parameters.get(name)!] : []);
  const tags = uniqueStrings(parents.flatMap((parameter) => parameter.lyria_prompt_tags ?? []));
  const keywords = uniqueStrings(parents.flatMap((parameter) => parameter.semantic_keywords ?? []));
  const parentLabel = parentNames.slice(0, 3).map((name) => name.replaceAll("_", " ")).join(", ");
  const paddedTags = uniqueStrings([...tags, tokens.slice(0, 3).join(" "), tokens.slice(-3).join(" "), technicalName.replaceAll("_", " ")]).slice(0, 3);
  const paddedKeywords = uniqueStrings([
    ...keywords,
    "комбинированное управление",
    "семантическая комбинация параметров",
    "синтез управляющего параметра",
    ...tokens,
  ]).slice(0, 7);
  return {
    name_ru: technicalName.replaceAll("_", " "),
    description_en: `Controls ${parentLabel || technicalName.replaceAll("_", " ")}.`,
    description_ru: `Управляет параметром ${parentLabel || technicalName.replaceAll("_", " ")}.`,
    category: String(parents.find((parameter) => parameter.category)?.category ?? "Combinatorial Genesis"),
    sub_category: String(parents.find((parameter) => parameter.sub_category)?.sub_category ?? tokens.slice(0, 2).join("_")),
    lyria_prompt_tags: paddedTags,
    semantic_keywords: paddedKeywords,
    review_status: "needs_review" as const,
  };
}

export async function POST(request: Request) {
  let body: PreviewRequest;
  try {
    body = (await request.json()) as PreviewRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestedNames = parseMacroNames(typeof body.macro === "string" ? body.macro : "");
  if (requestedNames.length < 3) {
    return NextResponse.json(
      { error: "Provide at least three parameter names, one per line or as name: value." },
      { status: 400 },
    );
  }

  const query = typeof body.query === "string" && body.query.trim()
    ? body.query.trim()
    : requestedNames.join(" ").replaceAll("_", " ");
  const limit = Math.max(1, Math.min(50, typeof body.limit === "number" ? Math.trunc(body.limit) : 30));

  try {
    const dataset = await readGenesisLibrary();
    const datasetMap = new Map(dataset.map((parameter) => [parameter.technical_name, parameter]));
    const sourceParameters = requestedNames.map(
      (technicalName) => datasetMap.get(technicalName) ?? { technical_name: technicalName },
    );
    const queryEmbedding = await embedText(query);
    const ranked = await rankRuntimeAtoms(queryEmbedding, 180);
    if (ranked.model !== getOllamaModel()) {
      throw new Error(
        `Runtime index model ${ranked.model} differs from active Ollama model ${getOllamaModel()}. Rebuild the runtime index.`,
      );
    }
    const restrictions = await readDonorRestrictions();
    const liveParameters: RuntimeParameterRecord[] = dataset.map((parameter) => ({
      ...parameter,
      default: Array.isArray(parameter.default) ? undefined : parameter.default,
    }));
    const donorPolicy = createDonorPolicy(liveParameters, [], {
      ...restrictions,
    });
    const eligibleParameterMap = buildEligibleDonorMap(donorPolicy);
    const localTokensRaw = new TokenDecomposer().decompose(sourceParameters);
    const localSourceResolution = resolveDonorReferences(requestedNames, donorPolicy);
    const localSourceSet = new Set(localSourceResolution.acceptedNames);
    const localTokens = localTokensRaw.map((token) => ({
      ...token,
      source_parameters: token.source_parameters.filter((name) => localSourceSet.has(name)),
      semantic_score: 1,
    }));
    const usableAtoms = ranked.atoms.filter(
      (atom) => atom.role !== "unit" && !CONNECTOR_ATOMS.has(atom.atom),
    );
    const runtimeReferences = ranked.atoms.flatMap((atom) => atom.source_parameters);
    const runtimeSourceResolution = resolveDonorReferences(runtimeReferences, donorPolicy);
    const runtimeSourceSet = new Set(runtimeSourceResolution.acceptedNames);
    const datasetTokens: GenesisAtomicToken[] = usableAtoms.map((atom) => ({
      token: atom.atom,
      frequency: 1,
      roles: runtimeRole(atom.role),
      source_parameters: atom.source_parameters.filter((name) => runtimeSourceSet.has(name)),
      semantic_score: Number(atom.similarity.toFixed(6)),
    }));
    const tokens = mergeAtomicTokens(localTokens, datasetTokens);
    const existingNames = new Set([
      ...dataset.map((parameter) => parameter.technical_name),
      ...restrictions.tombstoneNames,
      ...restrictions.excludedNames,
    ]);
    const generated = new CombinatorialGenerator().generate(tokens, existingNames, {
      seed: typeof body.seed === "number" ? body.seed : 0,
      max_candidates: Math.min(300, limit * 6),
    });
    const candidateEmbeddings = generated.length
      ? await embedTexts(generated.map((candidate) => candidate.technical_name.replaceAll("_", " ")))
      : [];
    const candidateEmbeddingByName = new Map(
      generated.map((candidate, index) => [candidate.technical_name, candidateEmbeddings[index]]),
    );
    const rankedCandidates = generated
      .map((candidate, index) => ({
        ...candidate,
        query_similarity: Number(normalizedCosine(queryEmbedding, candidateEmbeddings[index]).toFixed(6)),
      }))
      .sort(
        (left, right) =>
          right.query_similarity - left.query_similarity ||
          right.structural_score - left.structural_score ||
          left.technical_name.localeCompare(right.technical_name),
      )
      .slice(0, Math.min(generated.length, limit * 4));
    const referencedDonorNames = Array.from(new Set(rankedCandidates.flatMap((candidate) => {
      const propertyEntry = [...candidate.token_provenance].reverse().find((entry) => entry.role === "property");
      return [...(propertyEntry?.source_parameters ?? []), ...candidate.parent_parameters];
    })));
    const donorNames = resolveDonorReferences(referencedDonorNames, donorPolicy).acceptedNames;
    const donorEmbeddings = donorNames.length
      ? await embedTexts(donorNames.map((name) => name.replaceAll("_", " ")))
      : [];
    const donorEmbeddingByName = new Map(
      donorNames.map((name, index) => [name, donorEmbeddings[index]]),
    );
    const inferredCandidates = rankedCandidates.map((candidate) => ({
      ...candidate,
      value_inference: inferCandidateValues(
        candidate,
        donorPolicy,
        new Map(donorNames.flatMap((name) => {
          const candidateEmbedding = candidateEmbeddingByName.get(candidate.technical_name);
          const donorEmbedding = donorEmbeddingByName.get(name);
          return candidateEmbedding && donorEmbedding
            ? [[name, normalizedCosine(candidateEmbedding, donorEmbedding)] as const]
            : [];
        })),
      ),
      metadata: inferredMetadata(candidate.technical_name, candidate.parent_parameters, eligibleParameterMap),
    }));
    const candidates = inferredCandidates
      .map((candidate) => ({
        ...candidate,
        selection_score: Number((
          candidate.query_similarity +
          (candidate.value_inference.status === "auto_resolved" ? 0.08 : 0) +
          candidate.value_inference.confidence * 0.03
        ).toFixed(6)),
      }))
      .sort(
        (left, right) =>
          right.selection_score - left.selection_score ||
          right.query_similarity - left.query_similarity ||
          left.technical_name.localeCompare(right.technical_name),
      )
      .slice(0, limit);

    const allSourceReferences = [...requestedNames, ...runtimeReferences];
    const allSourceResolution = resolveDonorReferences(allSourceReferences, donorPolicy);
    const persistedRuntimeDiagnostics = ranked.atoms.flatMap((atom) => atom.source_reference_diagnostics ?? []);
    const sourceDiagnostics = Array.from(new Map(
      [...allSourceResolution.diagnostics, ...persistedRuntimeDiagnostics.map((item) => ({
        ...item,
        reason: item.reason as (typeof allSourceResolution.diagnostics)[number]["reason"],
      }))].map((item) => [`${item.technical_name}\u0000${item.reason}`, item]),
    ).values());
    const sourceReasonCounts = sourceDiagnostics.reduce<Record<string, number>>((counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + 1;
      return counts;
    }, {});
    return NextResponse.json({
        mode: "LIVE_CATALOGUE_PREVIEW",
      writes_performed: false,
      dataset_version: ranked.versionId,
      embedding_model: ranked.model,
      query,
      source_count: requestedNames.length,
      known_source_count: requestedNames.filter((name) => datasetMap.has(name)).length,
      source_diagnostics: {
        unique_source_count: new Set(allSourceReferences).size,
        eligible_donor_count: allSourceResolution.acceptedNames.length,
        rejected_source_count: sourceDiagnostics.length,
        reason_counts: sourceReasonCounts,
        rejected_sources: sourceDiagnostics,
      },
      token_count: tokens.length,
      tokens: tokens.slice(0, 100),
      ranked_atoms: usableAtoms.slice(0, 40),
      generated_before_bge_rerank: generated.length,
      auto_resolved_value_count: candidates.filter(
        (candidate) => candidate.value_inference.status === "auto_resolved",
      ).length,
      candidates,
      validation: {
        bge_m3_applied: true,
        live_catalogue_only: true,
        values_extrapolated: candidates.some(
          (candidate) => candidate.value_inference.status === "auto_resolved",
        ),
        publishable: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        hint: "Run python python_engine/build-combinatorial-runtime-index.py and ensure Ollama is available.",
      },
      { status: 503 },
    );
  }
}
