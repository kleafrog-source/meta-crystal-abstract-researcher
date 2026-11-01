import { loadEmbeddingRuntimeSettings } from "./embedding-settings";
import { selectModelsToUnload } from "./ollama-memory-policy";
import { assertOllamaInferenceAvailable } from "./model-slot";

interface OllamaProcess {
  name?: string;
  model?: string;
}

interface OllamaProcessesResponse {
  models?: OllamaProcess[];
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function modelName(process: OllamaProcess): string {
  return String(process.name || process.model || "").trim();
}

async function listLoadedModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/ps`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok)
    throw new Error(`Ollama /api/ps returned ${response.status}`);
  const payload = (await response.json()) as OllamaProcessesResponse;
  return (payload.models ?? []).map(modelName).filter(Boolean);
}

async function unloadModel(baseUrl: string, model: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, keep_alive: 0 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Ollama could not unload "${model}" (${response.status})`);
  await response.text();
}

async function unloadAndVerify(
  baseUrl: string,
  keepModels: string[],
  waitMs: number,
  slotOwner?: string,
): Promise<string[]> {
  assertOllamaInferenceAvailable(slotOwner);
  const models = selectModelsToUnload(
    await listLoadedModels(baseUrl),
    keepModels,
  );
  for (const model of models) await unloadModel(baseUrl, model);
  if (models.length > 0) await sleep(waitMs);
  const stillLoaded = selectModelsToUnload(
    await listLoadedModels(baseUrl),
    keepModels,
  );
  if (stillLoaded.length > 0) {
    throw new Error(
      `Ollama models are still loaded: ${stillLoaded.join(", ")}`,
    );
  }
  return models;
}

export async function prepareGpuForExternalModel(
  waitMs = 7_000,
  slotOwner?: string,
): Promise<string[]> {
  assertOllamaInferenceAvailable(slotOwner);
  // Call only from explicit user-triggered model work; status probes must never
  // launch, warm, or unload models as a side effect.
  const { baseUrl } = await loadEmbeddingRuntimeSettings();
  return unloadAndVerify(baseUrl, [], waitMs, slotOwner);
}

export async function prepareGpuForV3Embedding(
  waitMs = 5_000,
  modelOverride?: string,
  slotOwner?: string,
): Promise<string[]> {
  const { baseUrl, model } = await loadEmbeddingRuntimeSettings();
  const embeddingModel = modelOverride?.trim() || model;
  return unloadAndVerify(baseUrl, [embeddingModel], waitMs, slotOwner);
}

export async function prepareGpuForEmbeddingModel(model: string, waitMs = 5_000, slotOwner?: string): Promise<string[]> {
  const { baseUrl } = await loadEmbeddingRuntimeSettings();
  return unloadAndVerify(baseUrl, [model], waitMs, slotOwner);
}

export async function ensureOllamaModelAvailable(model: string): Promise<void> {
  const { baseUrl } = await loadEmbeddingRuntimeSettings();
  const response = await fetch(`${baseUrl}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Cannot check the Ollama model list (HTTP ${response.status}).`);
  const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
  if (!(payload.models ?? []).some((item) => (item.name ?? item.model)?.trim() === model)) {
    throw new Error(`Model ${model} is not installed. Install it with: ollama pull ${model}`);
  }
}
