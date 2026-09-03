// Global client state for the RAG Parameter UI module (zustand).
//
// Owns: vectorization status (polled while a job runs), the active set of
// proposed parameters with their live `current_value`, and the current
// semantic query. All API calls are centralised here so the components
// stay thin.

import { create } from "zustand";
import type {
  ActiveParameter,
  ProposeParametersResponse,
  VectorizationStatus,
} from "@/lib/rag-types";

interface RagState {
  // --- vectorization ---
  status: VectorizationStatus | null;
  statusLoading: boolean;
  isVectorizing: boolean;
  statusError: string | null;

  // --- semantic search ---
  query: string;
  searchResults: ActiveParameter[];
  isSearching: boolean;
  searchError: string | null;
  lastUsedFallback: boolean;
  totalVectorized: number;

  // --- active parameters (edited in the virtualised list) ---
  activeParameters: ActiveParameter[];

  // --- macro generation ---
  macro: string;
  isGeneratingMacro: boolean;
  macroError: string | null;

  // --- polling handle ---
  _pollTimer: ReturnType<typeof setInterval> | null;

  // --- actions ---
  fetchStatus: () => Promise<void>;
  startVectorization: (reset?: boolean) => Promise<void>;
  reVectorizeAll: () => Promise<void>;
  proposeParameters: (query: string) => Promise<void>;
  setQuery: (query: string) => void;
  updateParameterValue: (
    technicalName: string,
    value: number | string,
  ) => void;
  removeParameter: (technicalName: string) => void;
  clearActiveParameters: () => void;
  generateMacro: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

function mergeActiveParameters(
  prev: ActiveParameter[],
  next: ActiveParameter[],
): ActiveParameter[] {
  // Preserve user-tuned `current_value` when the same parameter reappears
  // in a new search result. This stops the user's slider tweaks from being
  // blown away when they refine their query.
  const prevByTech = new Map<string, ActiveParameter>();
  for (const p of prev) prevByTech.set(p.technical_name, p);
  return next.map((n) => {
    const existing = prevByTech.get(n.technical_name);
    if (existing) {
      return { ...n, current_value: existing.current_value };
    }
    return n;
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
  lastUsedFallback: false,
  totalVectorized: 0,

  activeParameters: [],

  macro: "",
  isGeneratingMacro: false,
  macroError: null,

  _pollTimer: null,

  async fetchStatus() {
    set({ statusLoading: true, statusError: null });
    try {
      const res = await fetch("/api/vectorization-status", {
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = (await res.json()) as VectorizationStatus;
      set({
        status: data,
        statusLoading: false,
        isVectorizing: data.is_vectorizing,
      });
    } catch (err) {
      set({
        statusLoading: false,
        statusError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async startVectorization(reset = false) {
    set({ statusError: null });
    try {
      const res = await fetch("/api/vectorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset }),
      });
      if (!res.ok && res.status !== 409) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = (await res.json()) as { started: boolean };
      if (data.started) {
        set({ isVectorizing: true });
        get().startPolling();
      } else {
        // already running — sync state with backend
        get().startPolling();
      }
      // immediate refresh
      void get().fetchStatus();
    } catch (err) {
      set({
        statusError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async reVectorizeAll() {
    await get().startVectorization(true);
  },

  async proposeParameters(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      set({
        searchResults: [],
        activeParameters: [],
        totalVectorized: 0,
        lastUsedFallback: false,
      });
      return;
    }
    set({ isSearching: true, searchError: null });
    try {
      const res = await fetch("/api/propose-parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, top_k: 25 }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = (await res.json()) as ProposeParametersResponse;
      set((state) => ({
        searchResults: data.results,
        activeParameters: mergeActiveParameters(
          state.activeParameters,
          data.results,
        ),
        totalVectorized: data.total_vectorized,
        lastUsedFallback: data.used_fallback,
        isSearching: false,
        searchError: null,
      }));
    } catch (err) {
      set({
        isSearching: false,
        searchError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setQuery(query) {
    set({ query });
  },

  updateParameterValue(technicalName, value) {
    set((state) => ({
      activeParameters: state.activeParameters.map((p) =>
        p.technical_name === technicalName ? { ...p, current_value: value } : p,
      ),
    }));
  },

  removeParameter(technicalName) {
    set((state) => ({
      activeParameters: state.activeParameters.filter(
        (p) => p.technical_name !== technicalName,
      ),
    }));
  },

  clearActiveParameters() {
    set({ activeParameters: [], searchResults: [] });
  },

  async generateMacro() {
    const params = get().activeParameters;
    if (params.length === 0) {
      set({ macro: "", macroError: "No active parameters to encode." });
      return;
    }
    set({ isGeneratingMacro: true, macroError: null });
    try {
      const body = {
        parameters: params.map((p) => ({
          technical_name: p.technical_name,
          current_value: p.current_value,
          unit: p.unit,
        })),
      };
      const res = await fetch("/api/generate-macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const data = (await res.json()) as { macro: string };
      set({ macro: data.macro, isGeneratingMacro: false });
    } catch (err) {
      set({
        isGeneratingMacro: false,
        macroError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  startPolling() {
    const state = get();
    if (state._pollTimer) return;
    const timer = setInterval(async () => {
      await get().fetchStatus();
      const st = get().status;
      if (st && !st.is_vectorizing) {
        get().stopPolling();
        set({ isVectorizing: false });
      }
    }, 1500);
    set({ _pollTimer: timer });
  },

  stopPolling() {
    const timer = get()._pollTimer;
    if (timer) {
      clearInterval(timer);
      set({ _pollTimer: null });
    }
  },
}));
