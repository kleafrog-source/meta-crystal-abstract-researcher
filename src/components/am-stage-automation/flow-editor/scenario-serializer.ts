import type { AutomationScenarioDefinition, AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";

export interface NodeflowScenarioDraft {
  id: string;
  version: number;
  title: string;
  stages: AutomationStageDefinition[];
  positions: Record<string, { x: number; y: number }>;
  templateVariablesText: string;
}

/** Save only fields owned by the visual editor. Unknown scenario/stage metadata stays intact. */
export function serializeNodeflowScenario(base: AutomationScenarioDefinition, draft: NodeflowScenarioDraft): AutomationScenarioDefinition {
  const stages = structuredClone(draft.stages);
  const originalOutputSignature = JSON.stringify(base.stages.map((stage) => [stage.stageId, stage.outputDefinitions]));
  const nextOutputSignature = JSON.stringify(stages.map((stage) => [stage.stageId, stage.outputDefinitions]));
  const changedOutputs = originalOutputSignature !== nextOutputSignature;
  return {
    ...structuredClone(base),
    id: draft.id,
    version: draft.version,
    title: draft.title.trim(),
    stages,
    defaultSettings: {
      ...structuredClone(base.defaultSettings),
      templateVariablesText: draft.templateVariablesText,
    },
    editorLayout: { schemaVersion: 1, positions: structuredClone(draft.positions) },
    ...(changedOutputs ? {
      requiredResults: stages.flatMap((stage) => stage.outputDefinitions.filter((output) => output.required).map((output) => output.kind)),
      optionalResults: stages.flatMap((stage) => stage.outputDefinitions.filter((output) => !output.required).map((output) => output.kind)),
    } : {}),
  };
}
