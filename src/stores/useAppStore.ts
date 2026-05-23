import { create } from 'zustand';

export interface Track {
  id: string;
  name: string;
  artist: string;
  duration: number;
  bpm: number;
  filePath: string;
  audioBuffer: AudioBuffer | null;
  waveformData: number[];
  beatPositions: number[];
  albumArt?: string;
}

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  eq: { low: number; mid: number; high: number };
}

export interface ActionLog {
  id: string;
  name: string;
  icon: string;
  description: string;
  timestamp: number;
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

  // Action log
  actionLog: ActionLog[];
  addAction: (action: Omit<ActionLog, 'id' | 'timestamp'>) => void;

  // Transition confidence
  transitionConfidence: number;
  setTransitionConfidence: (level: number) => void;

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
  eq: { low: 0, mid: 0, high: 0 },
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
    set((state) =>
      deck === 'A'
        ? { deckA: { ...state.deckA, track, isPlaying: false, currentTime: 0 } }
        : { deckB: { ...state.deckB, track, isPlaying: false, currentTime: 0 } }
    ),

  // Crossfader
  crossfaderPosition: 0,
  setCrossfaderPosition: (pos) =>
    set({ crossfaderPosition: Math.max(-1, Math.min(1, pos)) }),

  // Action log
  actionLog: [],
  addAction: (action) =>
    set((state) => {
      const entry: ActionLog = {
        ...action,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      };
      const updated = [entry, ...state.actionLog].slice(0, 20);
      return { actionLog: updated };
    }),

  // Transition confidence
  transitionConfidence: 50,
  setTransitionConfidence: (level) =>
    set({ transitionConfidence: Math.max(0, Math.min(100, level)) }),

  // AI thinking overlay
  isAIThinking: false,
  aiThinkingMessage: '',
  showAIThinking: (message) => set({ isAIThinking: true, aiThinkingMessage: message }),
  hideAIThinking: () => set({ isAIThinking: false, aiThinkingMessage: '' }),
}));
