import { create } from "zustand";

import type {
  ActiveParameter,
  ProposeParametersResponse,
  VectorizationStatus,
} from "@/lib/rag-types";

interface RagState {
  status: VectorizationStatus | null;
  statusLoading: boolean;
  isVectorizing: boolean;
  statusError: string | null;
  query: string;
  searchResults: ActiveParameter[];
  isSearching: boolean;
  searchError: string | null;
  totalVectorized: number;
  activeParameters: ActiveParameter[];
  macro: string;
  isGeneratingMacro: boolean;
  macroError: string | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  fetchStatus: () => Promise<void>;
  startVectorization: (reset?: boolean) => Promise<void>;
  reVectorizeAll: () => Promise<void>;
  proposeParameters: (query: string) => Promise<void>;
  setQuery: (query: string) => void;
  updateParameterValue: (technicalName: string, value: number | string) => void;
  removeParameter: (technicalName: string) => void;
  clearActiveParameters: () => void;
  generateMacro: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

function mergeActiveParameters(
  previous: ActiveParameter[],
  incoming: ActiveParameter[],
): ActiveParameter[] {
  const previousMap = new Map(
    previous.map((parameter) => [parameter.technical_name, parameter]),
  );

  return incoming.map((parameter) => {
    const existing = previousMap.get(parameter.technical_name);
    if (!existing) {
      return parameter;
    }

    return {
      ...parameter,
      current_value: existing.current_value,
    };
  });
}

export const useRagStore = create<RagState>((set, get) => ({
  status: null,
  statusLoading: false,
  isVectorizing: false,
  statusError: null,
  query: "",
  searchResults: [],
  isSearching: false,
  searchError: null,
  totalVectorized: 0,
  activeParameters: [],
  macro: "",
  isGeneratingMacro: false,
  macroError: null,
  pollTimer: null,

  async fetchStatus() {
    set({ statusLoading: true, statusError: null });

    try {
      const response = await fetch("/api/vectorization-status", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const status = (await response.json()) as VectorizationStatus;
      set({
        status,
        statusLoading: false,
        isVectorizing: status.is_vectorizing,
      });
    } catch (error) {
      set({
        statusLoading: false,
        statusError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async startVectorization(reset = false) {
    set({ statusError: null });

    try {
      const response = await fetch("/api/vectorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reset }),
      });

      const payload = (await response.json()) as { started: boolean };

      if (!response.ok && response.status !== 409) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
      }

      if (payload.started) {
        set({ isVectorizing: true });
      }

      get().startPolling();
      await get().fetchStatus();
    } catch (error) {
      set({
        statusError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async reVectorizeAll() {
    await get().startVectorization(true);
  },

  async proposeParameters(query) {
    const normalized = query.trim();

    if (!normalized) {
      set({
        searchResults: [],
        activeParameters: [],
        totalVectorized: 0,
        searchError: null,
      });
      return;
    }

    set({ isSearching: true, searchError: null });

    try {
      const response = await fetch("/api/propose-parameters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: normalized,
          top_k: 30,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as ProposeParametersResponse;
      set((state) => ({
        searchResults: payload.results,
        activeParameters: mergeActiveParameters(
          state.activeParameters,
          payload.results,
        ),
        totalVectorized: payload.total_vectorized,
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
    set({
      activeParameters: [],
      searchResults: [],
      macro: "",
      macroError: null,
    });
  },

  async generateMacro() {
    const parameters = get().activeParameters;
    if (parameters.length === 0) {
      set({
        macro: "",
        macroError: "No active parameters selected.",
      });
      return;
    }

    set({
      isGeneratingMacro: true,
      macroError: null,
    });

    try {
      const response = await fetch("/api/generate-macro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parameters: parameters.map((parameter) => ({
            technical_name: parameter.technical_name,
            current_value: parameter.current_value,
            unit: parameter.unit,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as { macro: string };
      set({
        macro: payload.macro,
        isGeneratingMacro: false,
      });
    } catch (error) {
      set({
        isGeneratingMacro: false,
        macroError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  startPolling() {
    if (get().pollTimer) {
      return;
    }

    const timer = setInterval(async () => {
      await get().fetchStatus();
      const latestStatus = get().status;

      if (latestStatus && !latestStatus.is_vectorizing) {
        get().stopPolling();
      }
    }, 1_500);

    set({ pollTimer: timer });
  },

  stopPolling() {
    const timer = get().pollTimer;
    if (timer) {
      clearInterval(timer);
    }

    set({
      pollTimer: null,
      isVectorizing: false,
    });
  },
}));
