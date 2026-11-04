"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { UI_COPY } from "./ui-copy";
import { DEFAULT_CAPABILITY_REGISTRY, setActiveModelAliases, substituteModelNames, type CapabilityRegistry } from "./capability-registry";

export type UiLanguage = "en" | "ru" | "de";

// UI text is translated and model-labeled; inputs, code/logs, parameter cards, and export payloads are excluded.
const LocaleContext = createContext<{ language: UiLanguage; aliases: CapabilityRegistry }>({ language: "ru", aliases: DEFAULT_CAPABILITY_REGISTRY });
const usePrePaintEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function UiLocaleProvider({ children, initialLanguage }: { children: React.ReactNode; initialLanguage: UiLanguage }) {
  const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
  const [aliases, setAliases] = useState<CapabilityRegistry>(DEFAULT_CAPABILITY_REGISTRY);
  const originals = useRef(new WeakMap<Text, string>());
  const translatedNodes = useRef(new WeakMap<Text, string>());
  const attrOriginals = useRef(new WeakMap<Element, Map<string, string>>());
  const translatedAttributes = useRef(new WeakMap<Element, Map<string, string>>());
  usePrePaintEffect(() => {
    setLanguage(initialLanguage);
  }, [initialLanguage]);
  useEffect(() => {
    let active = true;
    void fetch("/api/settings", { cache: "no-store" }).then((response) => response.json()).then((payload) => {
      if (active) setAliases(setActiveModelAliases(payload.llm?.capabilityRegistry));
    }).catch(() => undefined);
    const onAliases = (event: Event) => {
      const registry = setActiveModelAliases((event as CustomEvent<{ registry?: unknown }>).detail?.registry);
      setAliases(registry);
    };
    window.addEventListener("am-model-aliases:changed", onAliases);
    return () => { active = false; window.removeEventListener("am-model-aliases:changed", onAliases); };
  }, []);
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
    const ignored = "script,style,code,pre,textarea,[contenteditable='true'],[data-no-ui-translation],[data-parameter-data],[data-parameter-id],[data-export-payload]";
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
      const aliased = substituteModelNames(trimmed, aliases);
      const entry = UI_COPY[trimmed] ?? UI_COPY[aliased];
      const translated = entry?.[language === "en" || language === "de" ? 0 : 1];
      const displayText = translated ?? aliased;
      if (displayText !== trimmed) {
        const leading = source.slice(0, source.length - source.trimStart().length);
        const trailing = source.slice(source.trimEnd().length);
        const value = `${leading}${displayText}${trailing}`;
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
        const aliased = substituteModelNames(normalized, aliases);
        const entry = UI_COPY[normalized] ?? UI_COPY[aliased];
        const translated = entry?.[language === "en" || language === "de" ? 0 : 1]
          ?? (language !== "ru" && normalized.startsWith("Удалить ") ? `Delete ${normalized.slice("Удалить ".length)}` : undefined)
          ?? (language !== "ru" && normalized.startsWith("Выбрать ") ? `Select ${normalized.slice("Выбрать ".length)}` : undefined)
          ?? (language === "ru" && normalized.startsWith("Delete ") ? `Удалить ${normalized.slice("Delete ".length)}` : undefined)
          ?? (language === "ru" && normalized.startsWith("Select ") ? `Выбрать ${normalized.slice("Select ".length)}` : undefined);
        const displayText = translated ?? aliased;
        if (displayText !== normalized) {
          priorTranslations.set(name, displayText);
          if (current !== displayText) element.setAttribute(name, displayText);
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
  }, [aliases, language]);

  return <LocaleContext.Provider value={{ language, aliases }}>{children}</LocaleContext.Provider>;
}

export function useUiText() {
  const { language, aliases } = useContext(LocaleContext);
  return (source: string) => {
    const entry = UI_COPY[source];
    const translated = entry ? language === "ru" ? entry[1] : entry[0] : source;
    return substituteModelNames(translated, aliases);
  };
}

export function useUiLanguage() {
  return useContext(LocaleContext).language;
}

export function useModelAliases() {
  return useContext(LocaleContext).aliases;
}
