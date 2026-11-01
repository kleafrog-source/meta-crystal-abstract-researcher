import type { AudioSegmentResultPoint } from "@/lib/audio-segment-result";
import type { ActiveParameter } from "@/lib/rag-v3/types";
import type { ParamToTextEntry, ParamToTextSnapshot } from "@/lib/param-to-text";
import type { BlendCurve } from "@/lib/am-stage-blend";

export interface ParamTextWorkbenchSessionState {
  snapshot: ParamToTextSnapshot | null;
  reverseQuery: null | { query_en: string; query_ru: string; key_concepts: string[]; uncertainties: string[]; provider: string; model: string; generated_at: string };
  limit: number;
  useClap: boolean;
  useSiglip: boolean;
  excludedInput: string;
  segment_text_features: Array<{ segment_index: number; time_seconds: number; window_start_seconds: number; window_end_seconds: number; text: string; tags: string[]; parameters: ParamToTextEntry[]; clap_status: string; siglip_status: string }>;
}

export interface AmStageSessionData {
  schema: "am_stage_session_v1";
  audio: { name: string | null; duration_seconds: number; path: null; missing_on_restore: boolean; warning: string | null };
  analysis_settings: {
    region_offset: number; region_duration: number; analysis_start: number; analysis_end: number;
    segment_interval: number; node_interval: number; clap_top_k: number; siglip_top_k: number;
    spectrogram_scale: string; spectrogram_detail: string; spectrogram_color: string;
    spectrogram_renderer: string; siglip_spectrogram_layout: string; show_spectrogram: boolean;
  };
  timeline: { segments: AudioSegmentResultPoint[] };
  banks: {
    text_parameters: ActiveParameter[]; clap_parameters: ActiveParameter[]; siglip_parameters: ActiveParameter[];
    text_view: "compact" | "standard" | "expanded"; clap_view: "compact" | "standard" | "expanded"; siglip_view: "compact" | "standard" | "expanded";
    show_clap: boolean; show_siglip: boolean; interpolate_clap: boolean; interpolate_siglip: boolean;
  };
  layers: { selected: string[]; timeline_view: "modality" | "layer"; stage2_visible: boolean; stage2_top_k: number; stage2_centroid_percent: number };
  interpolation: { pair: string; percent: number; curve: BlendCurve; blend_enabled: boolean; clap_weight: number; trust_threshold?: number; trust_floor?: number };
  vocal_matrix_mode: boolean;
  param_to_text: ParamTextWorkbenchSessionState | null;
  v3: {
    query: string; query_b: string; top_k: number; sources: { library: boolean; frozen: boolean; atoms: boolean; generated: boolean };
    scopes: { sound: boolean; structure: boolean; metadata: boolean; provenance: boolean; administrative: boolean }; search_mode: string; transition_ratio: number; search_results: ActiveParameter[];
    secondary_results: ActiveParameter[]; active_parameters: ActiveParameter[]; macro: string;
  };
}

export interface AmStageSessionSnapshot {
  schema: "am_stage_session_snapshot_v1";
  meta: { id: string; title: string; created_at: string; updated_at: string };
  data: AmStageSessionData;
}

export interface AmStageSessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  audio_name: string | null;
  segment_count: number;
  parameter_count: number;
  reverse_query_saved: boolean;
}
