import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_INSTRUCTION_SLOTS,
  normalizeInfluence,
  sanitizeInstructionDraft,
  toInstructionContext,
  type InstructionSlot,
} from "@/lib/rag-v2/instruction-support";
import type {
  ActiveParameter,
  ProposeParametersResponse,
  StatusResponse,
  UiElement,
} from "@/lib/rag-v2/types";

type SearchMode = "single" | "transition";
type SearchTarget = "primary" | "secondary";
type TopKOption = 30 | 50;

interface RagV2State {
  status: StatusResponse | null;
  statusLoading: boolean;
  statusError: string | null;
  query: string;
  queryB: string;
  topK: TopKOption;
  searchMode: SearchMode;
  transitionRatio: number;
  instructionSlots: InstructionSlot[];
  instructionSettingsSavedAt: number | null;
  searchResults: ActiveParameter[];
  secondaryResults: ActiveParameter[];
  activeParameters: ActiveParameter[];
  isSearching: boolean;
  searchError: string | null;
  macro: string;
  isGeneratingMacro: boolean;
  macroError: string | null;
  fetchStatus: () => Promise<void>;
  startBuildIndex: () => Promise<void>;
  startBuildAnchors: () => Promise<void>;
  proposeParameters: (query: string, target?: SearchTarget) => Promise<void>;
  applyTransitionBlend: () => void;
  setQuery: (query: string) => void;
  setQueryB: (query: string) => void;
  setTopK: (topK: TopKOption) => void;
  setSearchMode: (mode: SearchMode) => void;
  setTransitionRatio: (ratio: number) => void;
  updateInstructionSlot: (
    slotId: string,
    updates: Partial<Pick<InstructionSlot, "title" | "content" | "enabled" | "influence" | "includeInOutput">>,
  ) => void;
  saveInstructionSlots: () => void;
  resetInstructionSlots: () => void;
  updateParameterValue: (technicalName: string, value: number | string) => void;
  removeParameter: (technicalName: string) => void;
  clearActiveParameters: () => void;
  generateMacro: () => Promise<void>;
}

function mergeActiveParameters(
  previous: ActiveParameter[],
  incoming: ActiveParameter[],
): ActiveParameter[] {
  const previousMap = new Map(previous.map((parameter) => [parameter.technical_name, parameter]));
  return incoming.map((parameter) => {
    const existing = previousMap.get(parameter.technical_name);
    if (!existing) {
      return parameter;
    }

    return {
      ...parameter,
      current_value: existing.current_value,
      before: existing.current_value,
    };
  });
}

