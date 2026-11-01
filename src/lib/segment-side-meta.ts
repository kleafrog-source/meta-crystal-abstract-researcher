export const INDIC_LANGUAGE_TAGS = [
  "en-IN", "hi-IN", "or-IN", "bn-IN", "ta-IN", "te-IN",
  "kn-IN", "ml-IN", "mr-IN", "gu-IN", "pa-IN", "as-IN",
] as const;

export type IndicLanguageTag = (typeof INDIC_LANGUAGE_TAGS)[number];

export interface SegmentAcousticFeatures {
  extractor: "librosa";
  ran_at: string;
  feature_version: "stage7_librosa_lpc_v1";
  sample_rate_hz: number;
  duration_seconds: number;
  rms_mean: number;
  rms_min: number;
  rms_max: number;
  loudness_dbfs_approx: number;
  peak: number;
  spectral_centroid_mean_hz: number;
  spectral_bandwidth_mean_hz: number;
  spectral_rolloff_85_mean_hz: number;
  tempo_bpm_approx: number | null;
  beat_times_seconds: number[];
  onset_times_seconds: number[];
  formants: null | {
    f1_hz: number;
    f2_hz: number;
    confidence: number;
    voiced_frame_ratio: number;
    method: "lpc_heuristic";
  };
  formant_skip_reason: "helm_negative" | "low_energy" | "insufficient_voiced_frames" | null;
}

export interface HelmGateValue {
  value: boolean | null;
  probability: number | null;
  probabilities: { true: number | null; false: number | null };
  confidence: number | null;
}

export interface SegmentSideMeta {
  schema: "segment_side_meta_v1";
  acoustic_features?: SegmentAcousticFeatures;
  helm?: {
    model: string;
    ran_at: string;
    gates: {
      has_vocals: HelmGateValue;
      has_speech: HelmGateValue;
      aggressive_vocal: HelmGateValue;
      is_ambient_noise: HelmGateValue;
    };
  };
  gender?: {
    model: string;
    ran_at: string;
    label: "male" | "female" | "unknown";
    score: number;
    probabilities: { male: number; female: number };
    semantics: "acoustic_voice_presentation";
  };
  language?: {
    model: string;
    ran_at: string;
    tags: Array<{ code: IndicLanguageTag; label: string; confidence: number }>;
    top_confidence: number;
  };
}

export function normalizeIndicLanguageTags(value: unknown): IndicLanguageTag[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
  const allowed = new Set<string>(INDIC_LANGUAGE_TAGS);
  return [...new Set(values.map((item) => String(item).trim()).filter((item): item is IndicLanguageTag => allowed.has(item)))];
}
