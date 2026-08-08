import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadResearchCorpus, loadStoredEmbeddings, buildCorpusEmbeddings } from "@/lib/metis-research/corpus";
import { compareMultipleRuns } from "@/lib/metis-research/cross-run";
import { runRetrieval } from "@/lib/metis-research/pipeline";
import type {
  ComparisonResult,
  LibraryCrystal,
  LibrarySummary,
  ResearchInitState,
  RetrievalRun,
  RunConfig,
} from "@/lib/metis-research/types";

const MAX_RUNS = 80;
const PERSIST_PATH = join(process.cwd(), "data", "metis_research", "runs.json");

class MetisResearchStore {
  private corpus: LibraryCrystal[] = [];
  private corpusEmbeddings = new Map<string, number[]>();
  private summary: LibrarySummary | null = null;
  private charts: ResearchInitState["charts"] = [];
  private runs: RetrievalRun[] = [];
  private activeRunId: string | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initProgress = { done: 0, total: 1, phase: "idle" };

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize() {
    this.initProgress = { done: 0, total: 3, phase: "load_sqlite_corpus" };
    const { crystals, summary, charts } = await loadResearchCorpus();
    this.corpus = crystals;
    this.summary = summary;
    this.charts = charts;

    this.initProgress = { done: 1, total: 3, phase: "load_embeddings" };
    const storedEmbeddings = await loadStoredEmbeddings();
    this.corpusEmbeddings = buildCorpusEmbeddings(crystals, storedEmbeddings);

    this.initProgress = { done: 2, total: 3, phase: "load_history" };
    this.restoreRuns();
    this.initialized = true;
    this.initProgress = { done: 3, total: 3, phase: "ready" };
  }

  getInitState(): ResearchInitState {
    return {
      ready: this.initialized,
      progress: { ...this.initProgress },
      summary: this.summary,
      corpusNodes: this.corpus,
      charts: this.charts,
    };
  }

  getRuns() {
    return this.runs;
  }

  getRun(runId: string) {
    return this.runs.find((run) => run.runId === runId);
  }

  getActiveRun() {
    if (!this.activeRunId) return this.runs[0] ?? null;
    return this.runs.find((run) => run.runId === this.activeRunId) ?? null;
  }

  setActiveRun(runId: string) {
    if (this.runs.some((run) => run.runId === runId)) {
      this.activeRunId = runId;
      this.persistRuns();
    }
    return this.activeRunId;
  }

  getQueryHistory() {
    const seen = new Set<string>();
    const history: string[] = [];
    for (const run of this.runs) {
      if (!seen.has(run.query)) {
        seen.add(run.query);
        history.push(run.query);
      }
    }
    return history;
  }

  async runQuery(query: string, config: RunConfig) {
    await this.ensureInitialized();
    const run = await runRetrieval({
      query,
      config,
      corpus: this.corpus,
      corpusEmbeddings: this.corpusEmbeddings,
      previousRuns: this.runs,
    });
    this.runs.unshift(run);
    if (this.runs.length > MAX_RUNS) this.runs.length = MAX_RUNS;
    this.activeRunId = run.runId;
    this.persistRuns();
    return run;
  }

  async runPoolComparison(query: string, poolSizes: number[], topK: number, seed: number | null) {
    await this.ensureInitialized();
    const runs: RetrievalRun[] = [];
    for (const poolSize of poolSizes) {
      const run = await runRetrieval({
        query,
        config: {
          candidatePoolSize: poolSize,
          topK,
          mode: "candidate_pool_comparison",
          seed,
          embeddingModel: null,
          pipelineVersion: "metis-inspired-retrieval-v2.1",
        },
        corpus: this.corpus,
        corpusEmbeddings: this.corpusEmbeddings,
        previousRuns: [...this.runs, ...runs],
      });
      runs.push(run);
      this.runs.unshift(run);
    }
    if (this.runs.length > MAX_RUNS) this.runs.length = MAX_RUNS;
    this.activeRunId = runs[0]?.runId ?? null;
    this.persistRuns();
    return runs;
  }

  compareRuns(runIds: string[]): ComparisonResult {
    const runs = runIds
      .map((runId) => this.getRun(runId))
      .filter((run): run is RetrievalRun => Boolean(run));
    if (runs.length < 2) {
      throw new Error("Not enough valid runs found in history");
    }
    return compareMultipleRuns(runs);
  }

  clearHistory() {
    this.runs = [];
    this.activeRunId = null;
    this.persistRuns();
  }

  private restoreRuns() {
    try {
      const raw = readFileSync(PERSIST_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.runs = parsed as RetrievalRun[];
      this.activeRunId = this.runs[0]?.runId ?? null;
    } catch {
      this.runs = [];
      this.activeRunId = null;
    }
  }

  private persistRuns() {
    try {
      mkdirSync(dirname(PERSIST_PATH), { recursive: true });
      writeFileSync(PERSIST_PATH, JSON.stringify(this.runs, null, 2), "utf-8");
    } catch {
      // best effort only
    }
  }
}

declare global {
  var __metisResearchStore: MetisResearchStore | undefined;
}

export function getMetisResearchStore() {
  if (!global.__metisResearchStore) {
    global.__metisResearchStore = new MetisResearchStore();
  }
  return global.__metisResearchStore;
}
