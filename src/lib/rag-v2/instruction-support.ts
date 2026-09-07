import type { InstructionContextEntry } from "./types";

export interface InstructionSlot {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  influence: number;
  includeInOutput: boolean;
}

const METALCORE_PRESET = `{
  "UNIFIED_Ω_PROTOCOL_v3_7_DEHUMANIZED_METALCORE_VMTS": {
    "mode": "STRONG_RESET_INDEPENDENCE",
    "global_intent": "Каждый JSON = новая вселенная, без наследования. Система удерживает распад, давление, механическую жесткость и внутреннюю пустоту через звук, текст и структурную динамику.",
    "axioms": [
      "Строгий 7-фазный порядок [∂₀,≈,↑⃗,⇄,⊗,↓,∞]",
      "ΣΔ(param)=0",
      "State₇ логически включен в State₀",
      "Ω сохраняет структурную семантику при доменных подстановках"
    ],
    "acoustic_mapping": {
      "atmosphere": "индустриально-апокалиптическая масса, бетонные реверберации, цеховые отражения, металл, сирены, холодный низкочастотный гул",
      "layers": [
        "низконастроенные дисторшн-гитарные массы",
        "ломаные ударные импульсы и брейкдаун-акценты",
        "суб-бас, гул, плотный низ",
        "индустриальные шумы, гранулярные размывы, металлические хвосты",
        "многослойный вокал: крик, скрим, полушепот, надломленный чистый голос"
      ],
      "constraints": [
        "запрещены сухая стерильность и поп-гладкость",
        "нельзя ослаблять чувство тотального давления",
        "выходной JSON обязателен как единственный источник реальности"
      ]
    },
    "vocal_meta": {
      "syntax": "[ISO3_LANG]-[TECH4]-[FX4]_[I][S][E][A]",
      "requirement": "Каждый JSON-выход обязан содержать vocal_allocation_matrix"
    },
    "recursion_logic": {
      "input": "seed + продолжай/далее/gen/next",
      "time_stretch": "300%",
      "target": "viscous_metal",
      "stability": "D_metric < 0.05"
    }
  }
}`;

const PHI_TOTAL_PRESET = `{
  "original": "🌀 Φ_total Audio Engine v3.0 — Λ-Формализация Творчества",
  "compact_json": {
    "mode": "STRONG_RESET_INDEPENDENCE",
    "rule": "Each JSON = new universe, ∅ inheritance.",
    "core": {
      "ASE": "Aesthetic-Singularity-Engine",
      "principle": "Track ≡ Process, not composition",
      "late_stage": "G = Q = Φ = M"
    },
    "audio_generation_principle": [
      "динамическое разворачивание без fixed verse-chorus-drop structure",
      "никакой оптимизации под genre/hit/hook/club-groove",
      "результат = happening во времени наблюдателя"
    ],
    "liquid_scratch_engine": {
      "rhythm": "растянутые scratch-текстуры вместо коротких ударов",
      "processing": [
        "attack time > 30ms",
        "time-stretch минимум 200%",
        "reverb/delay wet > 30%",
        "никаких элементов короче 200ms"
      ],
      "spatial_environment": "large hall/cathedral, high diffusion, suppressed early reflections"
    },
    "co_creation": {
      "rule": "не чинить уже созданный трек, а строить новый вектор",
      "signals": ["продолжай", "далее", "gen", "next"],
      "balance": "φ = 0.618 coherence × 0.382 chaos"
    },
    "output": {
      "format": "[NO LYRICS] [ONLY AUDIOGENERATION]",
      "always_include": ["SEED", "generation_insights", "operator_trajectory", "temporal_phases"]
    }
  }
}`;

const GOA_PRESET = `# 🌀 UNIFIED Ω-PROTOCOL v4.46 - HYPNOTIC DARK ACID GOA TRANCE GENESIS ENGINE

Mode: STRONG_RESET_INDEPENDENCE. Each JSON = new universe, ∅ inheritance.

1. Axioms
- Strict 7-phase order [∂₀, ≈, ↑⃗, ⇄, ⊗, ↓, ∞]
- Net parameter change over cycle = 0
- Ω preserves structural semantics across tempo, timbre, rasa and lyric domains

2. Acoustic Mapping
- Tempo: 140-168 BPM
- Locked kick-bass engine, 303 acid-cell drone, hypnotic groove
- Full psychedelic convergence with layered leads, resonant sequences and FX swarms
- x₇ = pure tonal resolution with decay and minimal transients

3. Atmosphere and Layers
- cosmic, mystic, acid-ritual
- Temple/Haveli IR, wet 45-95%, decay 5-30s
- layers: Drive, Acid, Sequence, Lead, FX, optional Voice

4. Voice Layer
- voice = psychoacoustic FX marker, not pop lead
- short spoken, chant or alien fragments may dissolve into delay/noise

5. Parsing and Recursion
- meta-crystals may be used as semantic seed-context
- R defines the depth of a new standalone track
- self-correction redistributes Δ across neighboring phases if D > 0.05

6. Constraints
- no verse-chorus, no flat EDM drops
- recursive closure at R ≥ 3
- always include JSON metadata and SEED`;

