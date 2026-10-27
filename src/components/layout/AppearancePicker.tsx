"use client";

import { useEffect, useState } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { applyAppearance, DEFAULT_APPEARANCE, normalizeAppearance, PALETTES, type AppearanceConfig, type PaletteId, type ThemeMode } from "@/lib/appearance";
import type { PageId } from "./Sidebar";

export function AppearancePicker({ page }: { page: PageId }) {
  const [config, setConfig] = useState<AppearanceConfig>(DEFAULT_APPEARANCE);
  const choice = config.activeByMode[page] ?? { palette: "emerald" as PaletteId, mode: "dark" as ThemeMode };
  useEffect(() => {
    let live = true;
    const refresh = () => void fetch("/api/appearance", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (!live) return;
      const next = normalizeAppearance(data.appearance);
      setConfig(next);
      const selected = next.activeByMode[page] ?? { palette: "emerald" as PaletteId, mode: "dark" as ThemeMode };
      applyAppearance(next, selected.palette, selected.mode);
    }).catch(() => applyAppearance(DEFAULT_APPEARANCE, "emerald", "dark"));
    refresh();
    window.addEventListener("appearance:changed", refresh);
    return () => { live = false; window.removeEventListener("appearance:changed", refresh); };
    // The active workspace mode has its own stored appearance.
  }, [page]);
  const select = (next: Partial<typeof choice>) => {
    const updated: AppearanceConfig = { ...config, activeByMode: { ...config.activeByMode, [page]: { ...choice, ...next } } };
    setConfig(updated);
    applyAppearance(updated, updated.activeByMode[page].palette, updated.activeByMode[page].mode);
    void fetch("/api/appearance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appearance: updated }) }).then(() => window.dispatchEvent(new Event("appearance:changed"))).catch(() => {});
  };
  return <div className="appearance-picker space-y-2 border-t border-border px-3 py-2" aria-label="Оформление">
    <div className="flex items-center justify-between" role="group" aria-label="Цветовой пресет">{PALETTES.map((palette) => <button key={palette.id} type="button" aria-label={`Пресет ${palette.label}`} aria-pressed={choice.palette === palette.id} title={palette.label} onClick={() => select({ palette: palette.id })} className="appearance-swatch" style={{ "--swatch": `hsl(${config.palettes[palette.id][choice.mode].activeHue} 68% 58%)` } as React.CSSProperties} />)}</div>
    <div className="flex items-center justify-center gap-2" role="group" aria-label="Цветовая тема">{([ ["dark", Moon, "Тёмная"], ["light", Sun, "Светлая"], ["medium", Contrast, "Средняя"] ] as const).map(([mode, Icon, label]) => <button key={mode} type="button" aria-label={label} aria-pressed={choice.mode === mode} title={label} onClick={() => select({ mode })} className={`appearance-mode ${choice.mode === mode ? "selected" : ""}`}><Icon className="size-4" /></button>)}</div>
  </div>;
}
