"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUiText } from "@/lib/ui-i18n";

type RenderingPreferences = { disableCustomSidebarIcons: boolean; disableColorPresets: boolean };
const DEFAULTS: RenderingPreferences = { disableCustomSidebarIcons: false, disableColorPresets: false };

function readCachedPreferences(): RenderingPreferences | null {
  try {
    const cached = JSON.parse(localStorage.getItem("am_ui_rendering_preferences") ?? "null") as Partial<RenderingPreferences> | null;
    return cached ? { disableCustomSidebarIcons: cached.disableCustomSidebarIcons === true, disableColorPresets: cached.disableColorPresets === true } : null;
  } catch { return null; }
}

export function UiRenderingPreferences() {
  const t = useUiText();
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/ui-preferences", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load UI preferences.");
      const value = await response.json() as Partial<RenderingPreferences> & { hasSavedCustomSidebarIcons?: boolean; hasSavedColorPresets?: boolean };
      const cached = readCachedPreferences();
      const next = {
        disableCustomSidebarIcons: value.hasSavedCustomSidebarIcons === true ? value.disableCustomSidebarIcons === true : cached?.disableCustomSidebarIcons ?? DEFAULTS.disableCustomSidebarIcons,
        disableColorPresets: value.hasSavedColorPresets === true ? value.disableColorPresets === true : cached?.disableColorPresets ?? DEFAULTS.disableColorPresets,
      };
      setPreferences(next);
      applyRenderingPreferences(next);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false));
  }, []);

  const update = async (key: keyof RenderingPreferences, checked: boolean) => {
    const previous = preferences;
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    applyRenderingPreferences(next);
    setError("");
    try {
      const response = await fetch("/api/ui-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error("Could not save UI preferences.");
      const saved = await response.json() as RenderingPreferences;
      setPreferences({ disableCustomSidebarIcons: saved.disableCustomSidebarIcons === true, disableColorPresets: saved.disableColorPresets === true });
      applyRenderingPreferences(saved);
      window.dispatchEvent(new CustomEvent("ui-preferences:changed", { detail: saved }));
    } catch (cause) {
      setPreferences(previous);
      applyRenderingPreferences(previous);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return <Card>
    <CardHeader><CardTitle>{t("Interface rendering")}</CardTitle><CardDescription>{t("Temporarily disable custom graphics or saved color preset overrides. Your saved presets remain unchanged.")}</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={preferences.disableCustomSidebarIcons} disabled={loading} onChange={(event) => void update("disableCustomSidebarIcons", event.target.checked)} /><span><span className="font-medium">{t("Disable custom sidebar icons")}</span><span className="block text-xs text-muted-foreground">{t("Hide AM-Core custom icons and logo throughout the interface.")}</span></span></label>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={preferences.disableColorPresets} disabled={loading} onChange={(event) => void update("disableColorPresets", event.target.checked)} /><span><span className="font-medium">{t("Disable color presets")}</span><span className="block text-xs text-muted-foreground">{t("Do not apply saved palette and theme overrides; use the standard interface colors.")}</span></span></label>
      {error ? <p role="alert" className="text-xs text-destructive">{t(error)}</p> : null}
    </CardContent>
  </Card>;
}

export function applyRenderingPreferences(preferences: RenderingPreferences) {
  const root = document.documentElement;
  root.dataset.customIconsDisabled = String(preferences.disableCustomSidebarIcons);
  root.dataset.colorPresetsDisabled = String(preferences.disableColorPresets);
  try {
    localStorage.setItem("am_ui_rendering_preferences", JSON.stringify(preferences));
  } catch {
    // Server persistence remains authoritative when local storage is unavailable.
  }
  window.dispatchEvent(new Event("appearance:changed"));
}
