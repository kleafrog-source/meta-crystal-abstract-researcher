import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { GEMMA_ARTIFACT_DIRECTORIES, type GemmaBuildIdentity, type GemmaCandidateArtifactKind } from "./gemma-bundle";

export function gemmaCandidateArtifactDirectory(candidateRoot: string, kind: GemmaCandidateArtifactKind): string {
  return path.join(candidateRoot, "artifacts", "embeddinggemma2", GEMMA_ARTIFACT_DIRECTORIES[kind]);
}

export async function ensureGemmaCandidateArtifactDirectory(candidateRoot: string, kind: GemmaCandidateArtifactKind): Promise<string> {
  const directory = gemmaCandidateArtifactDirectory(candidateRoot, kind);
  await mkdir(directory, { recursive: true });
  return directory;
}

export function gemmaBuildIdentitySha256(identity: GemmaBuildIdentity): string {
  const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sort(item)]))
      : value;
  return createHash("sha256").update(JSON.stringify(sort(identity))).digest("hex");
}

export function gemmaIdentityCompatible(left: unknown, right: GemmaBuildIdentity): boolean {
  if (!left || typeof left !== "object") return false;
  return gemmaBuildIdentitySha256(left as GemmaBuildIdentity) === gemmaBuildIdentitySha256(right);
}
