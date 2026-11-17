import path from "node:path";

export function resolveRuntimeAtomIndexDirectory(dataRoot: string, versionId: string, runtimeIndexPath?: unknown): string {
  if (runtimeIndexPath === undefined) return path.join(dataRoot, "indexes", versionId);
  if (typeof runtimeIndexPath !== "string" || !runtimeIndexPath) throw new Error("Active runtime atom index pointer is malformed.");
  const resolved = path.resolve(dataRoot, runtimeIndexPath);
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  if (!resolved.startsWith(maintenanceRoot)) throw new Error("Active runtime atom index pointer escapes the immutable candidate area.");
  return resolved;
}

export function resolveGemmaRuntimeAtomIndexDirectory(dataRoot: string, pointer: {
  encoder?: unknown; version_id?: unknown; runtime_atom_index_path?: unknown; gemma_bundle_path?: unknown;
}): { versionId: string; directory: string } {
  if (pointer.encoder !== "embeddinggemma2" || typeof pointer.version_id !== "string" || !pointer.version_id
    || typeof pointer.runtime_atom_index_path !== "string" || typeof pointer.gemma_bundle_path !== "string") {
    throw new Error("Gemma runtime pointer is incomplete or has the wrong encoder.");
  }
  const maintenanceRoot = path.resolve(dataRoot, "maintenance") + path.sep;
  const bundleRoot = path.resolve(dataRoot, pointer.gemma_bundle_path);
  const runtimeDirectory = path.resolve(dataRoot, pointer.runtime_atom_index_path);
  if (!bundleRoot.startsWith(maintenanceRoot) || !runtimeDirectory.startsWith(`${bundleRoot}${path.sep}`)) {
    throw new Error("Gemma runtime atom pointer escapes its connected candidate bundle.");
  }
  return { versionId: pointer.version_id, directory: runtimeDirectory };
}
