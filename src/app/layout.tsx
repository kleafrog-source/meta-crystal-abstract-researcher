import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { UiLocaleProvider, type UiLanguage } from "@/lib/ui-i18n";

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

async function getInitialUiLanguage(): Promise<UiLanguage> {
  const cookieLanguage = (await cookies()).get("am_locale")?.value;
  if (cookieLanguage === "en" || cookieLanguage === "ru" || cookieLanguage === "de") return cookieLanguage;
  const row = await db.setting.findUnique({ where: { key: "ui_preferences_v1" } });
  if (row) {
    try {
      const value = JSON.parse(row.value) as { language?: unknown };
      if (value.language === "en" || value.language === "ru" || value.language === "de") return value.language;
    } catch {
      // Invalid saved preference falls back to Russian.
    }
  }
  return "ru";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language = await getInitialUiLanguage();
  return (
    <html lang={language} data-ui-language={language} className="dark" suppressHydrationWarning>
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
        <UiLocaleProvider key={language} initialLanguage={language}>{children}</UiLocaleProvider>
        <Toaster />
      </body>
    </html>
  );
}
