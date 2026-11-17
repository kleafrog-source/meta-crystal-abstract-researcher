export type TextLimitUnit = "chars" | "codepoints" | "words";
export type TextTruncation = "hard" | "ellipsis" | "word_boundary";

export interface TextLimitResult {
  text: string;
  originalLength: number;
  finalLength: number;
  truncated: boolean;
  unit: TextLimitUnit;
}

export function countTextUnits(text: string, unit: TextLimitUnit): number {
  if (unit === "codepoints") return [...text].length;
  if (unit === "words") return text.split(/\s+/u).filter(Boolean).length;
  return text.length;
}

export function limitAutomationText(text: string, options: { maxChars: number; unit: TextLimitUnit; truncation: TextTruncation }): TextLimitResult {
  if (!Number.isFinite(options.maxChars) || options.maxChars < 1) throw new Error("text.limit maxChars must be a positive number.");
  if (!["chars", "codepoints", "words"].includes(options.unit)) throw new Error("text.limit unit is invalid.");
  if (!["hard", "ellipsis", "word_boundary"].includes(options.truncation)) throw new Error("text.limit truncation is invalid.");
  const originalLength = countTextUnits(text, options.unit);
  if (originalLength <= options.maxChars) return { text, originalLength, finalLength: originalLength, truncated: false, unit: options.unit };
  let sliced = options.unit === "codepoints" ? [...text].slice(0, options.maxChars).join("")
    : options.unit === "words" ? text.split(/\s+/u).filter(Boolean).slice(0, options.maxChars).join(" ")
    : text.slice(0, options.maxChars);
  if (options.truncation === "word_boundary" && options.unit !== "words") {
    const boundary = Math.max(sliced.lastIndexOf(" "), sliced.lastIndexOf("\n"));
    if (boundary > 0) sliced = sliced.slice(0, boundary);
  }
  if (options.truncation === "ellipsis") sliced = `${sliced.replace(/\s+$/u, "")}…`;
  return { text: sliced, originalLength, finalLength: countTextUnits(sliced, options.unit), truncated: true, unit: options.unit };
}

export interface AssembleTextPart { artifactId: string | null; text: string }
export interface AssembleTextResult { text: string; sources: string[]; missingIndexes: number[] }

export function assembleAutomationText(parts: AssembleTextPart[], options: {
  template: string;
  separator: string;
  missingPolicy: "skip" | "placeholder" | "error";
  includeSourceRefs: boolean;
}): AssembleTextResult {
  if (!parts.length) throw new Error("text.assemble requires at least one bound part.");
  if (!["skip", "placeholder", "error"].includes(options.missingPolicy)) throw new Error("text.assemble missingPolicy is invalid.");
  const sources: string[] = [];
  const bodies: string[] = [];
  const missingIndexes: number[] = [];
  for (const [index, part] of parts.entries()) {
    const body = part.text.trim();
    if (!body) {
      missingIndexes.push(index);
      if (options.missingPolicy === "error") throw new Error(`ASSEMBLE_MISSING_PART: part ${index} is empty.`);
      if (options.missingPolicy === "placeholder") bodies.push("[missing]");
      continue;
    }
    bodies.push(part.text);
    if (part.artifactId) sources.push(part.artifactId);
  }
  let text = options.template.trim()
    ? options.template.replace(/\{(\d+)\}/gu, (match, rawIndex: string) => bodies[Number(rawIndex)] ?? (options.missingPolicy === "placeholder" ? "[missing]" : match))
    : bodies.join(options.separator);
  if (options.includeSourceRefs && sources.length) text = `${text}\nИсточники: ${sources.join(", ")}`;
  return { text, sources, missingIndexes };
}
