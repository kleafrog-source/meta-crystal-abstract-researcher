import { ACTION_SUPPORTED } from "./catalog";

export type AdvisorArtifact = { artifactId?: string; actionId?: string; kind: string; validity?: string; data?: unknown };
export type AdvisorSummaryStep = { artifactId: string | null; actionId: string; kind: string; validity: string; count: number; preview: string };

function countItems(artifact: AdvisorArtifact): number {
  const data = artifact.data;
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return typeof data === "string" ? data.length : 0;
  const record = data as Record<string, unknown>;
  for (const key of ["parameters", "results", "records", "windows", "segments"]) if (Array.isArray(record[key])) return (record[key] as unknown[]).length;
  return 1;
}

function previewOf(artifact: AdvisorArtifact): string {
  const data = artifact.data;
  if (typeof data === "string") return data.slice(0, 200);
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  for (const key of ["text", "recommendation", "description", "summary"]) {
    const value = record[key];
    if (typeof value === "string") return value.slice(0, 200);
  }
  try { return JSON.stringify(data).slice(0, 200); } catch { return "[unserializable summary]"; }
}

export function summarizeAdvisorInputs(artifacts: AdvisorArtifact[], budgetChars: number) {
  if (artifacts.length < 1 || artifacts.length > 10) throw new Error("LLM_ADVISOR_STEPS_INVALID: bind one to ten earlier artifacts.");
  const steps: AdvisorSummaryStep[] = [];
  let usedChars = 0;
  let truncated = false;
  for (const [index, artifact] of artifacts.entries()) {
    const step: AdvisorSummaryStep = {
      artifactId: typeof artifact.artifactId === "string" ? artifact.artifactId : null,
      actionId: typeof artifact.actionId === "string" ? artifact.actionId : artifact.kind,
      kind: artifact.kind, validity: artifact.validity ?? "valid", count: countItems(artifact), preview: previewOf(artifact),
    };
    const size = JSON.stringify(step).length;
    if (usedChars + size > budgetChars) { truncated = true; continue; }
    usedChars += size;
    steps.push(step);
  }
  if (!steps.length) throw new Error("ADVISOR_BUDGET_EXCEEDED: budget is too small for one observed step.");
  return { steps, budgetChars, usedChars, truncated };
}

export type AdvisorProposal = { actionId: string; rationale: string; params: Record<string, unknown> };

export function parseAdvisorProposal(text: string, allowedActions: string[]) {
  const start = text.lastIndexOf("\n{");
  const candidate = start >= 0 ? text.slice(start + 1).trim() : text.trim();
  try {
    const value = JSON.parse(candidate) as Record<string, unknown>;
    if (!value || typeof value !== "object" || typeof value.actionId !== "string" || typeof value.rationale !== "string" || !value.params || typeof value.params !== "object" || Array.isArray(value.params)) {
      return { proposal: undefined, issue: "Proposal must include actionId, rationale and an object params field." };
    }
    if (!ACTION_SUPPORTED.has(value.actionId as never)) return { proposal: undefined, issue: `Unsupported actionId: ${value.actionId}.` };
    if (allowedActions.length && !allowedActions.includes(value.actionId)) return { proposal: undefined, issue: `Action ${value.actionId} is outside the allowedActions list.` };
    return { proposal: { actionId: value.actionId, rationale: value.rationale, params: value.params as Record<string, unknown> } satisfies AdvisorProposal, issue: null };
  } catch { return { proposal: undefined, issue: "Proposal JSON could not be parsed." }; }
}
