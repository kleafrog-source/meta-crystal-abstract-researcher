"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { UI_COPY } from "./ui-copy";

export type UiLanguage = "en" | "ru" | "de";
const LocaleContext = createContext<UiLanguage>("ru");

export function UiLocaleProvider({ children, initialLanguage }: { children: React.ReactNode; initialLanguage: UiLanguage }) {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<{ language?: UiLanguage }>).detail?.language;
      if (next === "en" || next === "ru" || next === "de") setLanguage(next);
    };
    window.addEventListener("ui-preferences:changed", onChange);
    return () => window.removeEventListener("ui-preferences:changed", onChange);
  }, []);
  return <LocaleContext.Provider value={language}>{children}</LocaleContext.Provider>;
}

export function useUiLanguage() {
  return useContext(LocaleContext);
}

export function useUiText() {
  const language = useUiLanguage();
  return (source: string) => {
    const entry = UI_COPY[source];
    if (!entry) return source;
    return language === "ru" ? entry[1] : entry[0];
  };
}
