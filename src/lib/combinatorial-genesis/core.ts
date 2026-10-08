export type GenesisTokenRole = "descriptor" | "concept" | "property" | "unit";

export interface GenesisSourceParameter {
  technical_name: string;
}

export interface GenesisAtomicToken {
  token: string;
  frequency: number;
  roles: GenesisTokenRole[];
  source_parameters: string[];
  semantic_score?: number;
}

export interface GenesisCandidate {
  technical_name: string;
  tokens: string[];
  parent_parameters: string[];
  structural_score: number;
  atom_semantic_score: number;
  token_provenance: Array<{
    token: string;
    role: GenesisTokenRole;
    source_parameters: string[];
  }>;
}

export interface GenesisGeneratorConfig {
  seed?: number;
  max_candidates?: number;
  min_tokens?: 3 | 4 | 5;
  max_tokens?: 3 | 4 | 5;
}

const UNIT_TOKENS = new Set([
  "bpm", "db", "deg", "hz", "j", "joule", "joules", "kg", "khz",
  "m", "m2", "m3", "mm", "ms", "pa", "pascal", "percent", "rad",
  "sec", "second", "seconds", "w", "watt", "watts",
]);

const PROPERTY_TOKENS = new Set([
  "amount", "angle", "bandwidth", "bias", "ceiling", "coefficient",
  "count", "curvature", "decay", "density", "depth", "distance", "duration",
  "energy", "entropy", "exponent", "factor", "floor", "flux", "frequency",
  "gain", "gradient", "index", "intensity", "knee", "level", "mass",
  "modulus", "momentum", "period", "phase", "power", "pressure", "probability",
  "q", "radius", "range", "rate", "ratio", "release", "resonance", "slope",
  "speed", "stress", "threshold", "thickness", "time", "velocity", "viscosity",
  "volume", "weight", "width",
]);

const DESCRIPTOR_TOKENS = new Set([
  "acoustic", "adaptive", "algorithmic", "binaural", "cavitation", "chaotic",
  "dynamic", "fluid", "fractal", "generative", "geometric", "glottal",
  "granular", "guttural", "harmonic", "hydraulic", "hydrodynamic", "infrasonic",
  "kinematic", "liquid", "macro", "micro", "nonlinear", "phonetic", "quantum",
  "resonant", "spectral", "stereo", "structural", "subharmonic", "viscoelastic",
  "viscous", "vocal",
]);

function normalizeName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function classifyToken(token: string, index: number): GenesisTokenRole {
  if (UNIT_TOKENS.has(token)) return "unit";
  if (PROPERTY_TOKENS.has(token)) return "property";
  if (DESCRIPTOR_TOKENS.has(token) || index < 2) return "descriptor";
  return "concept";
}

function stableNumber(value: string, seed: number): number {
  let hash = seed | 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export class TokenDecomposer {
  decompose(parameters: GenesisSourceParameter[]): GenesisAtomicToken[] {
    const records = new Map<
      string,
      { frequency: number; roles: Set<GenesisTokenRole>; sources: Set<string> }
    >();

    for (const parameter of parameters) {
      const technicalName = normalizeName(parameter.technical_name);
      if (!technicalName) continue;

      const tokens = technicalName.split("_").filter((token) => token.length > 1);
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const record = records.get(token) ?? {
          frequency: 0,
          roles: new Set<GenesisTokenRole>(),
          sources: new Set<string>(),
        };
        record.frequency += 1;
        record.roles.add(classifyToken(token, index));
        record.sources.add(technicalName);
        records.set(token, record);
      }
    }

    return Array.from(records.entries())
      .map(([token, record]) => ({
        token,
        frequency: record.frequency,
        roles: Array.from(record.roles).sort(),
        source_parameters: Array.from(record.sources).sort(),
      }))
      .sort(
        (left, right) =>
          right.frequency - left.frequency || left.token.localeCompare(right.token),
      );
  }
}

function poolForRole(
  tokens: GenesisAtomicToken[],
  role: GenesisTokenRole,
  limit: number,
): GenesisAtomicToken[] {
  return tokens.filter((token) => token.roles.includes(role)).slice(0, limit);
}

function candidateParents(tokens: GenesisAtomicToken[]): string[] {
  return Array.from(new Set(tokens.flatMap((token) => token.source_parameters)))
    .sort()
    .slice(0, 8);
}

