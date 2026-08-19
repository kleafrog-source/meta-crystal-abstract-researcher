import type { StrudelFlowProjectState } from "@/lib/strudel";

export const STRUDEL_EDITOR_SEED_KEY = "mmss.strudel-editor.seed";

export function saveStrudelEditorSeed(state: StrudelFlowProjectState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STRUDEL_EDITOR_SEED_KEY, JSON.stringify(state));
}

export function loadStrudelEditorSeed(): StrudelFlowProjectState | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(STRUDEL_EDITOR_SEED_KEY);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as StrudelFlowProjectState;
  } catch {
    return null;
  }
}

export function clearStrudelEditorSeed() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STRUDEL_EDITOR_SEED_KEY);
}
