export type TrackStyle = "ambient" | "retro" | "industrial" | "idm" | "dub" | "tribal" | "default";
export type TrackRole = "drums" | "bass" | "harmony" | "melody" | "texture";
export type TrackSection = "intro" | "main" | "variation" | "break" | "return";
export type TrackDensity = "sparse" | "neutral" | "dense";
export type TrackIntensity = "soft" | "neutral" | "aggressive";

export type TrackPlan = {
  query: string;
  style: TrackStyle;
  bpm: number;
  scale: string;
  sections: TrackSection[];
  requiredRoles: TrackRole[];
  energyCurve: number[];
  density: TrackDensity;
  intensity: TrackIntensity;
  styleTags: string[];
};

const STYLE_HINTS: Record<TrackStyle, string[]> = {
  ambient: ["ambient", "drone", "haze", "dream", "floating", "spacious", "cinematic"],
  retro: ["retro", "game", "arcade", "chip", "8bit", "chiptune"],
  industrial: ["industrial", "metal", "harsh", "dark", "grit", "machine"],
  idm: ["idm", "glitch", "broken", "complex", "fractured"],
  dub: ["dub", "delay", "echo", "deep", "chord cloud"],
  tribal: ["tribal", "ritual", "percussion", "polyrhythm"],
  default: [],
};

function detectStyle(query: string): TrackStyle {
  const normalized = query.toLowerCase();
  for (const style of ["ambient", "retro", "industrial", "idm", "dub", "tribal"] as TrackStyle[]) {
    if (STYLE_HINTS[style].some((hint) => normalized.includes(hint))) {
      return style;
    }
  }
  return "default";
}

function detectRequiredRoles(query: string, style: TrackStyle): TrackRole[] {
  const normalized = query.toLowerCase();
  const roles = new Set<TrackRole>();
  if (["drum", "groove", "beat", "kick", "snare", "percussion", "rhythm"].some((token) => normalized.includes(token))) roles.add("drums");
  if (["bass", "sub", "low-end", "bassline"].some((token) => normalized.includes(token))) roles.add("bass");
  if (["harmony", "chord", "pad", "lush"].some((token) => normalized.includes(token))) roles.add("harmony");
  if (["lead", "melody", "motif", "arpeggio", "arp"].some((token) => normalized.includes(token))) roles.add("melody");
  if (["texture", "noise", "room", "space", "atmosphere"].some((token) => normalized.includes(token))) roles.add("texture");

  if (roles.size === 0) {
    roles.add("drums");
    roles.add("bass");
    roles.add("harmony");
    roles.add("melody");
  }
  if (style === "ambient" || style === "dub") {
    roles.add("texture");
    roles.add("harmony");
  }
  if (style === "tribal" || style === "idm") {
    roles.add("drums");
    roles.add("texture");
  }
  return [...roles];
}

function detectBpm(style: TrackStyle, intensity: TrackIntensity) {
  if (style === "retro") return 148;
  if (style === "ambient") return 72;
  if (style === "industrial") return 132;
  if (style === "idm") return 136;
  if (style === "dub") return 118;
  if (style === "tribal") return 126;
  return intensity === "aggressive" ? 132 : intensity === "soft" ? 96 : 118;
}

function detectScale(style: TrackStyle, intensity: TrackIntensity) {
  if (style === "retro") return "D4:dorian";
  if (style === "ambient") return "D4:minor";
  if (style === "industrial") return "C4:minor";
  if (style === "idm") return "E4:phrygian";
  if (style === "dub") return "F4:minor";
  if (style === "tribal") return "D4:dorian";
  return intensity === "soft" ? "A4:minor" : "C4:minor";
}

function detectIntensity(query: string): TrackIntensity {
  const normalized = query.toLowerCase();
  if (["aggressive", "heavy", "dark", "industrial", "acid", "distort", "sharp"].some((token) => normalized.includes(token))) return "aggressive";
  if (["soft", "warm", "gentle", "dream", "ambient", "drone"].some((token) => normalized.includes(token))) return "soft";
  return "neutral";
}

function detectDensity(query: string): TrackDensity {
  const normalized = query.toLowerCase();
  if (["polyrhythm", "dense", "busy", "complex", "tribal", "idm", "driving"].some((token) => normalized.includes(token))) return "dense";
  if (["sparse", "minimal", "slow", "drone"].some((token) => normalized.includes(token))) return "sparse";
  return "neutral";
}

function sectionsForStyle(style: TrackStyle): TrackSection[] {
  if (style === "ambient") return ["intro", "main", "break", "return"];
  return ["intro", "main", "variation", "break", "return"];
}

function energyCurveForStyle(style: TrackStyle, intensity: TrackIntensity) {
  if (style === "ambient") return [0.25, 0.58, 0.32, 0.66];
  if (style === "retro") return [0.35, 0.78, 0.86, 0.42, 0.92];
  if (style === "industrial") return [0.34, 0.82, 0.9, 0.38, 0.96];
  if (style === "idm") return [0.32, 0.74, 0.84, 0.36, 0.9];
  if (style === "dub") return [0.24, 0.62, 0.3, 0.72];
  if (style === "tribal") return [0.3, 0.78, 0.86, 0.44, 0.92];
  return intensity === "soft" ? [0.28, 0.6, 0.36, 0.7] : [0.32, 0.72, 0.82, 0.42, 0.9];
}

export function buildTrackPlan(query: string): TrackPlan {
  const style = detectStyle(query);
  const intensity = detectIntensity(query);
  const density = detectDensity(query);
  const sections = sectionsForStyle(style);
  return {
    query,
    style,
    bpm: detectBpm(style, intensity),
    scale: detectScale(style, intensity),
    sections,
    requiredRoles: detectRequiredRoles(query, style),
    energyCurve: energyCurveForStyle(style, intensity),
    density,
    intensity,
    styleTags: STYLE_HINTS[style] ?? [],
  };
}
