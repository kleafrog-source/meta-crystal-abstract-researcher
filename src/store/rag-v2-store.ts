import { create } from "zustand";

import type {
  ActiveParameter,
  ProposeParametersResponse,
  StatusResponse,
} from "@/lib/rag-v2/types";

interface RagV2State {
  status: StatusResponse | null;
  statusLoading: boolean;
  statusError: string | null;
  query: string;
  searchResults: ActiveParameter[];
  activeParameters: ActiveParameter[];
  isSearching: boolean;
  searchError: string | null;
  macro: string;
  isGeneratingMacro: boolean;
  macroError: string | null;
  fetchStatus: () => Promise<void>;
  startBuildIndex: () => Promise<void>;
  startBuildAnchors: () => Promise<void>;
  proposeParameters: (query: string) => Promise<void>;
  setQuery: (query: string) => void;
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

export const useRagV2Store = create<RagV2State>((set, get) => ({
  status: null,
  statusLoading: false,
  statusError: null,
  query: "",
  searchResults: [],
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

  async proposeParameters(query) {
    const normalized = query.trim();
    if (!normalized) {
      set({
        searchResults: [],
        activeParameters: [],
        searchError: null,
      });
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
          top_k: 30,
          current_values: currentValues,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as ProposeParametersResponse;
      set((state) => ({
        searchResults: payload.results,
        activeParameters: mergeActiveParameters(state.activeParameters, payload.results),
        isSearching: false,
        searchError: null,
      }));
    } catch (error) {
      set({
        isSearching: false,
        searchError: error instanceof Error ? error.message : String(error),
      });
    }
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
    set({ activeParameters: [], searchResults: [], macro: "", macroError: null });
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
}));
