export type ControlType = 'toggle' | 'number' | 'range' | 'radio' | 'select';

export interface ControlOption {
  label: string;
  value: string;
}

export interface MMSSParameter {
  id: string;
  label: string;
  type: ControlType;
  category: CategoryId;
  description: string;
  mmssMapping: string;
  defaultValue: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: ControlOption[];
  tags: string[];
}

export type CategoryId = 
  | 'axioms'
  | 'quantum'
  | 'phases'
  | 'acid_goa'
  | 'microtonal'
  | 'metacrystal'
  | 'lfe_voice'
  | 'r_logic'
  | 'metrics'
  | 'spatial'
  | 'acoustic'
  | 'liquid'
  | 'lfe'
  | 'recursion';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  symbol: string;
  description: string;
}

export interface PsyVibePreset {
  id: string;
  name: string;
  rasa: string;
  description: string;
  targetBpm: number;
  embeddingVectorSim: number;
  suggestedTags: string[];
  paramOverrides: Record<string, any>;
}

