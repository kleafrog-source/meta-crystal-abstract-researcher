export const ACOUSTIC_DOMAIN_LAYERS = [
  { id: "VOCAL_MORPHOLOGY_LAYER", label: "Vocal morphology", color: "#e879f9" },
  { id: "SYNTHESIS_PHYSICS_LAYER", label: "Synthesis physics", color: "#22d3ee" },
  { id: "SPECTRAL_DSP_LAYER", label: "Spectral DSP", color: "#a78bfa" },
  { id: "SPATIAL_BINAURAL_LAYER", label: "Spatial binaural", color: "#34d399" },
  { id: "DYNAMICS_ENVELOPE_LAYER", label: "Dynamics envelope", color: "#fbbf24" },
  { id: "TEMPORAL_RHYTHM_LAYER", label: "Temporal rhythm", color: "#fb7185" },
  { id: "GENERATIVE_CHAOS_LAYER", label: "Generative chaos", color: "#f97316" },
  { id: "COMPOSITIONAL_VECTOR_LAYER", label: "Compositional vector", color: "#60a5fa" },
  { id: "MODULATION_PERFORMANCE_LAYER", label: "Modulation performance", color: "#c084fc" },
] as const;

export const GLOBAL_CONSENSUS_LAYER = {
  id: "GLOBAL_CONSENSUS_LAYER",
  label: "Global consensus (UI only)",
  color: "#94a3b8",
} as const;

export type AcousticDomainLayerId = (typeof ACOUSTIC_DOMAIN_LAYERS)[number]["id"];
