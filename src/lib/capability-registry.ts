export type CapabilityProvider = "ollama" | "local" | "none";

export const MODEL_SLOT_IDS = [
  "textEmbedding",
  "multimodalEmbedding",
  "textLlm",
  "audioLlm",
  "clap",
  "siglip2",
  "helm",
  "voice",
  "indic",
  "classicDsp",
] as const;

export type ModelSlotId = (typeof MODEL_SLOT_IDS)[number];

export interface ModelSlotSetting {
  modelId: string;
  provider: CapabilityProvider;
  enabled: boolean;
}

export interface CapabilitySetting {
  enabled: boolean;
  modelSlot: ModelSlotId;
}

export interface CapabilityRegistry {
  modelSlots: Record<ModelSlotId, ModelSlotSetting>;
  capabilities: Record<string, CapabilitySetting>;
}

export const DEFAULT_CAPABILITY_REGISTRY: CapabilityRegistry = {
  modelSlots: {
    textEmbedding: { modelId: "qwen3-embedding:0.6b", provider: "ollama", enabled: true },
    multimodalEmbedding: { modelId: "embeddinggemma-2:740m", provider: "ollama", enabled: true },
    textLlm: { modelId: "qwen2.5-3b", provider: "ollama", enabled: true },
    audioLlm: { modelId: "lfm3-audio", provider: "ollama", enabled: true },
    clap: { modelId: "laion/clap-htsat-fused", provider: "local", enabled: true },
    siglip2: { modelId: "D:/hfmodels/siglip2-base-patch16-224", provider: "local", enabled: true },
    helm: { modelId: "run-saina/saina-helm-3-0.8b", provider: "ollama", enabled: false },
    voice: { modelId: "voice-presentation", provider: "local", enabled: true },
    indic: { modelId: "indic-language-id", provider: "local", enabled: true },
    classicDsp: { modelId: "librosa", provider: "local", enabled: true },
  },
  capabilities: {
    "text.qwen.resolved": { enabled: true, modelSlot: "textEmbedding" },
    "text.gemma.awtd": { enabled: true, modelSlot: "multimodalEmbedding" },
    "text.gemma.resolved": { enabled: true, modelSlot: "multimodalEmbedding" },
    "audio.clap.resolved": { enabled: true, modelSlot: "clap" },
    "audio.gemma.awtd": { enabled: true, modelSlot: "multimodalEmbedding" },
    "audio.gemma.resolved": { enabled: true, modelSlot: "multimodalEmbedding" },
    "spec.siglip.resolved": { enabled: true, modelSlot: "siglip2" },
    "spec.gemma.*": { enabled: false, modelSlot: "multimodalEmbedding" },
    "side-meta.helm": { enabled: false, modelSlot: "helm" },
    "side-meta.voice": { enabled: true, modelSlot: "voice" },
    "side-meta.indic": { enabled: true, modelSlot: "indic" },
    "side-meta.librosa": { enabled: true, modelSlot: "classicDsp" },
    "side-meta.lfm3": { enabled: true, modelSlot: "audioLlm" },
  },
};

const PROVIDERS = new Set<CapabilityProvider>(["ollama", "local", "none"]);

export function normalizeCapabilityRegistry(value: unknown): CapabilityRegistry {
  const input = value && typeof value === "object" ? value as Partial<CapabilityRegistry> : {};
  const incomingSlots = input.modelSlots && typeof input.modelSlots === "object" ? input.modelSlots : {};
  const incomingCapabilities: Record<string, unknown> = input.capabilities && typeof input.capabilities === "object" ? input.capabilities as Record<string, unknown> : {};
  const modelSlots = Object.fromEntries(MODEL_SLOT_IDS.map((id) => {
    const candidate = incomingSlots[id];
    const slot = candidate && typeof candidate === "object" ? candidate : {};
    const fallback = DEFAULT_CAPABILITY_REGISTRY.modelSlots[id];
    const provider = PROVIDERS.has(slot.provider as CapabilityProvider) ? slot.provider as CapabilityProvider : fallback.provider;
    return [id, {
      modelId: typeof slot.modelId === "string" ? slot.modelId.trim() : fallback.modelId,
      provider,
      enabled: typeof slot.enabled === "boolean" ? slot.enabled : fallback.enabled,
    }];
  })) as CapabilityRegistry["modelSlots"];
  const capabilities = Object.fromEntries(Object.entries(DEFAULT_CAPABILITY_REGISTRY.capabilities).map(([id, fallback]) => {
    const candidate = incomingCapabilities[id];
    const setting = candidate && typeof candidate === "object" ? candidate as Partial<CapabilitySetting> : {};
    const modelSlot = MODEL_SLOT_IDS.includes(setting.modelSlot as ModelSlotId) ? setting.modelSlot as ModelSlotId : fallback.modelSlot;
    return [id, { enabled: typeof setting.enabled === "boolean" ? setting.enabled : fallback.enabled, modelSlot }];
  }));
  return { modelSlots, capabilities };
}

export function capabilityIsEnabled(registry: CapabilityRegistry, id: string): boolean {
  const capability = registry.capabilities[id];
  const slot = capability ? registry.modelSlots[capability.modelSlot] : undefined;
  if (!capability?.enabled || !slot?.enabled || slot.provider === "none") return false;
  if (["textEmbedding", "multimodalEmbedding", "textLlm", "helm"].includes(capability.modelSlot) && slot.provider !== "ollama") return false;
  if (["clap", "siglip2", "voice", "indic", "classicDsp"].includes(capability.modelSlot) && slot.provider !== "local") return false;
  return true;
}
