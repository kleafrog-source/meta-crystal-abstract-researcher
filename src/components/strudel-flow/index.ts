/**
 * Strudel RAG Module Exports
 * 
 * Central export point for all Strudel RAG components and utilities.
 */

export { SemanticStrudelSuggester } from "./SemanticStrudelSuggester";
export type {
  StrudelParam,
  StrudelSearchResult,
  SemanticStrudelState
} from "./types";
export {
  useStrudelFlowStore,
  getNodeTypeForParam,
  createNodeFromSearchResult,
  type StrudelNodeType,
  type StrudelNodeData,
  type StrudelNode
} from "@/lib/strudel/strudel-flow-store";

// Crystal Bridge exports
export { CrystalBridgePanel } from "./crystal-bridge/CrystalBridgePanel";
export {
  MetaCrystalState,
  CrystalBridgeResult,
  BridgeConfig,
  CrystalToStrudelBridge,
  createCrystalBridge,
  generateQueryFromCrystal
} from "@/lib/strudel/CrystalToStrudelBridge";
