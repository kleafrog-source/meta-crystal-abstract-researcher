import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve lexicon directory path
const PROJECT_ROOT = process.cwd();
const LEXICON_DIR = path.join(PROJECT_ROOT, "python_engine", "lexicon");
const REPORTS_DIR = path.join(LEXICON_DIR, "reports");
const SCRIPTS_DIR = path.join(LEXICON_DIR, "scripts");

interface CoverageEntry {
  entityType: string;
  total: number;
  described: number;
  missing: number;
  coveragePercent: number;
  status: "complete" | "partial" | "not_started" | "warning";
  nextAction: string;
}

interface Overview {
  totalEntries: number;
  describedEntries: number;
  missingDescriptions: number;
  coveragePercent: number;
  ambiguousEntries: number;
  validationValid: number;
  validationTotal: number;
  buildStatus: string;
  runtimeCodeChanges: number;
  lastSnapshot: string;
  lastExtractionTimestamp: string;
  lastValidationTimestamp: string;
  lastBuildTimestamp: string;
}

interface PipelineStage {
  id: string;
  name: string;
  status: "complete" | "current" | "next" | "future" | "blocked";
  description: string;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
  }
  return null;
}

function getStatus(coverage: number): "complete" | "partial" | "not_started" | "warning" {
  if (coverage === 100) return "complete";
  if (coverage > 0) return "partial";
  return "not_started";
}

