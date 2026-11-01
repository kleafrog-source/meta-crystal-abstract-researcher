export interface ModalityTrustConfig {
  /** Scores below this trust are scaled down toward floorWeight. */
  lowTrustThreshold: number;
  /** Minimum multiplier retained for a low-trust modality. */
  floorWeight: number;
  /** Value disagreement above this normalized delta blocks consensus smoothing. */
  divergenceThreshold: number;
}

export const DEFAULT_MODALITY_TRUST_CONFIG: Readonly<ModalityTrustConfig> = {
  lowTrustThreshold: 0.2,
  floorWeight: 0.15,
  divergenceThreshold: 0.35,
};

export function normalizeModalityTrustConfig(config: ModalityTrustConfig = DEFAULT_MODALITY_TRUST_CONFIG): ModalityTrustConfig {
  return {
    lowTrustThreshold: clamp(config.lowTrustThreshold, 0, 1),
    floorWeight: clamp(config.floorWeight, 0, 1),
    divergenceThreshold: clamp(config.divergenceThreshold, 0, 1),
  };
}

export interface ModalityTrust {
  trust: number;
  normalizedEntropy: number;
  sampleCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

/** Normalized softmax entropy over already-computed retrieval scores; no model calls. */
export function computeModalityTrust(scores: number[], temperature = 0.1): ModalityTrust {
  const finite = scores.filter(Number.isFinite);
  if (finite.length === 0) return { trust: 0, normalizedEntropy: 1, sampleCount: 0 };
  if (finite.length === 1) return { trust: 1, normalizedEntropy: 0, sampleCount: 1 };

  const safeTemperature = Math.max(0.001, Number.isFinite(temperature) ? temperature : 0.1);
  const maximum = Math.max(...finite);
  const exponents = finite.map((score) => Math.exp(Math.max(-60, (score - maximum) / safeTemperature)));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return { trust: 0, normalizedEntropy: 1, sampleCount: finite.length };
  const entropy = exponents.reduce((sum, value) => {
    const probability = value / total;
    return probability > 0 ? sum - probability * Math.log(probability) : sum;
  }, 0);
  const normalizedEntropy = clamp(entropy / Math.log(finite.length), 0, 1);
  return { trust: clamp(1 - normalizedEntropy, 0, 1), normalizedEntropy, sampleCount: finite.length };
}

export function modalityTrustWeight(trust: number, config: ModalityTrustConfig = DEFAULT_MODALITY_TRUST_CONFIG): number {
  const normalizedConfig = normalizeModalityTrustConfig(config);
  const threshold = normalizedConfig.lowTrustThreshold;
  const floor = normalizedConfig.floorWeight;
  const safeTrust = clamp(trust, 0, 1);
  if (threshold === 0 || safeTrust >= threshold) return 1;
  return floor + (1 - floor) * (safeTrust / threshold);
}

/** Applies trust to baseline weights and normalizes them, with finite-safe defaults. */
export function computeTrustAdjustedWeights(
  firstBaseWeight: number,
  firstTrust: number,
  secondTrust: number,
  config: ModalityTrustConfig = DEFAULT_MODALITY_TRUST_CONFIG,
): { first: number; second: number } {
  const firstBase = clamp(firstBaseWeight, 0, 1);
  const first = firstBase * modalityTrustWeight(firstTrust, config);
  const second = (1 - firstBase) * modalityTrustWeight(secondTrust, config);
  const total = first + second;
  if (!Number.isFinite(total) || total <= 0) return { first: firstBase, second: 1 - firstBase };
  return { first: first / total, second: second / total };
}

export interface ParameterValueEvidence {
  value: number | string;
  min?: number;
  max?: number;
  discrete?: boolean;
}

/** Numeric values use the shared declared range; discrete values use exact agreement. */
export function parameterDivergence(first: ParameterValueEvidence, second: ParameterValueEvidence): number {
  if (!first.discrete && !second.discrete && typeof first.value === "number" && typeof second.value === "number") {
    if (!Number.isFinite(first.value) || !Number.isFinite(second.value)) return 1;
    const sharedMin = Number.isFinite(first.min) && Number.isFinite(second.min)
      ? Math.max(first.min!, second.min!)
      : undefined;
    const sharedMax = Number.isFinite(first.max) && Number.isFinite(second.max)
      ? Math.min(first.max!, second.max!)
      : undefined;
    const sharedRange = sharedMin !== undefined && sharedMax !== undefined && sharedMax > sharedMin
      ? sharedMax - sharedMin
      : Math.max(
        Number.isFinite(first.min) && Number.isFinite(first.max) ? Math.abs(first.max! - first.min!) : 0,
        Number.isFinite(second.min) && Number.isFinite(second.max) ? Math.abs(second.max! - second.min!) : 0,
        Math.abs(first.value),
        Math.abs(second.value),
        1,
      );
    return clamp(Math.abs(first.value - second.value) / sharedRange, 0, 1);
  }
  return first.value === second.value ? 0 : 1;
}

export function parameterTrustEvidence(parameter: {
  current_value: number | string;
  min_value?: number;
  max_value?: number;
  ui_element?: string;
}): ParameterValueEvidence {
  return { value: parameter.current_value, min: parameter.min_value, max: parameter.max_value, discrete: parameter.ui_element !== undefined && parameter.ui_element !== "Range" };
}
