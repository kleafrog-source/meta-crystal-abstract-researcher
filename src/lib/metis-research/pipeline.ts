import { randomUUID } from "node:crypto";
import { embedText } from "@/lib/metis/providers";
import type {
  LibraryCrystal,
  RetrievalResult,
  RetrievalRun,
  RunConfig,
  RunMetrics,
  ScoreDecomposition,
  TraceStage,
} from "@/lib/metis-research/types";

function l2Norm(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
  }
  const na = l2Norm(a);
  const nb = l2Norm(b);
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (na * nb);
}

function deriveReasonCodes(rawScore: number, importance: number, finalScore: number) {
  const codes: string[] = [];
  if (rawScore > 0.72) codes.push("high_embedding_similarity");
  if (importance > 0.7) codes.push("high_importance");
  if (rawScore > 0.5 && importance > 0.5) codes.push("strong_combined_signal");
  if (finalScore > 0.5) codes.push("above_baseline");
  if (rawScore < 0.25) codes.push("low_embedding_similarity");
  return codes;
}

function emptyMetrics(): RunMetrics {
  return {
    meanFinalScore: 0,
    minFinalScore: 0,
    maxFinalScore: 0,
    scoreGapAtK: 0,
    typeDiversity: 0,
    focusDiversity: 0,
    domainCoverage: 0,
    runtimeMs: 0,
    memoryUsageMB: null,
  };
}

function computeRunMetrics(results: RetrievalResult[], runtimeMs: number): RunMetrics {
  if (!results.length) {
    return { ...emptyMetrics(), runtimeMs };
  }
  const scores = results.map((item) => item.score.finalScore);
  const types = new Set(results.map((item) => item.crystal.type));
  const foci = new Set(results.map((item) => item.crystal.focus));
  const domains = new Set(results.map((item) => item.crystal.domain));
  return {
    meanFinalScore: scores.reduce((sum, value) => sum + value, 0) / scores.length,
    minFinalScore: Math.min(...scores),
    maxFinalScore: Math.max(...scores),
    scoreGapAtK: scores.length > 1 ? scores[0] - scores[scores.length - 1] : scores[0],
    typeDiversity: types.size / results.length,
    focusDiversity: foci.size / results.length,
    domainCoverage: domains.size / Math.max(1, domains.size),
    runtimeMs,
    memoryUsageMB: null,
  };
}

