export type GemmaCandidateArtifactKind = "embeddinggemma2_text" | "gemma2_atoms" | "gemma2_anchors" | "gemma2_range" | "gemma2_select" | "gemma2_relations";

export const GEMMA_CANDIDATE_ARTIFACTS: readonly GemmaCandidateArtifactKind[] = [
  "embeddinggemma2_text", "gemma2_atoms", "gemma2_anchors", "gemma2_range", "gemma2_select", "gemma2_relations",
];

export function gemmaCandidateRowsReadyForFinalize(builds: Record<string, string> | undefined): boolean {
  return GEMMA_CANDIDATE_ARTIFACTS.every((kind) => builds?.[kind] === "complete"
    || (kind === "gemma2_atoms" && builds?.[kind] === "vectorization_complete"));
}

export const GEMMA_ARTIFACT_DIRECTORIES: Record<GemmaCandidateArtifactKind, string> = {
  embeddinggemma2_text: "text-index",
  gemma2_atoms: "runtime-atoms",
  gemma2_anchors: "anchors",
  gemma2_range: "range-anchors",
  gemma2_select: "range-anchors",
  gemma2_relations: "relations",
};

export interface GemmaBuildIdentity {
  schema_version: 1;
  artifact_kind: GemmaCandidateArtifactKind;
  encoder: "embeddinggemma2";
  model: string;
  endpoint: string;
  dimensions: 768;
  source_revision: string;
  source_snapshot_content_sha256: string;
  snapshot_file_sha256: string;
  inputs: Array<{ path: string; sha256: string }>;
  settings: Record<string, string | number | boolean>;
}

