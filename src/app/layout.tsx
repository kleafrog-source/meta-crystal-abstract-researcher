import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/AppShell";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { UiLanguage } from "@/lib/ui-i18n";

type UiRenderingPreferences = {
  disableCustomSidebarIcons: boolean;
  disableColorPresets: boolean;
};
type SavedUiRenderingPreferences = { customIcons: boolean; colorPresets: boolean };
const DEFAULT_RENDERING_PREFERENCES: UiRenderingPreferences = {
  disableCustomSidebarIcons: false,
  disableColorPresets: false,
};

export const metadata: Metadata = {
  title: "Abstract-Mindfreak — AM-Core",
  description:
    "AM-Core: семантический, комбинаторный и мультимодальный поиск параметров звукового синтеза.",
  keywords: [
    "мета-кристалл",
    "комбинаторная алхимия",
    "LLM",
    "RAG",
    "Ollama",
    "FastAPI",
    "Next.js",
  ],
  authors: [{ name: "Мета-Кристалл v7.2" }],
};

async function getInitialUiPreferences(): Promise<{
  language: UiLanguage;
  hasLocaleCookie: boolean;
  hasSavedPreference: boolean;
  rendering: UiRenderingPreferences;
  savedRenderingPreferences: SavedUiRenderingPreferences;
}> {
  const cookieStore = await cookies();
  const cookieLanguage = cookieStore.get("am_locale")?.value;
  const row = await db.setting.findUnique({ where: { key: "ui_preferences_v1" } });
  let saved: { language?: unknown; disableCustomSidebarIcons?: unknown; disableColorPresets?: unknown } = {};
  if (row) {
    try {
      saved = JSON.parse(row.value) as typeof saved;
    } catch {
      // Invalid preferences use safe defaults.
    }
  }
  const validLanguage = (value: unknown): value is UiLanguage => value === "en" || value === "ru" || value === "de";
  const language = validLanguage(cookieLanguage)
    ? cookieLanguage
    : validLanguage(saved.language) ? saved.language : "ru";
  return {
    language,
    hasLocaleCookie: validLanguage(cookieLanguage),
    hasSavedPreference: validLanguage(cookieLanguage) || validLanguage(saved.language),
    rendering: {
      disableCustomSidebarIcons: saved.disableCustomSidebarIcons === true,
      disableColorPresets: saved.disableColorPresets === true,
    },
    savedRenderingPreferences: {
      customIcons: typeof saved.disableCustomSidebarIcons === "boolean",
      colorPresets: typeof saved.disableColorPresets === "boolean",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { language, hasLocaleCookie, hasSavedPreference, rendering, savedRenderingPreferences } = await getInitialUiPreferences();
  const fallbackPreferencesScript = savedRenderingPreferences.customIcons && savedRenderingPreferences.colorPresets ? null : `try { const p = JSON.parse(localStorage.getItem("am_ui_rendering_preferences") || "null"); if (p && typeof p === "object") { const r = document.documentElement; if (r.dataset.uiHasSavedCustomIcons !== "true" && typeof p.disableCustomSidebarIcons === "boolean") r.dataset.customIconsDisabled = String(p.disableCustomSidebarIcons); if (r.dataset.uiHasSavedColorPresets !== "true" && typeof p.disableColorPresets === "boolean") r.dataset.colorPresetsDisabled = String(p.disableColorPresets); } } catch {}`;
  return (
    <html lang={language} data-ui-language={language} data-ui-locale-cookie={hasLocaleCookie ? "present" : "missing"} data-ui-has-saved-locale={hasSavedPreference ? "true" : "false"} data-custom-icons-disabled={String(rendering.disableCustomSidebarIcons)} data-color-presets-disabled={String(rendering.disableColorPresets)} data-ui-has-saved-custom-icons={String(savedRenderingPreferences.customIcons)} data-ui-has-saved-color-presets={String(savedRenderingPreferences.colorPresets)} className="dark" suppressHydrationWarning>
      <head>{fallbackPreferencesScript ? <script dangerouslySetInnerHTML={{ __html: fallbackPreferencesScript }} /> : null}</head>
      <body
        className="antialiased bg-background text-foreground"
        style={
          {
            "--font-geist-sans":
              '"Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif',
            "--font-geist-mono":
              '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
          } as React.CSSProperties
        }
      >
        <AppShell initialLanguage={language} initialRenderingPreferences={rendering} savedRenderingPreferences={savedRenderingPreferences} />
        <Toaster />
      </body>
    </html>
  );
}
