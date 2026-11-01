import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/AppShell";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { UiLanguage } from "@/lib/ui-i18n";

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

async function getInitialUiLanguage(): Promise<{ language: UiLanguage; hasLocaleCookie: boolean; hasSavedPreference: boolean }> {
  const cookieStore = await cookies();
  const cookieLanguage = cookieStore.get("am_locale")?.value;
  if (cookieLanguage === "en" || cookieLanguage === "ru" || cookieLanguage === "de") return { language: cookieLanguage, hasLocaleCookie: true, hasSavedPreference: true };

  // Compatibility fallback for installations that saved language before locale cookies.
  const row = await db.setting.findUnique({ where: { key: "ui_preferences_v1" } });
  if (row) {
    try {
      const value = JSON.parse(row.value) as { language?: unknown };
      if (value.language === "en" || value.language === "ru" || value.language === "de") return { language: value.language, hasLocaleCookie: false, hasSavedPreference: true };
    } catch {
      // Invalid preference data falls back to Russian.
    }
  }
  return { language: "ru", hasLocaleCookie: false, hasSavedPreference: false };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { language, hasLocaleCookie, hasSavedPreference } = await getInitialUiLanguage();
  return (
    <html lang={language} data-ui-language={language} data-ui-locale-cookie={hasLocaleCookie ? "present" : "missing"} data-ui-has-saved-locale={hasSavedPreference ? "true" : "false"} className="dark" suppressHydrationWarning>
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
        <AppShell initialLanguage={language} />
        <Toaster />
      </body>
    </html>
  );
}
