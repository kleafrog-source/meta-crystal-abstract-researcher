export function selectModelsToUnload(
  loadedModels: string[],
  keepModels: string[] = [],
): string[] {
  const keep = new Set(keepModels.map((name) => name.trim()).filter(Boolean));
  return [
    ...new Set(loadedModels.map((name) => name.trim()).filter(Boolean)),
  ].filter((name) => !keep.has(name));
}
