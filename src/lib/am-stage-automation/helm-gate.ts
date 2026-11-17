export function helmArtifactConfirmsVocals(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as { actionId?: unknown; data?: unknown };
  if (artifact.actionId !== "audio.analyze_helm" || !artifact.data || typeof artifact.data !== "object" || Array.isArray(artifact.data)) return false;
  const data = artifact.data as { side_meta?: unknown };
  if (!data.side_meta || typeof data.side_meta !== "object" || Array.isArray(data.side_meta)) return false;
  const sideMeta = data.side_meta as { helm?: unknown };
  if (!sideMeta.helm || typeof sideMeta.helm !== "object" || Array.isArray(sideMeta.helm)) return false;
  const helm = sideMeta.helm as { gates?: unknown };
  if (!helm.gates || typeof helm.gates !== "object" || Array.isArray(helm.gates)) return false;
  const gates = helm.gates as { has_vocals?: unknown };
  if (!gates.has_vocals || typeof gates.has_vocals !== "object" || Array.isArray(gates.has_vocals)) return false;
  return (gates.has_vocals as { value?: unknown }).value === true;
}
