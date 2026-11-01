"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { UI_COPY } from "./ui-copy";

export type UiLanguage = "en" | "ru" | "de";

// Exact UI copy only. Values, parameter data, logs, and export payloads are excluded.
const LocaleContext = createContext<UiLanguage>("ru");
const usePrePaintEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function UiLocaleProvider({ children, initialLanguage }: { children: React.ReactNode; initialLanguage: UiLanguage }) {
  const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
  const originals = useRef(new WeakMap<Text, string>());
  const translatedNodes = useRef(new WeakMap<Text, string>());
  const attrOriginals = useRef(new WeakMap<Element, Map<string, string>>());
  const translatedAttributes = useRef(new WeakMap<Element, Map<string, string>>());
  usePrePaintEffect(() => {
    setLanguage(initialLanguage);
  }, [initialLanguage]);
  useEffect(() => {
    const fromEvent = (event: Event) => {
      const value = (event as CustomEvent<{ language?: UiLanguage }>).detail?.language;
      if (value === "en" || value === "ru" || value === "de") setLanguage(value);
    };
    window.addEventListener("ui-preferences:changed", fromEvent);
    return () => window.removeEventListener("ui-preferences:changed", fromEvent);
  }, []);

  usePrePaintEffect(() => {
    if (document.documentElement.dataset.uiLocaleCookie !== "present" && document.documentElement.dataset.uiHasSavedLocale !== "true") {
      try {
        const stored = window.localStorage.getItem("am_locale");
        if ((stored === "en" || stored === "ru" || stored === "de") && stored !== language) {
          setLanguage(stored);
          return;
        }
      } catch {
        // Storage may be unavailable; continue with the server preference.
      }
    }
    document.documentElement.lang = language;
    document.documentElement.dataset.uiLanguage = language;
    const ignored = "script,style,code,pre,textarea,[contenteditable='true'],[data-no-ui-translation],[data-parameter-data],[data-export-payload]";
    const translateText = (node: Text) => {
      if (node.parentElement?.closest(ignored)) return;
      const current = node.nodeValue ?? "";
      const previousTranslation = translatedNodes.current.get(node);
      let source = originals.current.get(node);
      if (source == null || (previousTranslation != null && current !== previousTranslation)) {
        source = current;
        originals.current.set(node, source);
      }
      const trimmed = source.trim();
      const entry = UI_COPY[trimmed];
      const translated = entry?.[language === "en" || language === "de" ? 0 : 1];
      if (translated != null) {
        const leading = source.slice(0, source.length - source.trimStart().length);
        const trailing = source.slice(source.trimEnd().length);
        const value = `${leading}${translated}${trailing}`;
        translatedNodes.current.set(node, value);
        if (current !== value) node.nodeValue = value;
      }
    };
    const translateElement = (element: Element) => {
      if (element.closest(ignored)) return;
      const attrs = attrOriginals.current.get(element) ?? new Map<string, string>();
      const priorTranslations = translatedAttributes.current.get(element) ?? new Map<string, string>();
      for (const name of ["title", "placeholder", "aria-label"]) {
        const current = element.getAttribute(name);
        const previousTranslation = priorTranslations.get(name);
        if (current != null && (!attrs.has(name) || (previousTranslation != null && current !== previousTranslation))) attrs.set(name, current);
        const value = attrs.get(name) ?? current;
        if (value == null) continue;
        const normalized = value.trim();
        const entry = UI_COPY[normalized];
        const translated = entry?.[language === "en" || language === "de" ? 0 : 1]
          ?? (language !== "ru" && normalized.startsWith("Удалить ") ? `Delete ${normalized.slice("Удалить ".length)}` : undefined)
          ?? (language !== "ru" && normalized.startsWith("Выбрать ") ? `Select ${normalized.slice("Выбрать ".length)}` : undefined)
          ?? (language === "ru" && normalized.startsWith("Delete ") ? `Удалить ${normalized.slice("Delete ".length)}` : undefined)
          ?? (language === "ru" && normalized.startsWith("Select ") ? `Выбрать ${normalized.slice("Select ".length)}` : undefined);
        if (translated != null) {
          priorTranslations.set(name, translated);
          if (current !== translated) element.setAttribute(name, translated);
        }
      }
      attrOriginals.current.set(element, attrs);
      translatedAttributes.current.set(element, priorTranslations);
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
        else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element);
      }
    };
    translateElement(document.body);
    document.documentElement.dataset.uiReady = "true";
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target.nodeType === Node.TEXT_NODE) translateText(record.target as Text);
        for (const node of Array.from(record.addedNodes)) {
          if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element);
        }
        if (record.type === "attributes" && record.target instanceof Element) translateElement(record.target);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder", "aria-label"] });
    return () => observer.disconnect();
  }, [language]);

  return <LocaleContext.Provider value={language}>{children}</LocaleContext.Provider>;
}

export function useUiText() {
  const language = useContext(LocaleContext);
  return (source: string) => {
    const entry = UI_COPY[source];
    if (!entry) return source;
    return language === "ru" ? entry[1] : entry[0];
  };
}

export function useUiLanguage() {
  return useContext(LocaleContext);
}
