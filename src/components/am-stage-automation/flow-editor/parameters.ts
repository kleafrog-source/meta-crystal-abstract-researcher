import type { AutomationStageDefinition } from "@/lib/am-stage-automation/contracts";
import { updateDataOperatorSettings, updateFlowJoinPolicies, updateFlowOperatorSettings } from "@/lib/am-stage-automation/scenario-editor";

/** Write an inspector value through the same settings normalization helpers used by Automation. */
export function applyNodeflowParameter(stage: AutomationStageDefinition, key: string, value: unknown): AutomationStageDefinition {
  if (stage.actionId === "audio.segment" && key === "requestedCount") {
    return {
      ...stage,
      settings: {
        ...stage.settings,
        origin: "manual",
        requested: { ...stage.settings.requested, requestedCount: value, maximumCount: value },
        effective: { ...stage.settings.effective, requestedCount: value, maximumCount: value },
      },
    };
  }
  if (stage.actionId === "flow.if" || stage.actionId === "flow.router") return updateFlowOperatorSettings(stage, { [key]: value });
  if (["data.filter", "data.count", "data.select", "data.split"].includes(stage.actionId)) return updateDataOperatorSettings(stage, { [key]: value });
  if (stage.actionId === "flow.join" && key === "policies") return updateFlowJoinPolicies(stage, value as Array<Record<string, unknown>>);
  return {
    ...stage,
    settings: {
      ...stage.settings,
      origin: "manual",
      requested: { ...stage.settings.requested, [key]: value },
      effective: { ...stage.settings.effective, [key]: value },
    },
  };
}
