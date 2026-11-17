export type UiElement =
  | "Range"
  | "Select"
  | "Toggle"
  | "Text"
  | "Array"
  | "String";

export type RetrievalScope = "sound" | "structure" | "metadata" | "provenance" | "administrative";
export type ParameterValue = string | number | boolean | null | ParameterValue[] | { [key: string]: ParameterValue };
export type ValueSelectionStatus = "selected" | "selected_matches_default" | "selection_uncertain" | "domain_unavailable" | "artifacts_required" | "not_attempted" | "error" | "legacy_unknown";

export interface EnrichedParameter {
  technical_name: string;
  name_ru?: string;
  description_en?: string;
  description_ru?: string;
  category: string;
  sub_category: string;
  ui_element: UiElement;
  min_value?: number;
  max_value?: number;
  step?: number;
  default: ParameterValue | undefined;
  value_candidates?: ParameterValue[];
  published_values?: ParameterValue[];
  value_schema?: Record<string, ParameterValue>;
  item_schema?: Record<string, ParameterValue>;
  unit?: string;
  options?: ParameterValue[];
  min_length?: number;
  max_length?: number;
  lyria_prompt_tags: string[];
  semantic_keywords: string[];
  domain?: string | null;
  domain_layer?: string;
  axes: string[];
  quantity_kind?: string | null;
  polarity_override?: number | null;
  vibe_id?: string | null;
  select_typing?: "nominal" | "ordinal" | null;
  option_positions?: Array<{ value: string; position: number }> | null;
  option_aliases?: Record<string, string[]> | null;
  retrieval_scope: RetrievalScope;
}

export interface ActiveParameter {
  technical_name: string;
  name_ru?: string;
  description_en?: string;
  description_ru?: string;
  category: string;
  sub_category: string;
  ui_element: UiElement;
  min_value?: number;
  max_value?: number;
  step?: number;
  default: string | number | undefined;
  catalogue_default?: ParameterValue;
  suggested_value: string | number | undefined;
  selected_value?: ParameterValue;
  input_value?: ParameterValue;
  current_value: string | number | undefined;
  before?: ParameterValue;
  value_status?: ValueSelectionStatus;
  selection_detail?: string;
  selection_evidence?: Record<string, ParameterValue>;
  source: "numeric" | "value_anchor" | "morpho_value_anchor" | "embedding_candidate" | "lexical" | "relation" | "axis" | "retrieval" | "not_generated" | "unselected" | "default" | "neutral" | "audio_similarity" | "consensus" | "transition" | "stage2" | "manual";
  value_confidence?: number;
  anchor_target?: ParameterValue | undefined;
  detail: string;
  unit?: string;
  options?: string[];
  value_candidates?: ParameterValue[];
  published_values?: ParameterValue[];
  value_schema?: Record<string, ParameterValue>;
  item_schema?: Record<string, ParameterValue>;
  min_length?: number;
  max_length?: number;
  lyria_prompt_tags: string[];
  semantic_keywords: string[];
  similarity: number;
  domain?: string | null;
  domain_layer?: string;
  quantity_kind?: string | null;
  axes: string[];
  retrieval_scope: RetrievalScope;
  excluded?: boolean;
  retrieval_group?: "selected_layer" | "global_fill";
}

export interface InstructionContextEntry {
  id: string;
  title: string;
  content: string;
  influence: number;
}

export interface StatusResponse {
  artifacts_ready: boolean;
  total_parameters: number;
  anchors_stub: boolean;
  axes_enabled: boolean;
  ollama_reachable: boolean;
  ollama_model: string;
  ollama_base_url: string;
  probe_timeout_ms: number;
  embed_timeout_ms: number;
  anchors_generated_at: string | null;
  retrieval_index_ready: boolean;
  retrieval_index_count: number;
  retrieval_index_generated_at: string | null;
  retrieval_index_model: string | null;
  retrieval_cache_size: number;
  retrieval_job: {
    running: boolean;
    started_at: number;
    finished_at: number;
    exit_code: number | null;
    last_error: string | null;
    log_tail: string[];
    progress: {
      stage: string | null;
      current: number;
      total: number;
      label: string | null;
    };
  };
  anchors_job: {
    running: boolean;
    started_at: number;
    finished_at: number;
    exit_code: number | null;
    last_error: string | null;
    log_tail: string[];
    progress: {
      stage: string | null;
      current: number;
      total: number;
      label: string | null;
    };
  };
  required_files: Array<{ name: string; exists: boolean }>;
  last_error: string | null;
}

export interface ProposeParametersRequest {
  query: string;
  top_k?: number;
  current_values?: Record<string, ParameterValue>;
  instruction_context?: InstructionContextEntry[];
  scopes?: Partial<Record<RetrievalScope, boolean>>;
  domain_layers?: string[];
  domain_layer_weights?: Record<string, number>;
}

export interface ProposeParametersResponse {
  query: string;
  effective_query?: string;
  results: ActiveParameter[];
  total_candidates: number;
  total_scoped: number;
  retrieval_cache_size: number;
  domain_retrieval?: {
    layer_bias_applied: boolean;
    mmr_lambda: number;
    selected_layers: string[];
    selected_target: number;
    selected_available: number;
    selected_returned: number;
    global_fill_returned: number;
    selected_shortfall: number;
    selected_layer_candidate_counts: Record<string, number>;
  };
}

export interface GenerateMacroRequest {
  parameters: Array<{
    technical_name: string;
    current_value: number | string;
  }>;
}

export interface GenerateMacroResponse {
  macro: string;
  parameter_count: number;
}
