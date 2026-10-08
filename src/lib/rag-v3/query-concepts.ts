const CONCEPT_STOPWORDS = new Set([
  "и", "в", "на", "с", "по", "для", "это", "звук", "сделай", "создай",
  "the", "a", "an", "of", "to", "in", "and", "with", "sound", "make", "create",
]);

export interface QueryConcept {
  text: string;
  idf: number;
  weight: number;
}

export function conceptTokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
    .filter((token) => token.length > 1 && !CONCEPT_STOPWORDS.has(token));
}

function splitConcepts(query: string): string[] {
  const protectedWithout = query
    .replace(/\bwithout\s+/giu, "; without ")
    .replace(/\bбез\s+/giu, "; без ");
  return protectedWithout
    .split(/[,;.\n]+|\b(?:and|with|plus)\b|\b(?:и|плюс|вместе с)\b/giu)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function decomposeQuery(query: string, documentTexts: string[]): QueryConcept[] {
  const frequency = new Map<string, number>();
  for (const document of documentTexts) {
    for (const token of new Set(conceptTokens(document))) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  const documentCount = Math.max(1, documentTexts.length);
  const score = (text: string) => {
    const tokens = conceptTokens(text);
    if (!tokens.length) return 0;
    return tokens.reduce((sum, token) => sum + Math.log((documentCount + 1) / ((frequency.get(token) ?? 0) + 1)) + 1, 0) / tokens.length;
  };
  const parts = splitConcepts(query);
  const unique = new Map<string, QueryConcept>();
  const add = (text: string, whole: boolean) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized || unique.has(normalized.toLowerCase())) return;
    const idf = score(normalized);
    if (!whole && idf < 1.2) return;
    unique.set(normalized.toLowerCase(), {
      text: normalized,
      idf,
      weight: whole ? 1 : Math.max(0.7, Math.min(1, idf / 5)),
    });
  };
  add(query, true);
  if (parts.length > 1) for (const part of parts) add(part, false);
  return [...unique.values()].slice(0, 8);
}
