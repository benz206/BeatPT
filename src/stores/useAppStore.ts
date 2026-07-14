import { create } from 'zustand';
import type { EnergySegment } from '../engine/EnergyAnalyzer';
import type { TrackKey } from '../engine/KeyDetector';

export interface Track {
  id: string;
  name: string;
  artist: string;
  duration: number;
  bpm: number;
  key: TrackKey | null;
  gain: number;
  downbeatIndex: number;
  filePath: string;
  audioBuffer: AudioBuffer | null;
  waveformData: number[];
  beatPositions: number[];
  energySegments: EnergySegment[];
  albumArt?: string;
}

export interface LoopState {
  start: number;
  end: number;
  beats: number;
}

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  speed: number;
  eq: { low: number; mid: number; high: number };
  hotCues: (number | null)[];
  loop: LoopState | null;
}

interface AppState {
  // Library
  library: Track[];
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;

  // Decks
  deckA: DeckState;
  deckB: DeckState;
  updateDeck: (deck: 'A' | 'B', updates: Partial<DeckState>) => void;
  loadTrackToDeck: (deck: 'A' | 'B', track: Track) => void;

  // Crossfader
  crossfaderPosition: number;
  setCrossfaderPosition: (pos: number) => void;

  // Master
  masterVolume: number;
  setMasterVolume: (value: number) => void;

  // Transition
  transitionConfidence: number;
  setTransitionConfidence: (level: number) => void;
  activeTransitionType: string | null;
  setActiveTransitionType: (type: string | null) => void;
  // Where the next planned merge starts in each deck's track — the playing
  // deck's transition trigger point and the queued deck's mix-in point.
  // Null = no plan yet for that deck.
  mixMarkers: { A: number | null; B: number | null };
  setMixMarkers: (markers: { A: number | null; B: number | null }) => void;

  // AI thinking overlay
  isAIThinking: boolean;
  aiThinkingMessage: string;
  showAIThinking: (message: string) => void;
  hideAIThinking: () => void;
}

const defaultDeckState: DeckState = {
  track: null,
  isPlaying: false,
  currentTime: 0,
  volume: 1,
  speed: 1,
  eq: { low: 0, mid: 0, high: 0 },
  hotCues: [null, null, null, null],
  loop: null,
};

export const useAppStore = create<AppState>((set) => ({
  // Library
  library: [],
  addTrack: (track) =>
    set((state) => {
      if (state.library.some((t) => t.id === track.id)) return state;
      return { library: [...state.library, track] };
    }),
  removeTrack: (id) =>
    set((state) => ({ library: state.library.filter((t) => t.id !== id) })),

  // Decks
  deckA: { ...defaultDeckState },
  deckB: { ...defaultDeckState },
  updateDeck: (deck, updates) =>
    set((state) =>
      deck === 'A'
        ? { deckA: { ...state.deckA, ...updates } }
        : { deckB: { ...state.deckB, ...updates } }
    ),
  loadTrackToDeck: (deck, track) =>
    set((state) => {
      const reset = {
        track,
        isPlaying: false,
        currentTime: 0,
        speed: 1,
        eq: { low: 0, mid: 0, high: 0 },
        hotCues: [null, null, null, null] as (number | null)[],
        loop: null,
      };
      return deck === 'A'
        ? { deckA: { ...state.deckA, ...reset } }
        : { deckB: { ...state.deckB, ...reset } };
    }),

  // Crossfader
  crossfaderPosition: 0,
  setCrossfaderPosition: (pos) =>
    set({ crossfaderPosition: Math.max(-1, Math.min(1, pos)) }),

  // Master
  masterVolume: 1,
  setMasterVolume: (value) =>
    set({ masterVolume: Math.max(0, Math.min(1, value)) }),

  // Transition
  transitionConfidence: 50,
  setTransitionConfidence: (level) =>
    set({ transitionConfidence: Math.max(0, Math.min(100, level)) }),
  activeTransitionType: null,
  setActiveTransitionType: (type) => set({ activeTransitionType: type }),
  mixMarkers: { A: null, B: null },
  setMixMarkers: (markers) => set({ mixMarkers: markers }),

  // AI thinking overlay
  isAIThinking: false,
  aiThinkingMessage: '',
  showAIThinking: (message) => set({ isAIThinking: true, aiThinkingMessage: message }),
  hideAIThinking: () => set({ isAIThinking: false, aiThinkingMessage: '' }),
}));
