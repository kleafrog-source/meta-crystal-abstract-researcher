import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
