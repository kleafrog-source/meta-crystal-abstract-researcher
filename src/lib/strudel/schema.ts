export type StrudelCatalogParam = {
  raw: string;
  type: string | null;
  name: string | null;
  description: string;
};

export type StrudelCatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
  package: string;
  module: string;
  sourceFile: string;
  params: StrudelCatalogParam[];
  examples: string[];
  synonyms: string[];
  tags: string[];
  vector: number[];
};

export type StrudelProjectNode = {
  id: string;
  paramId: string;
  label: string;
  category?: string;
  type: string;
};

export type StrudelAppliedControl = {
  paramId: string;
  expression: string;
  reason: string;
};

export type StrudelProject = {
  schema: "mmss.strudel.project.v1";
  generatedAt: string;
  source: "selected-nodes";
  selectedNodeIds: string[];
  ignoredNodeIds: string[];
  nodes: StrudelProjectNode[];
  voice: {
    sound: string;
    noteMode: "note" | "scale";
  };
  fragments: {
    melodicBase: string;
    percussionBase: string;
    effectChain: string[];
  };
  transport: {
    cpm: number;
    beatsPerCycle: number;
    autoplay: boolean;
  };
  appliedControls: StrudelAppliedControl[];
  code: string;
};

export const STRUDEL_CATALOG_SCHEMA = {
  id: "mmss.strudel.catalog.entry.v1",
  fields: {
    id: "string",
    name: "string",
    description: "string",
    category: "string",
    package: "string",
    module: "string",
    sourceFile: "string",
    params: "array<param>",
    examples: "array<string>",
    synonyms: "array<string>",
    tags: "array<string>",
    vector: "array<number>",
  },
} as const;

export const STRUDEL_PROJECT_SCHEMA = {
  id: "mmss.strudel.project.v1",
  fields: {
    schema: "literal:mmss.strudel.project.v1",
    generatedAt: "ISO-8601 string",
    source: "literal:selected-nodes",
    selectedNodeIds: "array<string>",
    ignoredNodeIds: "array<string>",
    nodes: "array<projectNode>",
    voice: "object",
    transport: "object",
    appliedControls: "array<control>",
    code: "string",
  },
} as const;
