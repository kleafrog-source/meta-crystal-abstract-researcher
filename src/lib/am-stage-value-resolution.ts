import type { ActiveParameter } from "@/lib/rag-v3/types";

export function resolveGemmaIdentityValue(
  identity: ActiveParameter,
  valueSources: { sameWindowClap?: ActiveParameter; qwenAnchor?: ActiveParameter; anchorError?: string },
): ActiveParameter {
  const { sameWindowClap, qwenAnchor, anchorError } = valueSources;
  if (sameWindowClap) return {
    ...identity,
    suggested_value: sameWindowClap.suggested_value,
    current_value: sameWindowClap.current_value,
    before: sameWindowClap.before,
    source: "audio_similarity",
    value_confidence: sameWindowClap.value_confidence,
    detail: `Gemma identity · CLAP value reused from the same audio window · ${sameWindowClap.detail}`,
  };
  if (qwenAnchor) return {
    ...identity,
    suggested_value: qwenAnchor.suggested_value,
    current_value: qwenAnchor.current_value,
    before: qwenAnchor.before,
    source: qwenAnchor.source,
    value_confidence: qwenAnchor.value_confidence,
    detail: `Gemma identity · Qwen value-anchor pass · ${qwenAnchor.detail}`,
  };
  return {
    ...identity,
    suggested_value: identity.default,
    current_value: identity.default,
    before: identity.default,
    source: "default",
    detail: `Gemma identity · catalogue default fallback${anchorError ? ` · ${anchorError.slice(0, 180)}` : ""}`,
  };
}
