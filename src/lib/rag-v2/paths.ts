import path from "node:path";

export const RAG_V2_DIR = path.join(
  process.cwd(),
  "z-ai-glm-flowmusic-rag-ui-v2",
);

export const RAG_V2_ANCHORING_DIR = path.join(RAG_V2_DIR, "anchoring");
export const RAG_V2_DATASET_PATH = path.join(
  RAG_V2_ANCHORING_DIR,
  "unified_parameters_enriched.json",
);
export const RAG_V2_AXES_PATH = path.join(RAG_V2_ANCHORING_DIR, "axes.json");
export const RAG_V2_POLARITY_PATH = path.join(
  RAG_V2_ANCHORING_DIR,
  "polarity_matrix.json",
);
export const RAG_V2_ANCHORS_PATH = path.join(
  RAG_V2_ANCHORING_DIR,
  "anchors_build.json",
);
export const RAG_V2_LEXICAL_DIR = path.join(RAG_V2_ANCHORING_DIR, "lexical");
export const RAG_V2_CALIBRATION_STRONG_PATH = path.join(
  RAG_V2_ANCHORING_DIR,
  "calibration",
  "strong_set.json",
);
export const RAG_V2_CALIBRATION_NEUTRAL_PATH = path.join(
  RAG_V2_ANCHORING_DIR,
  "calibration",
  "neutral_set.json",
);
export const RAG_V2_RETRIEVAL_INDEX_PATH = path.join(
  RAG_V2_ANCHORING_DIR,
  "retrieval_index.json",
);
