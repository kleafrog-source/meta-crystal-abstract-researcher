export const RAG_V3_CONFIG = {
  thresholdRange: 0.25,
  thresholdSelect: 0.30,
  thresholdToggle: 0.20,
  softmaxTempExplicit: 0.02,
  softmaxTempDiffuse: 0.05,
  anchorChangeFraction: 0.30,
  relationAlphaBase: 0.15,
  relationAlphaMax: 0.25,
  enableLlmTextGeneration: false,
  enableSinkhorn: false,
  sinkhornEpsilon: 0.075,
  sinkhornIterations: 50,
} as const;