export async function runRetrieval(args: {
  query: string;
  config: RunConfig;
  corpus: LibraryCrystal[];
  corpusEmbeddings: Map<string, number[]>;
  previousRuns?: RetrievalRun[];
}): Promise<RetrievalRun> {
  const runId = `run_${randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();
  const stages: TraceStage[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const rawQuery = args.query;
  stages.push({
    name: "query_input",
    durationMs: 0,
    inputCount: 0,
    outputCount: 1,
    status: "success",
    metadata: { rawLength: rawQuery.length },
  });

  const preparedQuery = rawQuery.trim().toLowerCase();
  if (!preparedQuery) {
    errors.push("Empty query after preparation");
    stages.push({
      name: "query_preparation",
      durationMs: 0,
      inputCount: 1,
      outputCount: 0,
      status: "error",
      metadata: { reason: "empty_query" },
    });
    return {
      runId,
      query: rawQuery,
      startedAt,
      finishedAt: Date.now(),
      config: args.config,
      stages,
      results: [],
      resultIds: [],
      metrics: emptyMetrics(),
      corpusSize: args.corpus.length,
      embeddingModelVersion: args.config.embeddingModel || "unknown",
      pipelineVersion: args.config.pipelineVersion,
      warnings,
      errors,
    };
  }

  stages.push({
    name: "query_preparation",
    durationMs: 0,
    inputCount: 1,
    outputCount: 1,
    status: "success",
    metadata: { preparedLength: preparedQuery.length },
  });

  const embedStarted = Date.now();
  const queryEmbedding = await embedText(preparedQuery);
  stages.push({
    name: "embedding_or_initial_retrieval",
    durationMs: Date.now() - embedStarted,
    inputCount: 1,
    outputCount: 1,
    status: "success",
    metadata: {
      embeddingModel: queryEmbedding.modelId,
      embeddingDim: queryEmbedding.dim,
      embeddingMs: queryEmbedding.inferenceMs,
    },
  });

  const candidateStarted = Date.now();
  const scoredAll = args.corpus.map((crystal) => {
    const crystalEmbedding = args.corpusEmbeddings.get(crystal.node_id);
    if (!crystalEmbedding?.length) {
      warnings.push(`Missing embedding for ${crystal.node_id}`);
      return { crystal, rawScore: 0 };
    }
    return {
      crystal,
      rawScore: cosineSimilarity(queryEmbedding.vector, crystalEmbedding),
    };
  });
  scoredAll.sort((left, right) => right.rawScore - left.rawScore);
  const actualPoolSize = Math.min(args.config.candidatePoolSize, scoredAll.length);
  const candidates = scoredAll.slice(0, actualPoolSize);
  if (actualPoolSize < args.config.candidatePoolSize) {
    warnings.push(`Requested pool ${args.config.candidatePoolSize} but corpus has ${scoredAll.length} crystals`);
  }
  stages.push({
    name: "candidate_pool_selection",
    durationMs: Date.now() - candidateStarted,
    inputCount: scoredAll.length,
    outputCount: candidates.length,
    status: "success",
    metadata: {
      requestedPoolSize: args.config.candidatePoolSize,
      actualPoolSize,
    },
  });

  const scoringStarted = Date.now();
  const results = candidates
    .map<RetrievalResult>(({ crystal, rawScore }) => {
      const finalScore = rawScore * (0.7 + 0.3 * crystal.importance);
      const score: ScoreDecomposition = {
        rawScore,
        finalScore,
        embeddingScore: rawScore,
        importance: crystal.importance,
        reasonCodes: deriveReasonCodes(rawScore, crystal.importance, finalScore),
      };
      return {
        crystal: { ...crystal, rawEmbeddingScore: rawScore },
        rank: 0,
        score,
        hitHistory: [],
      };
    })
    .sort((left, right) => right.score.finalScore - left.score.finalScore)
    .slice(0, Math.min(args.config.topK, candidates.length))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  stages.push({
    name: "existing_scoring",
    durationMs: Date.now() - scoringStarted,
    inputCount: candidates.length,
    outputCount: results.length,
    status: "success",
    metadata: { formula: "finalScore = rawScore * (0.7 + 0.3 * importance)" },
  });

  stages.push({
    name: "existing_update_if_triggered",
    durationMs: 0,
    inputCount: results.length,
    outputCount: results.length,
    status: "skipped",
    metadata: { reason: "research_mode_read_only" },
  });
  stages.push({
    name: "existing_forget_if_triggered",
    durationMs: 0,
    inputCount: results.length,
    outputCount: results.length,
    status: "skipped",
    metadata: { reason: "research_mode_read_only" },
  });

  const previousRuns = args.previousRuns ?? [];
  for (const result of results) {
    for (const run of previousRuns) {
      if (run.resultIds.includes(result.crystal.node_id)) {
        result.hitHistory.push(run.runId);
      }
    }
  }

  stages.push({
    name: "visualization_preparation",
    durationMs: 0,
    inputCount: results.length,
    outputCount: results.length,
    status: "success",
    metadata: { previousRunsChecked: previousRuns.length },
  });

  const resultIds = results.map((item) => item.crystal.node_id);
  stages.push({
    name: "result_render",
    durationMs: 0,
    inputCount: results.length,
    outputCount: resultIds.length,
    status: "success",
    metadata: { renderedAs: "torus_atlas_overlay" },
  });

  const finishedAt = Date.now();
  return {
    runId,
    query: rawQuery,
    startedAt,
    finishedAt,
    config: args.config,
    stages,
    results,
    resultIds,
    metrics: computeRunMetrics(results, finishedAt - startedAt),
    corpusSize: args.corpus.length,
    embeddingModelVersion: queryEmbedding.modelId,
    pipelineVersion: args.config.pipelineVersion,
    warnings,
    errors,
  };
}
