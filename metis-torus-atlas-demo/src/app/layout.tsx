import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "METIS · MMSS · Torus Atlas — Full Stack Demo v2",
  description:
    "Functional demo of METIS (native memory) + MMSS (modular architecture) + Torus Atlas (topological memory) + Crystal API + GDN + AMLS corrections. Replace stubs with your local models to test in production.",
  keywords: [
    "METIS",
    "MMSS",
    "Torus Atlas",
    "Crystal API",
    "Gated Delta Network",
    "native memory",
    "federated learning",
    "AMLS",
  ],
  authors: [{ name: "METIS-MMSS Stack" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
