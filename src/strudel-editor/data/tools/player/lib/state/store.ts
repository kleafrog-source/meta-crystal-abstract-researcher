import { create } from 'zustand';
import type { ChunkInfo } from '@/lib/chunks/detect';
import type { SongTimeline } from '@/lib/timeline/types';
import type { SongArrangement } from '@/lib/timeline/recognize';

export type PanelKind = 'chunk' | 'sounds' | null;

export interface PlayerState {
  /** scheduler is running */
  isPlaying: boolean;
  /** samples + eval scope loaded */
  ready: boolean;
  /** last eval/scheduler error, if any */
  error: string | null;
  /** beats per minute, assuming 4 beats per cycle (cps = bpm / 240) */
  bpm: number;
  /** doc range currently being auditioned (solo), or null */
  audition: [number, number] | null;
  /** pattern statement under the cursor */
  currentChunk: ChunkInfo | null;
  /** the document has a JS syntax error — chunk tools are paused */
  docBroken: boolean;
  /** which side panel is open */
  panel: PanelKind;
  /** derived song-structure analysis; null until the first successful eval */
  timeline: SongTimeline | null;
  /** the doc changed since `timeline.code` was analyzed */
  timelineStale: boolean;
  /** loop region in song cycles, or null — mirrors the engine's transport */
  loopRegion: [number, number] | null;
  /** index into timeline.sections, or null */
  selectedSection: number | null;
  /** timeline strip disclosure */
  timelineOpen: boolean;
  /** Tier-2 recognized arrangement (pickRestart/arrange voices), or null */
  arrangement: SongArrangement | null;

  setPlaying: (isPlaying: boolean) => void;
  setReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  setBpm: (bpm: number) => void;
  setAudition: (audition: [number, number] | null) => void;
  setCurrentChunk: (chunk: ChunkInfo | null) => void;
  setDocBroken: (docBroken: boolean) => void;
  setPanel: (panel: PanelKind) => void;
  setTimeline: (timeline: SongTimeline | null) => void;
  setTimelineStale: (timelineStale: boolean) => void;
  setLoopRegion: (loopRegion: [number, number] | null) => void;
  setSelectedSection: (selectedSection: number | null) => void;
  setTimelineOpen: (timelineOpen: boolean) => void;
  setArrangement: (arrangement: SongArrangement | null) => void;
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  isPlaying: false,
  ready: false,
  error: null,
  bpm: 120,
  audition: null,
  currentChunk: null,
  docBroken: false,
  panel: 'chunk',
  timeline: null,
  timelineStale: false,
  loopRegion: null,
  selectedSection: null,
  timelineOpen: true,
  arrangement: null,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setReady: (ready) => set({ ready }),
  setError: (error) => set({ error }),
  setBpm: (bpm) => set({ bpm }),
  setAudition: (audition) => set({ audition }),
  setCurrentChunk: (currentChunk) => set({ currentChunk }),
  setDocBroken: (docBroken) => set({ docBroken }),
  setPanel: (panel) => set({ panel }),
  setTimeline: (timeline) => set({ timeline }),
  setTimelineStale: (timelineStale) => set({ timelineStale }),
  setLoopRegion: (loopRegion) => set({ loopRegion }),
  setSelectedSection: (selectedSection) => set({ selectedSection }),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setArrangement: (arrangement) => set({ arrangement }),
}));