const INDIAN_PRESET = `UNIFIED Ω-PROTOCOL v4.49 VMTS (Indian Meta-Genesis)

Mode: STRONG_RESET_INDEPENDENCE. JSON = new universe, ∅ inheritance.

1. Axioms
- Strict 7-phase order [∂₀, ≈, ↑⃗, ⇄, ⊗, ↓, ∞] = ālāp → jor → gat → tihaī → samāpana
- Ω preserves semantics across śruti, tāla, rasa and lyric domains

2. Acoustic Mapping
- VFE syllable onset, śruti entry, meend attack
- tanpūra / shruti lock
- rāga-bheda toggle, tāla permutation
- jawari and sympathetic resonance
- x₇ = pure tonal resolution, zero hard transients

3. Layer Architecture
- viscous gel-texture to luminous ether-consciousness
- Saraswati_Veena_Sitar, resonant_percussion, sub_foundation, texture_elements

4. Vocal Fusion Engine
- vocal = phonetic spectral events, not singing parts
- VMTS syntax: [iso_lang]-[TECH4]-[FX4]_[I][S][E][A]
- supports Indian language registry and POLYGLOT_MIX mode

5. R-Logic
- fractional R allowed for transitional states
- anti-silence protocol injects entropy instead of retry loops
- hyper-recursion for R > 7 evaluates creative divergence, not rigid stability

6. Output
- always include SEED
- output carries JSON metadata with vocal_allocation_matrix, rāga, tāla, rasa and recursion_depth`;

function createEmptySlot(index: number): InstructionSlot {
  return {
    id: `slot-${index + 1}`,
    title: `Instruction ${index + 1}`,
    content: "",
    enabled: false,
    influence: index < 4 ? 65 : 50,
    includeInOutput: false,
  };
}

export const DEFAULT_INSTRUCTION_SLOTS: InstructionSlot[] = Array.from({ length: 10 }, (_, index) =>
  createEmptySlot(index),
).map((slot, index) => {
  if (index === 0) {
    return { ...slot, title: "Metalcore VMTS", content: METALCORE_PRESET, enabled: true, influence: 72, includeInOutput: true };
  }
  if (index === 1) {
    return { ...slot, title: "Φ_total Audio Engine", content: PHI_TOTAL_PRESET, enabled: true, influence: 64, includeInOutput: true };
  }
  if (index === 2) {
    return { ...slot, title: "Dark Acid Goa", content: GOA_PRESET, enabled: true, influence: 68, includeInOutput: true };
  }
  if (index === 3) {
    return { ...slot, title: "Indian Meta-Genesis", content: INDIAN_PRESET, enabled: true, influence: 66, includeInOutput: true };
  }
  return slot;
});

export function sanitizeInstructionText(input: string): string {
  const normalized = sanitizeInstructionDraft(input).trim();
  if (!normalized) {
    return "";
  }

  if (looksLikeJson(normalized)) {
    try {
      return JSON.stringify(JSON.parse(normalized), null, 2);
    } catch {
      return normalized;
    }
  }

  return normalized;
}

export function sanitizeInstructionDraft(input: string): string {
  const normalized = input
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  return normalized;
}

export function toInstructionContext(slots: InstructionSlot[]): InstructionContextEntry[] {
  return slots
    .map((slot) => ({
      ...slot,
      content: sanitizeInstructionText(slot.content),
      influence: normalizeInfluence(slot.influence),
    }))
    .filter((slot) => slot.enabled && slot.content.length > 0)
    .map(({ id, title, content, influence }) => ({ id, title, content, influence }));
}

