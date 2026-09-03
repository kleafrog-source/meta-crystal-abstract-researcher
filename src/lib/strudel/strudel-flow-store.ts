import { create } from "zustand";

export type StrudelNodeType = 
  | "oscillator"
  | "effect"
  | "sequencer"
  | "modifier"
  | "output";

export interface StrudelNodeData {
  label: string;
  description?: string;
  paramId: string;
  strudelId?: string;
  settings?: Record<string, unknown>;
  category?: string;
}

export interface StrudelNode {
  id: string;
  type: StrudelNodeType;
  position: { x: number; y: number };
  data: StrudelNodeData;
}

export interface StrudelEdge {
  id: string;
  source: string;
  target: string;
}

interface StrudelFlowState {
  nodes: StrudelNode[];
  edges: StrudelEdge[];
  addNode: (node: Omit<StrudelNode, "id">) => void;
  replaceNodes: (nodes: Array<Omit<StrudelNode, "id">>) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, data: Partial<StrudelNodeData>) => void;
  addEdge: (edge: Omit<StrudelEdge, "id">) => void;
  removeEdge: (edgeId: string) => void;
  clearFlow: () => void;
}

let nodeIdCounter = 0;
let edgeIdCounter = 0;

const generateNodeId = () => `node-${++nodeIdCounter}`;
const generateEdgeId = () => `edge-${++edgeIdCounter}`;

export const useStrudelFlowStore = create<StrudelFlowState>((set) => ({
  nodes: [],
  edges: [],
  
  addNode: (node) => {
    const newNode: StrudelNode = {
      ...node,
      id: generateNodeId(),
    };
    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));
  },

  replaceNodes: (nodes) => {
    nodeIdCounter = 0;
    edgeIdCounter = 0;
    set({
      nodes: nodes.map((node) => ({
        ...node,
        id: generateNodeId(),
      })),
      edges: [],
    });
  },
  
  removeNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
    }));
  },
  
  updateNode: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }));
  },
  
  addEdge: (edge) => {
    const newEdge: StrudelEdge = {
      ...edge,
      id: generateEdgeId(),
    };
    set((state) => ({
      edges: [...state.edges, newEdge],
    }));
  },
  
  removeEdge: (edgeId) => {
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== edgeId),
    }));
  },
  
  clearFlow: () => {
    nodeIdCounter = 0;
    edgeIdCounter = 0;
    set({ nodes: [], edges: [] });
  },
}));

export const useStore = useStrudelFlowStore;

/**
 * Helper function to map Strudel parameter to node type
 */
export function getNodeTypeForParam(paramId: string): StrudelNodeType {
  const oscillatorParams = ["sine", "sawtooth", "square", "triangle", "noise", "fm", "am"];
  const effectParams = ["gain", "lpf", "hpf", "crush", "distort", "delay", "reverb", "pan"];
  const sequencerParams = ["arp", "seq", "loop", "euclid", "mute", "chunk", "beat"];
  const modifierParams = ["slow", "fast", "stretch", "rand", "density", "transp", "scale", "chord", "note"];
  
  if (oscillatorParams.includes(paramId)) return "oscillator";
  if (effectParams.includes(paramId)) return "effect";
  if (sequencerParams.includes(paramId)) return "sequencer";
  if (modifierParams.includes(paramId)) return "modifier";
  
  return "output";
}

/**
 * Create a node from a semantic search result
 */
export function createNodeFromSearchResult(
  result: {
    id: string;
    name: string;
    description: string;
    category: string;
    score?: number;
    matched_phrase?: string | null;
    role?: string | null;
    priority?: number | null;
    sourceBlockId?: string | null;
    sourceBlockType?: string | null;
    sectionHints?: string[] | null;
  }
): Omit<StrudelNode, "id"> {
  const roleColumn: Record<string, number> = {
    drums: 0,
    bass: 1,
    harmony: 2,
    melody: 3,
    texture: 4,
  };
  const column = result.role ? (roleColumn[result.role] ?? 5) : 5;
  const priority = result.priority ?? nodeIdCounter;
  return {
    type: getNodeTypeForParam(result.id),
    position: {
      x: 120 + column * 180,
      y: 60 + (priority % 8) * 88,
    },
    data: {
      label: result.name,
      paramId: result.id,
      description: result.description,
      settings: {
        score: result.score ?? null,
        matchedPhrase: result.matched_phrase ?? null,
        role: result.role ?? null,
        priority: result.priority ?? null,
        sourceBlockId: result.sourceBlockId ?? null,
        sourceBlockType: result.sourceBlockType ?? null,
        sectionHints: result.sectionHints ?? null,
        addedAt: Date.now(),
      },
      category: result.category,
    },
  };
}
