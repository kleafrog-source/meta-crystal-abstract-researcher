export const ACOUSTIC_DOMAIN_LAYERS = [
  { id: "VOCAL_MORPHOLOGY_LAYER", label: "Vocal morphology", color: "#e879f9", icon: "layerVocal" },
  { id: "SYNTHESIS_PHYSICS_LAYER", label: "Synthesis physics", color: "#22d3ee", icon: "layerSynthesis" },
  { id: "SPECTRAL_DSP_LAYER", label: "Spectral DSP", color: "#a78bfa", icon: "layerSpectral" },
  { id: "SPATIAL_BINAURAL_LAYER", label: "Spatial binaural", color: "#34d399", icon: "layerSpatial" },
  { id: "DYNAMICS_ENVELOPE_LAYER", label: "Dynamics envelope", color: "#fbbf24", icon: "layerDynamics" },
  { id: "TEMPORAL_RHYTHM_LAYER", label: "Temporal rhythm", color: "#fb7185", icon: "layerTemporal" },
  { id: "GENERATIVE_CHAOS_LAYER", label: "Generative chaos", color: "#f97316", icon: "layerChaos" },
  { id: "COMPOSITIONAL_VECTOR_LAYER", label: "Compositional vector", color: "#60a5fa", icon: "layerVector" },
  { id: "MODULATION_PERFORMANCE_LAYER", label: "Modulation performance", color: "#c084fc", icon: "layerModulation" },
] as const;

export const GLOBAL_CONSENSUS_LAYER = {
  id: "GLOBAL_CONSENSUS_LAYER",
  label: "Global consensus (UI only)",
  color: "#94a3b8",
} as const;

export type AcousticDomainLayerId = (typeof ACOUSTIC_DOMAIN_LAYERS)[number]["id"];
