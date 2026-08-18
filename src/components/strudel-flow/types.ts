/**
 * Strudel RAG Types
 */

export type StrudelParam = {
  id: string;
  name: string;
  description: string;
  category: string;
  vector?: number[];
};

export type StrudelSearchResult = {
  id: string;
  name: string;
  description: string;
  category: string;
  score: number;
  matched_phrase?: string | null;
};

// Alias for backward compatibility and Crystal Bridge usage
export type StrudelSuggestion = StrudelSearchResult;

export type SemanticStrudelState = {
  query: string;
  results: StrudelSearchResult[];
  error: string | null;
  isLoading: boolean;
};

export type StrudelParamDBItem = StrudelParam & {
  vector: number[];
};
