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
  shortName: string;
  glyph: string;
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
    textEmbedding: { modelId: "qwen3-embedding:0.6b", shortName: "qwen", glyph: "Q", provider: "ollama", enabled: true },
    multimodalEmbedding: { modelId: "embeddinggemma-2:740m", shortName: "gemma", glyph: "G", provider: "ollama", enabled: true },
    textLlm: { modelId: "qwen2.5-3b", shortName: "text-llm", glyph: "T", provider: "ollama", enabled: true },
    audioLlm: { modelId: "lfm3-audio", shortName: "lfm3", glyph: "L", provider: "ollama", enabled: true },
    clap: { modelId: "laion/clap-htsat-fused", shortName: "clap", glyph: "C", provider: "local", enabled: true },
    siglip2: { modelId: "D:/hfmodels/siglip2-base-patch16-224", shortName: "siglip", glyph: "S", provider: "local", enabled: true },
    helm: { modelId: "run-saina/saina-helm-3-0.8b", shortName: "helm", glyph: "H", provider: "ollama", enabled: false },
    voice: { modelId: "voice-presentation", shortName: "voice", glyph: "V", provider: "local", enabled: true },
    indic: { modelId: "indic-language-id", shortName: "indic", glyph: "I", provider: "local", enabled: true },
    classicDsp: { modelId: "librosa", shortName: "librosa", glyph: "D", provider: "local", enabled: true },
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
  const usedGlyphs = new Set<string>();
  const modelSlots = Object.fromEntries(MODEL_SLOT_IDS.map((id) => {
    const candidate = incomingSlots[id];
    const slot = candidate && typeof candidate === "object" ? candidate : {};
    const fallback = DEFAULT_CAPABILITY_REGISTRY.modelSlots[id];
    const provider = PROVIDERS.has(slot.provider as CapabilityProvider) ? slot.provider as CapabilityProvider : fallback.provider;
    const shortNameCandidate = typeof slot.shortName === "string" ? slot.shortName.toLowerCase().replace(/[^a-z0-9_-]/g, "") : fallback.shortName;
    const shortName = shortNameCandidate || fallback.shortName;
    const typedGlyph = typeof slot.glyph === "string" && /^[a-z0-9]{1,3}$/i.test(slot.glyph.trim()) ? slot.glyph.trim().toUpperCase() : "";
    const baseGlyph = typedGlyph || shortName[0].toUpperCase();
    let glyph = baseGlyph;
    for (let suffix = 2; usedGlyphs.has(glyph); suffix += 1) glyph = `${baseGlyph.slice(0, Math.max(1, 3 - String(suffix).length))}${suffix}`;
    usedGlyphs.add(glyph);
    return [id, {
      modelId: typeof slot.modelId === "string" ? slot.modelId.trim() : fallback.modelId,
      shortName,
      glyph,
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

export function substituteModelNames(text: string, registry: CapabilityRegistry): string {
  const replacements: Array<[RegExp, string]> = [
    [/EmbeddingGemma\s*2/gi, registry.modelSlots.multimodalEmbedding.shortName],
    [/Qwen3/gi, registry.modelSlots.textEmbedding.shortName],
    [/SigLIP2/gi, registry.modelSlots.siglip2.shortName],
    [/\bCLAP\b/gi, registry.modelSlots.clap.shortName],
    [/\bLFM3\b/gi, registry.modelSlots.audioLlm.shortName],
    [/\bGemma\b/gi, registry.modelSlots.multimodalEmbedding.shortName],
  ];
  return replacements.reduce((value, [pattern, alias]) => value.replace(pattern, alias), text);
}

let activeModelAliases: CapabilityRegistry = DEFAULT_CAPABILITY_REGISTRY;

export function setActiveModelAliases(value: unknown): CapabilityRegistry {
  activeModelAliases = normalizeCapabilityRegistry(value);
  return activeModelAliases;
}

export function modelRoleGlyph(registry: CapabilityRegistry, slotId: ModelSlotId, role?: "A" | "V"): string {
  const glyph = registry.modelSlots[slotId].glyph;
  if (!role) return glyph;
  const suffix = glyph.match(/\d+$/)?.[0] ?? "";
  return `${glyph[0]}${role}${suffix}`.slice(0, 3);
}

export function capabilityIsEnabled(registry: CapabilityRegistry, id: string): boolean {
  const capability = registry.capabilities[id];
  const slot = capability ? registry.modelSlots[capability.modelSlot] : undefined;
  if (!capability?.enabled || !slot?.enabled || slot.provider === "none") return false;
  if (["textEmbedding", "multimodalEmbedding", "textLlm", "helm"].includes(capability.modelSlot) && slot.provider !== "ollama") return false;
  if (["clap", "siglip2", "voice", "indic", "classicDsp"].includes(capability.modelSlot) && slot.provider !== "local") return false;
  return true;
}