function getNextAction(status: string, entityType: string): string {
  switch (status) {
    case "complete":
      return "Review and validate";
    case "partial":
      return "Complete missing descriptions";
    case "not_started":
      return "Extract or enrich descriptions";
    default:
      return "Review";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "overview") {
      const completenessReport = readJsonFile<{
        report_timestamp: string;
        total_entries: number;
        entity_types: Record<string, { total: number; source_description_found: number; needs_human_review: number }>;
      }>(path.join(REPORTS_DIR, "semantic-completeness-report.json"));

      const validationReport = readJsonFile<{
        validation_timestamp: string;
        summary: {
          total_files: number;
          valid_files: number;
          invalid_files: number;
          total_entries: number;
          valid_entries: number;
          invalid_entries: number;
        };
      }>(path.join(REPORTS_DIR, "validation-report.json"));

      const buildReport = readJsonFile<{
        build_timestamp: string;
        snapshot: string;
        summary?: {
          total_entries?: number;
        };
      }>(path.join(REPORTS_DIR, "build-report.json"));

      const ambiguousReport = readJsonFile<{
        duplicate_symbols: Record<string, string[]>;
      }>(path.join(REPORTS_DIR, "duplicate-symbols.json"));

      const totalEntries = completenessReport?.total_entries ?? 0;
      let describedEntries = 0;
      let missingDescriptions = 0;
      let needsHumanReview = 0;

      if (completenessReport?.entity_types) {
        for (const [_, data] of Object.entries(completenessReport.entity_types)) {
          describedEntries += data.source_description_found;
          missingDescriptions += data.total - data.source_description_found;
          needsHumanReview += data.needs_human_review;
        }
      }

      const coveragePercent = totalEntries > 0 ? (describedEntries / totalEntries) * 100 : 0;
      const ambiguousEntries = ambiguousReport?.duplicate_symbols ? Object.keys(ambiguousReport.duplicate_symbols).length : 0;

      const overview: Overview = {
        totalEntries,
        describedEntries,
        missingDescriptions,
        coveragePercent: Math.round(coveragePercent * 10) / 10,
        ambiguousEntries,
        validationValid: validationReport?.summary?.valid_entries ?? 0,
        validationTotal: validationReport?.summary?.total_entries ?? 0,
        buildStatus: buildReport ? "built" : "unknown",
        runtimeCodeChanges: 0,
        lastSnapshot: buildReport?.snapshot ?? "none",
        lastExtractionTimestamp: completenessReport?.report_timestamp ?? "",
        lastValidationTimestamp: validationReport?.validation_timestamp ?? "",
        lastBuildTimestamp: buildReport?.build_timestamp ?? "",
      };

      return NextResponse.json(overview);
    }

    if (action === "coverage") {
      const completenessReport = readJsonFile<{
        report_timestamp: string;
        total_entries: number;
        entity_types: Record<string, { total: number; source_description_found: number; needs_human_review: number }>;
      }>(path.join(REPORTS_DIR, "semantic-completeness-report.json"));

      const coverage: CoverageEntry[] = [];

      if (completenessReport?.entity_types) {
        for (const [entityType, data] of Object.entries(completenessReport.entity_types)) {
          const total = data.total;
          const described = data.source_description_found;
          const missing = total - described;
          const coveragePercent = total > 0 ? (described / total) * 100 : 0;
          const status = getStatus(coveragePercent);
          const nextAction = getNextAction(status, entityType);

          coverage.push({
            entityType,
            total,
            described,
            missing,
            coveragePercent: Math.round(coveragePercent * 10) / 10,
            status,
            nextAction,
          });
        }
      }

      return NextResponse.json(coverage);
    }

    if (action === "pipeline") {
      const pipelineStages: PipelineStage[] = [
        {
          id: "runtime_audit",
          name: "Runtime audit",
          status: "complete",
          description: "Подтверждена цепочка UI → API → sidecar → Python generator.",
        },
        {
          id: "machine_layer",
          name: "Machine layer",
          status: "complete",
          description: "Технические факты извлечены и валидированы.",
        },
        {
          id: "extended_lexicon",
          name: "Extended machine lexicon",
          status: "complete",
          description: "Добавлены operators, formulas, constants и lexical categories.",
        },
        {
          id: "source_description_extraction",
          name: "Source description extraction",
          status: "complete",
          description: "Извлечены descriptions, уже присутствующие в source files.",
        },
        {
          id: "semantic_enrichment",
          name: "Semantic enrichment",
          status: "next",
          description: "Заполнение отсутствующих descriptions, synonyms и query phrases.",
        },
        {
          id: "human_review",
          name: "Human review",
          status: "future",
          description: "Проверка semantic records и неоднозначных записей.",
        },
        {
          id: "embedding_index",
          name: "BGE-M3 indexing",
          status: "future",
          description: "Создание embeddings и retrieval index после утверждения semantic layer.",
        },
        {
          id: "parameter_retrieval",
          name: "Semantic parameter retrieval",
          status: "future",
          description: "Поиск параметров генератора по свободному query.",
        },
        {
          id: "configuration_validation",
          name: "Configuration compilation and validation",
          status: "future",
          description: "Сборка и проверка предложенной конфигурации.",
        },
        {
          id: "controlled_generation",
          name: "Controlled generation",
          status: "future",
          description: "Ручное подтверждение и запуск генерации.",
        },
        {
          id: "result_alignment",
          name: "Post-generation evaluation",
          status: "future",
          description: "Сравнение результата с исходным query и ожидаемым профилем.",
        },
        {
          id: "pedantry_retry",
          name: "Strictness-controlled retry",
          status: "future",
          description: "Опциональная повторная генерация без удаления предыдущего результата.",
        },
      ];

      return NextResponse.json(pipelineStages);
    }

    if (action === "missing") {
      const missingReport = readJsonFile<{
        report_timestamp: string;
        total_missing: number;
        missing_descriptions: Array<{
          entry_id: string;
          entity_type: string;
          missing_fields: string[];
          reason: string;
          needs_human_review: boolean;
        }>;
      }>(path.join(REPORTS_DIR, "missing-descriptions.json"));

      const page = parseInt(searchParams.get("page") || "0", 10);
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const entityType = searchParams.get("entityType");

      let entries = missingReport?.missing_descriptions || [];

      if (entityType) {
        entries = entries.filter((e) => e.entity_type === entityType);
      }

      const start = page * limit;
      const paginatedEntries = entries.slice(start, start + limit);

      return NextResponse.json({
        total: entries.length,
        page,
        limit,
        entries: paginatedEntries,
      });
    }

    if (action === "descriptions") {
      const sourceDescriptionsReport = readJsonFile<{
        report_timestamp: string;
        total_source_descriptions: number;
        source_descriptions: Array<{
          entry_id: string;
          entity_type: string;
          description: string | null;
          source_file: string;
          source_path_or_symbol: string;
          extraction_method: string;
        }>;
      }>(path.join(REPORTS_DIR, "source-descriptions.json"));

      const page = parseInt(searchParams.get("page") || "0", 10);
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const entityType = searchParams.get("entityType");

      let entries = sourceDescriptionsReport?.source_descriptions || [];

      if (entityType) {
        entries = entries.filter((e) => e.entity_type === entityType);
      }

      const start = page * limit;
      const paginatedEntries = entries.slice(start, start + limit);

      return NextResponse.json({
        total: entries.length,
        page,
        limit,
        entries: paginatedEntries,
      });
    }

    if (action === "ambiguous") {
      const ambiguousReport = readJsonFile<{
        report_timestamp: string;
        total_ambiguous: number;
        ambiguous_descriptions: Array<{
          symbol: string;
          entities: string[];
          ambiguity_type: string;
          needs_human_review: boolean;
        }>;
      }>(path.join(REPORTS_DIR, "ambiguous-descriptions.json"));

      return NextResponse.json({
        report_timestamp: ambiguousReport?.report_timestamp || null,
        total_ambiguous: ambiguousReport?.total_ambiguous || 0,
        ambiguous_descriptions: ambiguousReport?.ambiguous_descriptions || [],
      });
    }

    if (action === "reports") {
      const reports = [
        { id: "semantic-completeness", name: "Semantic Completeness", path: "semantic-completeness-report.json" },
        { id: "source-descriptions", name: "Source Descriptions", path: "source-descriptions.json" },
        { id: "missing-descriptions", name: "Missing Descriptions", path: "missing-descriptions.json" },
        { id: "ambiguous-descriptions", name: "Ambiguous Descriptions", path: "ambiguous-descriptions.json" },
        { id: "unmatched-entries", name: "Unmatched Machine Entries", path: "unmatched-machine-entries.json" },
        { id: "validation", name: "Validation Report", path: "validation-report.json" },
        { id: "build", name: "Build Report", path: "build-report.json" },
        { id: "duplicate-symbols", name: "Duplicate Symbols", path: "duplicate-symbols.json" },
        { id: "runtime-provenance", name: "Runtime Provenance", path: "runtime-provenance.json" },
        { id: "deduplication", name: "Deduplication Report", path: "deduplication-report.json" },
      ];

      const reportData = reports.map((r) => {
        const filePath = path.join(REPORTS_DIR, r.path);
        const exists = existsSync(filePath);
        return {
          ...r,
          exists,
          timestamp: exists ? null : "not found",
        };
      });

      return NextResponse.json(reportData);
    }

    // Default: return all data
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const queryAction = url.searchParams.get("action");
    const body = await request.json().catch(() => ({}));
    const action = queryAction || body.action;

    if (action === "validate") {
      const pythonEngineDir = path.dirname(LEXICON_DIR);

      try {
        const { stdout, stderr } = await execAsync(
          `python lexicon/scripts/validate_lexicon.py`,
          { cwd: pythonEngineDir, timeout: 60000 }
        );

        return NextResponse.json({
          success: true,
          stdout,
          stderr,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        return NextResponse.json({
          success: false,
          error: (e as Error).message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (action === "build") {
      const pythonEngineDir = path.dirname(LEXICON_DIR);

      try {
        const { stdout, stderr } = await execAsync(
          `python lexicon/scripts/build_lexicon.py`,
          { cwd: pythonEngineDir, timeout: 60000 }
        );

        return NextResponse.json({
          success: true,
          stdout,
          stderr,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        return NextResponse.json({
          success: false,
          error: (e as Error).message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
