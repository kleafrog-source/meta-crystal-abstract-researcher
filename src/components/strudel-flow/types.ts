/**
 * Strudel RAG Types
 */

export type StrudelParam = {
  id: string;
  name: string;
  description: string;
  category: string;
  package?: string;
  module?: string;
  params?: Array<{
    raw: string;
    type: string | null;
    name: string | null;
    description: string;
  }>;
  examples?: string[];
  synonyms?: string[];
  tags?: string[];
  vector?: number[];
};

export type StrudelSearchResult = {
  id: string;
  name: string;
  description: string;
  category: string;
  score: number;
  matched_phrase?: string | null;
  role?: string | null;
  priority?: number | null;
  sourceBlockId?: string | null;
  sourceBlockType?: string | null;
  sectionHints?: string[] | null;
};

export type StrudelTrackPlan = {
  style: string;
  bpm: number;
  scale: string;
  sections: string[];
  requiredRoles: string[];
  energyCurve: string[];
  density: string;
  intensity: string;
  styleTags: string[];
};

export type StrudelTransportPlan = {
  cpm: number;
  bpc: number;
  reason: string;
};

export type StrudelRoleBlockPreviewItem = {
  id: string;
  score: number;
  source_file: string;
  block_type: string;
  style_tags: string[];
  renderable_code: string;
};

export type StrudelSectionAssemblyItem = {
  id: string;
  name: string;
  role?: string | null;
  sourceBlockType?: string | null;
  priority?: number | null;
};

export type StrudelSectionAssemblyPlan = Array<{
  section: string;
  focus: string;
  items: StrudelSectionAssemblyItem[];
}>;

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
