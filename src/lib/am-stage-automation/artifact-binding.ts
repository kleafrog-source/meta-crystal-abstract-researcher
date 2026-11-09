export interface BoundArtifactCandidate<T> {
  pass: string | null;
  createdAt?: Date | string;
  id: string;
  value: T;
}

export function filterStageOutputArtifacts<T extends { kind: string }>(
  candidates: T[],
  outputDefinitions: Array<{ port: string; kind: string }>,
  port = "result",
): T[] {
  const expected = outputDefinitions.find((output) => output.port === port)?.kind;
  return candidates.filter((candidate) => candidate.kind !== "automation-node-checkpoint"
    && (!expected || candidate.kind === expected));
}

export function chooseBoundArtifact<T>(
  candidates: BoundArtifactCandidate<T>[],
  inputName: string,
  sourceAction: string,
  transition: boolean,
): BoundArtifactCandidate<T> | undefined {
  const preferredPass = inputName === "identityBankB" ? "query-b"
    : inputName === "identityBank" ? (transition && sourceAction === "text.gemma.awtd" ? "query-a" : "awtd")
      : transition && sourceAction.startsWith("text.") && (inputName === "stage1" || inputName.startsWith("source") || inputName.startsWith("parameterBank")) ? "transition"
        : null;
  const ordered = [...candidates].sort((a, b) => {
    const time = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
    return time || a.id.localeCompare(b.id);
  });
  return ordered.find((item) => preferredPass && item.pass === preferredPass)
    ?? ordered.find((item) => item.pass === "resolved")
    ?? ordered.find((item) => item.pass === "awtd")
    ?? ordered[0];
}
