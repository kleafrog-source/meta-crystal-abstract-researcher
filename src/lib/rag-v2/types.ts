export type UiElement =
  | "Range"
  | "Select"
  | "Toggle"
  | "Text"
  | "Array"
  | "String";

export interface EnrichedParameter {
  technical_name: string;
  category: string;
  sub_category: string;
  ui_element: UiElement;
  min_value?: number;
  max_value?: number;
  step?: number;
  default: number | string | number[];
  unit?: string;
  options?: string[];
  min_length?: number;
  max_length?: number;
  lyria_prompt_tags: string[];
  semantic_keywords: string[];
  domain?: string | null;
  axes: string[];
  quantity_kind?: string | null;
  polarity_override?: number | null;
  vibe_id?: string | null;
  select_typing?: "nominal" | "ordinal" | null;
  option_positions?: Array<{ value: string; position: number }> | null;
  option_aliases?: Record<string, string[]> | null;
}

export interface ActiveParameter {
  technical_name: string;
  category: string;
  sub_category: string;
  ui_element: UiElement;
  min_value?: number;
  max_value?: number;
  step?: number;
  default: number | string;
  suggested_value: number | string;
  current_value: number | string;
  before: number | string;
  source: "numeric" | "lexical" | "axis" | "default" | "neutral";
  detail: string;
  unit?: string;
  options?: string[];
  min_length?: number;
  max_length?: number;
  lyria_prompt_tags: string[];
  semantic_keywords: string[];
  similarity: number;
  domain?: string | null;
  quantity_kind?: string | null;
  axes: string[];
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
  current_values?: Record<string, number | string>;
}

export interface ProposeParametersResponse {
  query: string;
  results: ActiveParameter[];
  total_candidates: number;
  total_scoped: number;
  retrieval_cache_size: number;
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