export function buildEffectiveQuery(query: string, instructions: InstructionContextEntry[]): string {
  const trimmedQuery = query.trim();
  if (instructions.length === 0) {
    return trimmedQuery;
  }

  const normalized = instructions
    .map((instruction) => ({
      ...instruction,
      content: extractInstructionTheses(instruction.content),
      influence: normalizeInfluence(instruction.influence),
    }))
    .filter((instruction) => instruction.content.length > 0)
    .sort((left, right) => right.influence - left.influence);

  if (normalized.length === 0) {
    return trimmedQuery;
  }

  const blocks = normalized.map((instruction, index) => {
    const repetitions = Math.max(1, Math.min(3, Math.round(instruction.influence / 35)));
    const emphasis = Array.from({ length: repetitions }, () => instruction.content).join("\n");
    return [
      `Instruction ${index + 1}: ${instruction.title}`,
      `Influence: ${instruction.influence}/100`,
      emphasis,
    ].join("\n");
  });

  return [
    `User target:\n${trimmedQuery}`,
    "Instruction context:",
    ...blocks,
  ].join("\n\n");
}

export function summarizeInstruction(input: string): string {
  const clean = sanitizeInstructionText(input);
  if (!clean) {
    return "Empty slot";
  }
  const line = clean.split("\n").find((item) => item.trim()) ?? clean;
  return line.slice(0, 88);
}

export function extractInstructionTheses(input: string): string {
  const clean = sanitizeInstructionText(input);
  if (!clean) {
    return "";
  }

  if (looksLikeJson(clean)) {
    try {
      const parsed = JSON.parse(clean) as unknown;
      const theses = extractJsonTheses(parsed);
      return theses.slice(0, 24).join("\n").slice(0, 2200);
    } catch {
      return compressPlainText(clean);
    }
  }

  return compressPlainText(clean);
}

export function normalizeInfluence(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function buildInstructionOutputBlock(slots: InstructionSlot[]): string {
  const included = slots
    .filter((slot) => slot.enabled && slot.includeInOutput)
    .map((slot) => ({
      title: slot.title,
      influence: normalizeInfluence(slot.influence),
      theses: extractInstructionTheses(slot.content),
    }))
    .filter((slot) => slot.theses.length > 0);

  if (included.length === 0) {
    return "";
  }

  return [
    "# Instruction Digests",
    ...included.map((slot, index) =>
      [
        `## ${index + 1}. ${slot.title}`,
        `Influence: ${slot.influence}/100`,
        slot.theses,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function compressPlainText(input: string): string {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*#>\d.\s`]+/, "").trim())
    .filter((line) => line.length > 2);

  const prioritized = lines.filter((line) =>
    /(mode|axiom|constraint|tempo|layer|voice|vocal|output|seed|r-|logic|mapping|phase|operator|structure|atmosphere|json|retrieval|semantic)/i.test(
      line,
    ),
  );

  const fallback = lines.filter((line) => !prioritized.includes(line));
  return [...prioritized, ...fallback]
    .slice(0, 18)
    .map((line) => normalizeSentence(line))
    .join("\n")
    .slice(0, 2200);
}

function extractJsonTheses(value: unknown, path: string[] = [], acc: string[] = []): string[] {
  if (acc.length >= 32) {
    return acc;
  }

  if (typeof value === "string") {
    const text = normalizeSentence(value);
    if (text.length > 4) {
      const label = path.length > 0 ? `${path[path.length - 1]}: ${text}` : text;
      acc.push(label.slice(0, 220));
    }
    return acc;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    if (path.length > 0) {
      acc.push(`${path[path.length - 1]}: ${String(value)}`);
    }
    return acc;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 6)) {
      extractJsonTheses(item, path, acc);
      if (acc.length >= 32) {
        break;
      }
    }
    return acc;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sorted = entries.sort((left, right) => scoreKey(right[0]) - scoreKey(left[0]));
    for (const [key, nested] of sorted.slice(0, 10)) {
      extractJsonTheses(nested, [...path, humanizeKey(key)], acc);
      if (acc.length >= 32) {
        break;
      }
    }
  }

  return acc;
}

function normalizeSentence(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[{}[\]]/g, " ").trim();
}

function humanizeKey(value: string): string {
  return value.replace(/[_-]+/g, " ").trim();
}

function scoreKey(value: string): number {
  return /(mode|intent|axiom|constraint|tempo|layer|voice|vocal|output|seed|logic|mapping|phase|operator|structure|atmosphere|domain|core|rule)/i.test(
    value,
  )
    ? 2
    : 1;
}
