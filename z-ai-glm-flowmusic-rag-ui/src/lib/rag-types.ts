// Shared TypeScript types for the RAG Parameter UI module.
// These mirror the JSON shape of the Flowmusic `parameters-dataset.json`
// and the contracts of the Next.js API routes that replace the FastAPI
// backend described in the original task spec.

/** UI element kinds present in the Flowmusic parameters dataset. */
export type UiElement =
  | "Range"
  | "Select"
  | "Toggle"
  | "Text"
  | "Array"
  | "String";

/** A single parameter as found in `parameters-dataset.json`. */
export interface RawParameter {
  technical_name: string;
  ui_element: UiElement;
  min_value?: number;
  max_value?: number;
  step?: number;
  /** number | string | number[] — depends on ui_element. */
  default: number | string | number[];
  unit?: string;
  /** Present for Select. */
  options?: string[];
  /** Present for Text / String. */
  min_length?: number;
  max_length?: number;
  lyria_prompt_tags: string[];
  semantic_keywords: string[];
}

/** Vectorization progress returned by `GET /api/vectorization-status`. */
export interface VectorizationStatus {
  total_parameters: number;
  vectorized_parameters: number;
  is_ready: boolean;
  is_vectorizing: boolean;
  processed_in_run: number;
  total_in_run: number;
  errors_in_run: number;
  used_fallback: boolean;
  ollama_reachable: boolean;
  last_error: string | null;
}

/** A parameter proposed by the semantic search, enriched with the
 *  RAG-suggested value (= default, since LLM is forbidden) and the
 *  editable `current_value` the user manipulates via sliders / selects. */
export interface ActiveParameter {
  technical_name: string;
  ui_element: UiElement;
  min_value?: number;
  max_value?: number;
  step?: number;
  /** Original default from the dataset. */
  default: number | string;
  /** Value suggested by the RAG step. Equal to `default` because LLM is
   *  forbidden — the user then fine-tunes it through the UI. */
  suggested_value: number | string;
  /** Live value the user is editing. Starts equal to `suggested_value`. */
  current_value: number | string;
  unit?: string;
  options?: string[];
  min_length?: number;
  max_length?: number;
  lyria_prompt_tags: string[];
  semantic_keywords: string[];
  /** Cosine similarity score (0..1) between the query embedding and the
   *  parameter embedding. Useful for ranking display. */
  similarity: number;
}

/** Body of `POST /api/propose-parameters`. */
export interface ProposeParametersRequest {
  query: string;
  /** How many top matches to return. Defaults to 25. */
  top_k?: number;
}

/** Response of `POST /api/propose-parameters`. */
export interface ProposeParametersResponse {
  query: string;
  used_fallback: boolean;
  total_vectorized: number;
  results: ActiveParameter[];
}

/** Body of `POST /api/generate-macro`. */
export interface GenerateMacroRequest {
  parameters: Array<{
    technical_name: string;
    current_value: number | string;
    unit?: string;
  }>;
}

/** Response of `POST /api/generate-macro`. */
export interface GenerateMacroResponse {
  macro: string;
  parameter_count: number;
}

/** Body of `POST /api/vectorize`. */
export interface VectorizeRequest {
  /** When true, reset every parameter to `is_vectorized=false` first and
   *  recompute embeddings for the whole dataset. */
  reset?: boolean;
}

/** Response of `POST /api/vectorize`. */
export interface VectorizeResponse {
  started: boolean;
  reason?: string;
  reset: boolean;
}
