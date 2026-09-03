export type UiElement =
  | "Range"
  | "Select"
  | "Toggle"
  | "Text"
  | "Array"
  | "String";

export interface RawParameter {
  technical_name: string;
  category?: string;
  sub_category?: string;
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
}

export interface VectorizationStatus {
  total_parameters: number;
  vectorized_parameters: number;
  is_ready: boolean;
  is_vectorizing: boolean;
  processed_in_run: number;
  total_in_run: number;
  errors_in_run: number;
  ollama_reachable: boolean;
  last_error: string | null;
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
  unit?: string;
  options?: string[];
  min_length?: number;
  max_length?: number;
  lyria_prompt_tags: string[];
  semantic_keywords: string[];
  similarity: number;
}

export interface ProposeParametersRequest {
  query: string;
  top_k?: number;
}

export interface ProposeParametersResponse {
  query: string;
  total_vectorized: number;
  results: ActiveParameter[];
}

export interface GenerateMacroRequest {
  parameters: Array<{
    technical_name: string;
    current_value: number | string;
    unit?: string;
  }>;
}

export interface GenerateMacroResponse {
  macro: string;
  parameter_count: number;
}

export interface VectorizeRequest {
  reset?: boolean;
}

export interface VectorizeResponse {
  started: boolean;
  reason?: string;
  reset: boolean;
}