function normalizeRatio(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeNumeric(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, min: number, step?: number): number {
  if (!step || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
  const rounded = min + Math.round((value - min) / step) * step;
  return Number(rounded.toFixed(decimals));
}

function blendValue(
  a: number | string,
  b: number | string,
  ratio: number,
  uiElement: UiElement,
  min?: number,
  max?: number,
  step?: number,
): number | string {
  const aNum = normalizeNumeric(a);
  const bNum = normalizeNumeric(b);
  if (aNum === null || bNum === null) {
    return ratio < 0.5 ? a : b;
  }

  if (uiElement === "Toggle") {
    return ratio < 0.5 ? Math.round(aNum) : Math.round(bNum);
  }

  const next = aNum + (bNum - aNum) * ratio;
  const rounded = roundToStep(next, min ?? 0, step);
  if (typeof min === "number" && typeof max === "number") {
    return clamp(rounded, min, max);
  }
  return rounded;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildTransitionResults(
  primary: ActiveParameter[],
  secondary: ActiveParameter[],
  ratioPercent: number,
  limit: number,
): ActiveParameter[] {
  const ratio = normalizeRatio(ratioPercent) / 100;
  const primaryMap = new Map(primary.map((item) => [item.technical_name, item]));
  const secondaryMap = new Map(secondary.map((item) => [item.technical_name, item]));
  const names = uniq([...primaryMap.keys(), ...secondaryMap.keys()]);

  const blended = names.map((name) => {
    const fromA = primaryMap.get(name);
    const fromB = secondaryMap.get(name);
    const score =
      ((fromA?.similarity ?? 0) * (1 - ratio)) + ((fromB?.similarity ?? 0) * ratio);

    if (fromA && fromB) {
      const preferred = ratio < 0.5 ? fromA : fromB;
      const min =
        typeof fromA.min_value === "number" ? fromA.min_value : fromB.min_value;
      const max =
        typeof fromA.max_value === "number" ? fromA.max_value : fromB.max_value;
      const step =
        typeof fromA.step === "number" ? fromA.step : fromB.step;
      const blendedValue = blendValue(
        fromA.suggested_value,
        fromB.suggested_value,
        ratio,
        preferred.ui_element,
        min,
        max,
        step,
      );
      const currentValue = blendValue(
        fromA.current_value,
        fromB.current_value,
        ratio,
        preferred.ui_element,
        min,
        max,
        step,
      );

      return {
        parameter: {
          ...preferred,
          suggested_value: blendedValue,
          current_value: currentValue,
          before: fromA.current_value,
          similarity: score,
          semantic_keywords: uniq([
            ...fromA.semantic_keywords,
            ...fromB.semantic_keywords,
          ]),
          axes: uniq([...fromA.axes, ...fromB.axes]),
          detail: `Transition ${Math.round(ratio * 100)}% from Query A to Query B`,
        },
        score,
      };
    }

    const only = fromA ?? fromB;
    const suffix = fromA
      ? `Present only in Query A at ${Math.round((1 - ratio) * 100)}% weight`
      : `Present only in Query B at ${Math.round(ratio * 100)}% weight`;

    return {
      parameter: only
        ? {
            ...only,
            detail: `${only.detail} | ${suffix}`,
            similarity: score,
          }
        : null,
      score,
    };
  });

  return blended
    .filter((item): item is { parameter: ActiveParameter; score: number } => item.parameter !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.parameter);
}

export const useRagV2Store = create<RagV2State>()(persist((set, get) => ({
  status: null,
  statusLoading: false,
  statusError: null,
  query: "",
  queryB: "",
  topK: 50,
  searchMode: "single",
  transitionRatio: 50,
  instructionSlots: DEFAULT_INSTRUCTION_SLOTS.map((slot) => ({ ...slot })),
  instructionSettingsSavedAt: null,
  searchResults: [],
  secondaryResults: [],
  activeParameters: [],
  isSearching: false,
  searchError: null,
  macro: "",
  isGeneratingMacro: false,
  macroError: null,

  async fetchStatus() {
    set({ statusLoading: true, statusError: null });
    try {
      const response = await fetch("/api/rag-v2/status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      set({
        status: (await response.json()) as StatusResponse,
        statusLoading: false,
      });
    } catch (error) {
      set({
        statusLoading: false,
        statusError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async proposeParameters(query, target = "primary") {
    const normalized = query.trim();
    const state = get();

    if (!normalized) {
      if (target === "primary") {
        set({
          query: "",
          searchResults: [],
          activeParameters:
            state.searchMode === "transition" && state.secondaryResults.length > 0
              ? mergeActiveParameters(state.activeParameters, state.secondaryResults.slice(0, state.topK))
              : [],
          searchError: null,
        });
      } else {
        set({
          queryB: "",
          secondaryResults: [],
          activeParameters: mergeActiveParameters(state.activeParameters, state.searchResults.slice(0, state.topK)),
          searchError: null,
        });
      }
      return;
    }

    set({ isSearching: true, searchError: null });

    try {
      const currentValues = Object.fromEntries(
        get().activeParameters.map((parameter) => [
          parameter.technical_name,
          parameter.current_value,
        ]),
      );
      const response = await fetch("/api/rag-v2/propose-parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalized,
          top_k: get().topK,
          current_values: currentValues,
          instruction_context: toInstructionContext(get().instructionSlots),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as ProposeParametersResponse;
      set((current) => {
        const nextPrimary = target === "primary" ? payload.results : current.searchResults;
        const nextSecondary =
          target === "secondary" ? payload.results : current.secondaryResults;
        const nextActive =
          current.searchMode === "transition" && nextSecondary.length > 0
            ? buildTransitionResults(
                nextPrimary,
                nextSecondary,
                current.transitionRatio,
                current.topK,
              )
            : nextPrimary.slice(0, current.topK);

        return {
          searchResults: nextPrimary,
          secondaryResults: nextSecondary,
          activeParameters: mergeActiveParameters(current.activeParameters, nextActive),
          isSearching: false,
          searchError: null,
        };
      });
    } catch (error) {
      set({
        isSearching: false,
        searchError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  applyTransitionBlend() {
    set((state) => {
      const nextActive =
        state.searchMode === "transition" && state.secondaryResults.length > 0
          ? buildTransitionResults(
              state.searchResults,
              state.secondaryResults,
              state.transitionRatio,
              state.topK,
            )
          : state.searchResults.slice(0, state.topK);
      return {
        activeParameters: mergeActiveParameters(state.activeParameters, nextActive),
      };
    });
  },

  async startBuildIndex() {
    set({ statusError: null });
    try {
      const response = await fetch("/api/rag-v2/build-index", {
        method: "POST",
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      await get().fetchStatus();
    } catch (error) {
      set({
        statusError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async startBuildAnchors() {
    set({ statusError: null });
    try {
      const response = await fetch("/api/rag-v2/build-anchors", {
        method: "POST",
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      await get().fetchStatus();
    } catch (error) {
      set({
        statusError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setQuery(query) {
    set({ query });
  },

  setQueryB(queryB) {
    set({ queryB });
  },

  setTopK(topK) {
    set((state) => {
      const nextActive =
        state.searchMode === "transition" && state.secondaryResults.length > 0
          ? buildTransitionResults(
              state.searchResults,
              state.secondaryResults,
              state.transitionRatio,
              topK,
            )
          : state.searchResults.slice(0, topK);
      return {
        topK,
        activeParameters: mergeActiveParameters(state.activeParameters, nextActive),
      };
    });
  },

  setSearchMode(searchMode) {
    set((state) => {
      const nextActive =
        searchMode === "transition" && state.secondaryResults.length > 0
          ? buildTransitionResults(
              state.searchResults,
              state.secondaryResults,
              state.transitionRatio,
              state.topK,
            )
          : state.searchResults.slice(0, state.topK);
      return {
        searchMode,
        activeParameters: mergeActiveParameters(state.activeParameters, nextActive),
      };
    });
  },

  setTransitionRatio(transitionRatio) {
    set((state) => {
      const normalized = normalizeRatio(transitionRatio);
      const nextActive =
        state.searchMode === "transition" && state.secondaryResults.length > 0
          ? buildTransitionResults(
              state.searchResults,
              state.secondaryResults,
              normalized,
              state.topK,
            )
          : state.activeParameters;
      return {
        transitionRatio: normalized,
        activeParameters:
          state.searchMode === "transition" && state.secondaryResults.length > 0
            ? mergeActiveParameters(state.activeParameters, nextActive)
            : state.activeParameters,
      };
    });
  },

  updateInstructionSlot(slotId, updates) {
    set((state) => ({
      instructionSlots: state.instructionSlots.map((slot) => {
        if (slot.id !== slotId) {
          return slot;
        }

        return {
          ...slot,
          title:
            typeof updates.title === "string" && updates.title.trim()
              ? updates.title.trim().slice(0, 80)
              : slot.title,
          content:
            typeof updates.content === "string"
              ? sanitizeInstructionDraft(updates.content)
              : slot.content,
          enabled:
            typeof updates.enabled === "boolean" ? updates.enabled : slot.enabled,
          influence:
            typeof updates.influence === "number"
              ? normalizeInfluence(updates.influence)
              : slot.influence,
          includeInOutput:
            typeof updates.includeInOutput === "boolean"
              ? updates.includeInOutput
              : slot.includeInOutput,
        };
      }),
    }));
  },

  saveInstructionSlots() {
    set({ instructionSettingsSavedAt: Date.now() });
  },

  resetInstructionSlots() {
    set({
      instructionSlots: DEFAULT_INSTRUCTION_SLOTS.map((slot) => ({ ...slot })),
      instructionSettingsSavedAt: Date.now(),
    });
  },

  updateParameterValue(technicalName, value) {
    set((state) => ({
      activeParameters: state.activeParameters.map((parameter) =>
        parameter.technical_name === technicalName
          ? { ...parameter, current_value: value }
          : parameter,
      ),
    }));
  },

  removeParameter(technicalName) {
    set((state) => ({
      activeParameters: state.activeParameters.filter(
        (parameter) => parameter.technical_name !== technicalName,
      ),
    }));
  },

  clearActiveParameters() {
    set({
      activeParameters: [],
      searchResults: [],
      secondaryResults: [],
      macro: "",
      macroError: null,
    });
  },

  async generateMacro() {
    const parameters = get().activeParameters;
    if (parameters.length === 0) {
      set({ macro: "", macroError: "No active parameters selected." });
      return;
    }

    set({ isGeneratingMacro: true, macroError: null });
    try {
      const response = await fetch("/api/rag-v2/generate-macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameters: parameters.map((parameter) => ({
            technical_name: parameter.technical_name,
            current_value: parameter.current_value,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { macro: string };
      set({ macro: payload.macro, isGeneratingMacro: false });
    } catch (error) {
      set({
        isGeneratingMacro: false,
        macroError: error instanceof Error ? error.message : String(error),
      });
    }
  },
}), {
  name: "rag-v2-instruction-settings",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    instructionSlots: state.instructionSlots,
    instructionSettingsSavedAt: state.instructionSettingsSavedAt,
  }),
}));