function structuralScore(tokens: GenesisAtomicToken[], parentCount: number): number {
  const frequencyScore = tokens.reduce((sum, token) => sum + Math.log1p(token.frequency), 0);
  const semanticScore = tokens.reduce((sum, token) => sum + (token.semantic_score ?? 0), 0);
  const coverageScore = Math.min(parentCount, 4) * 2;
  return Number((frequencyScore + semanticScore * 2 + coverageScore).toFixed(3));
}

export function mergeAtomicTokens(
  primary: GenesisAtomicToken[],
  supplemental: GenesisAtomicToken[],
): GenesisAtomicToken[] {
  const merged = new Map<string, GenesisAtomicToken>();
  for (const token of [...supplemental, ...primary]) {
    const current = merged.get(token.token);
    if (!current) {
      merged.set(token.token, {
        ...token,
        roles: [...token.roles],
        source_parameters: [...token.source_parameters],
      });
      continue;
    }
    current.frequency = Math.max(current.frequency, token.frequency);
    current.semantic_score = Math.max(current.semantic_score ?? 0, token.semantic_score ?? 0);
    current.roles = Array.from(new Set([...current.roles, ...token.roles])).sort();
    current.source_parameters = Array.from(
      new Set([...current.source_parameters, ...token.source_parameters]),
    ).sort();
  }
  return Array.from(merged.values()).sort(
    (left, right) =>
      (right.semantic_score ?? 0) - (left.semantic_score ?? 0) ||
      right.frequency - left.frequency ||
      left.token.localeCompare(right.token),
  );
}

export class CombinatorialGenerator {
  generate(
    atomicTokens: GenesisAtomicToken[],
    existingNames: Iterable<string>,
    config: GenesisGeneratorConfig = {},
  ): GenesisCandidate[] {
    const seed = Number.isFinite(config.seed) ? Math.trunc(config.seed ?? 0) : 0;
    const maxCandidates = Math.max(1, Math.min(500, config.max_candidates ?? 50));
    const minTokens = config.min_tokens ?? 3;
    const maxTokens = config.max_tokens ?? 5;
    const known = new Set(Array.from(existingNames, normalizeName));
    const descriptors = poolForRole(atomicTokens, "descriptor", 64);
    const concepts = poolForRole(atomicTokens, "concept", 64);
    const properties = poolForRole(atomicTokens, "property", 48);

    if (descriptors.length === 0 || concepts.length === 0 || properties.length === 0) {
      return [];
    }

    const allTemplates: GenesisTokenRole[][] = [
      ["descriptor", "concept", "property"],
      ["descriptor", "concept", "concept", "property"],
      ["descriptor", "descriptor", "concept", "property"],
      ["descriptor", "concept", "concept", "concept", "property"],
    ];
    const templates = allTemplates.filter(
      (template) => template.length >= minTokens && template.length <= maxTokens,
    );

    const pools: Record<"descriptor" | "concept" | "property", GenesisAtomicToken[]> = {
      descriptor: descriptors,
      concept: concepts,
      property: properties,
    };
    const candidates = new Map<string, GenesisCandidate>();
    const attempts = Math.max(400, maxCandidates * 40);

    for (let attempt = 0; attempt < attempts && candidates.size < maxCandidates * 4; attempt += 1) {
      for (let templateIndex = 0; templateIndex < templates.length; templateIndex += 1) {
        const template = templates[templateIndex];
        const selected = template.map((role, position) => {
          const pool = pools[role as keyof typeof pools];
          const offset = stableNumber(`${attempt}:${templateIndex}:${position}`, seed);
          return pool[offset % pool.length];
        });
        const names = selected.map((token) => token.token);
        if (new Set(names).size !== names.length) continue;

        const technicalName = names.join("_");
        if (known.has(technicalName) || candidates.has(technicalName)) continue;

        const parents = candidateParents(selected);
        if (parents.length < 2) continue;

        candidates.set(technicalName, {
          technical_name: technicalName,
          tokens: names,
          parent_parameters: parents,
          structural_score: structuralScore(selected, parents.length),
          atom_semantic_score: Number(
            (selected.reduce((sum, token) => sum + (token.semantic_score ?? 0), 0) / selected.length)
              .toFixed(6),
          ),
          token_provenance: selected.map((token, index) => ({
            token: token.token,
            role: template[index],
            source_parameters: token.source_parameters.slice(0, 24),
          })),
        });
      }
    }

    return Array.from(candidates.values())
      .sort(
        (left, right) =>
          right.structural_score - left.structural_score ||
          left.technical_name.localeCompare(right.technical_name),
      )
      .slice(0, maxCandidates);
  }
}
