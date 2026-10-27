export const PALETTES = [
  { id: "emerald", label: "Emerald", hue: 160 }, { id: "ocean", label: "Ocean", hue: 205 },
  { id: "amber", label: "Amber", hue: 42 }, { id: "violet", label: "Violet", hue: 274 },
  { id: "rose", label: "Rose", hue: 340 }, { id: "teal", label: "Teal", hue: 188 },
] as const;
export type PaletteId = typeof PALETTES[number]["id"];
export type ThemeMode = "dark" | "light" | "medium";
export interface PaletteConfig { backgroundHue: number; backgroundSaturation: number; backgroundIntensity: number; activeHue: number; activeSaturation: number; activeIntensity: number; badgeStyle: "soft" | "outline" | "solid"; badgeIntensity: number }
export interface AppearanceConfig { activeByMode: Record<string, { palette: PaletteId; mode: ThemeMode }>; palettes: Record<PaletteId, Record<ThemeMode, PaletteConfig>> }
export const DEFAULT_APPEARANCE: AppearanceConfig = {
  activeByMode: {},
  palettes: Object.fromEntries(PALETTES.map(({ id, hue }) => [id, {
    dark: { backgroundHue:hue, backgroundSaturation:18, backgroundIntensity:12, activeHue:hue, activeSaturation:64, activeIntensity:62, badgeStyle:"soft", badgeIntensity:35 },
    light: { backgroundHue:hue, backgroundSaturation:22, backgroundIntensity:97, activeHue:hue, activeSaturation:58, activeIntensity:43, badgeStyle:"soft", badgeIntensity:30 },
    medium: { backgroundHue:hue, backgroundSaturation:16, backgroundIntensity:43, activeHue:hue, activeSaturation:58, activeIntensity:60, badgeStyle:"outline", badgeIntensity:38 },
  }])) as AppearanceConfig["palettes"],
};

function safeConfig(value: unknown): AppearanceConfig {
  const raw = value as Partial<AppearanceConfig> | null;
  if (!raw?.palettes || typeof raw.palettes !== "object") return DEFAULT_APPEARANCE;
  const palettes = Object.fromEntries(PALETTES.map(({ id }) => [id, { ...DEFAULT_APPEARANCE.palettes[id] }])) as AppearanceConfig["palettes"];
  for (const preset of PALETTES) for (const mode of ["dark", "light", "medium"] as const) {
    const item = raw.palettes[preset.id]?.[mode];
    if (!item) continue;
    const base = palettes[preset.id][mode];
    palettes[preset.id][mode] = { ...base, ...item,
      backgroundHue: clamp(item.backgroundHue, 0, 360, base.backgroundHue), backgroundSaturation: clamp(item.backgroundSaturation, 0, 65, base.backgroundSaturation), backgroundIntensity: clamp(item.backgroundIntensity, 8, 98, base.backgroundIntensity),
      activeHue: clamp(item.activeHue, 0, 360, base.activeHue), activeSaturation: clamp(item.activeSaturation, 0, 90, base.activeSaturation), activeIntensity: clamp(item.activeIntensity, 28, 78, base.activeIntensity), badgeIntensity: clamp(item.badgeIntensity, 0, 70, base.badgeIntensity),
      badgeStyle: ["soft","outline","solid"].includes(item.badgeStyle) ? item.badgeStyle : base.badgeStyle };
  }
  const activeByMode = Object.fromEntries(Object.entries(raw.activeByMode ?? {}).flatMap(([mode, candidate]) => {
    if (!candidate || typeof candidate !== "object") return [];
    const choice = candidate as { palette?: string; mode?: string };
    return [[mode, { palette: PALETTES.some((p) => p.id === choice.palette) ? choice.palette : "emerald", mode: ["dark","light","medium"].includes(choice.mode ?? "") ? choice.mode : "dark" }]];
  }));
  return { palettes, activeByMode } as AppearanceConfig;
}
function clamp(value: number, min: number, max: number, fallback: number) { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback; }
export function normalizeAppearance(value: unknown) { try { return safeConfig(value); } catch { return DEFAULT_APPEARANCE; } }
export function applyAppearance(config: AppearanceConfig, palette: PaletteId, mode: ThemeMode) {
  const root = document.documentElement;
  const value = config.palettes[palette][mode];
  const bgL = value.backgroundIntensity;
  const light = mode === "light";
  const mid = mode === "medium";
  const fg = light ? 15 : mid ? 96 : 96;
  const card = light ? Math.max(88, bgL - 4) : mid ? Math.min(52, bgL + 5) : Math.min(25, bgL + 5);
  const surface = light ? Math.max(92, bgL - 1) : mid ? Math.min(57, bgL + 9) : Math.min(29, bgL + 9);
  const accentL = value.activeIntensity;
  const text = (n: number) => `hsl(${value.backgroundHue} ${Math.min(value.backgroundSaturation, 20)}% ${n}%)`;
  const accent = `hsl(${value.activeHue} ${value.activeSaturation}% ${accentL}%)`;
  const vars: Record<string,string> = {
    "--background":text(bgL), "--foreground":text(fg), "--card":text(card), "--card-foreground":text(fg),
    "--popover":text(surface), "--popover-foreground":text(fg), "--secondary":text(surface), "--secondary-foreground":text(fg),
    "--muted":text(surface), "--muted-foreground":light?text(38):text(68), "--accent":`hsl(${value.activeHue} ${value.activeSaturation}% ${light?88:mid?34:28}%)`,
    "--accent-foreground":text(fg), "--primary":accent, "--primary-foreground":light?"hsl(220 20% 98%)":"hsl(220 20% 8%)",
    "--border":`hsl(${value.backgroundHue} ${Math.min(30,value.backgroundSaturation+5)}% ${light?76:mid?61:31}% / .7)`,
    "--input":text(surface), "--ring":accent, "--sidebar":text(light?Math.max(90,bgL-3):Math.max(7,bgL-3)), "--badge-fill-soft":`${value.badgeIntensity * .35}%`, "--badge-fill-solid":`${value.badgeIntensity}%`,
    "--sidebar-foreground":text(fg), "--sidebar-primary":accent, "--sidebar-primary-foreground":"hsl(220 20% 8%)",
    "--sidebar-accent":text(surface), "--sidebar-accent-foreground":text(fg), "--sidebar-border":`hsl(${value.backgroundHue} 15% ${light?77:34}% / .65)`, "--sidebar-ring":accent,
  };
  for (const [name, color] of Object.entries(vars)) root.style.setProperty(name, color);
  root.classList.toggle("dark", !light);
  root.dataset.appearancePalette = palette;
  root.dataset.appearanceMode = mode;
  root.dataset.badgeStyle = value.badgeStyle;
  root.style.colorScheme = light ? "light" : "dark";
}
