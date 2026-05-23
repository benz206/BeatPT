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
  crossfaderPosition: number; // -1 to 1
  setCrossfaderPosition: (pos: number) => void;

  // Keyboard Mash Mode
  isMashMode: boolean;
  toggleMashMode: () => void;

  // Action log (recent DJ actions triggered)
  actionLog: ActionLog[];
  addAction: (action: Omit<ActionLog, 'id' | 'timestamp'>) => void;

  // Fun meters
  hypeLevel: number; // 0-100
  setHypeLevel: (level: number) => void;
  transitionConfidence: number; // 0-100
  setTransitionConfidence: (level: number) => void;

  // AI thinking overlay
  isAIThinking: boolean;
  aiThinkingMessage: string;
  showAIThinking: (message: string) => void;
  hideAIThinking: () => void;

  // DJ Name
  djName: string;
  generateDJName: () => void;
}

const DJ_NAME_PREFIXES = ['DJ', 'MC', 'Lil', 'Big', 'The', 'Dr.', 'Professor', 'Captain', 'Ultra', 'Cyber'];
const DJ_NAME_SUFFIXES = ['Beat', 'Drop', 'Bass', 'Sync', 'Loop', 'Wave', 'Pulse', 'Flux', 'Glitch', 'Byte', 'Bit', 'Flow'];

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

  // Keyboard Mash Mode
  isMashMode: false,
  toggleMashMode: () => set((state) => ({ isMashMode: !state.isMashMode })),

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

  // Fun meters
  hypeLevel: 0,
  setHypeLevel: (level) => set({ hypeLevel: Math.max(0, Math.min(100, level)) }),
  transitionConfidence: 50,
  setTransitionConfidence: (level) =>
    set({ transitionConfidence: Math.max(0, Math.min(100, level)) }),

  // AI thinking overlay
  isAIThinking: false,
  aiThinkingMessage: '',
  showAIThinking: (message) => set({ isAIThinking: true, aiThinkingMessage: message }),
  hideAIThinking: () => set({ isAIThinking: false, aiThinkingMessage: '' }),

  // DJ Name
  djName: 'DJ Beat',
  generateDJName: () =>
    set(() => {
      const prefix = DJ_NAME_PREFIXES[Math.floor(Math.random() * DJ_NAME_PREFIXES.length)];
      const suffix = DJ_NAME_SUFFIXES[Math.floor(Math.random() * DJ_NAME_SUFFIXES.length)];
      return { djName: `${prefix} ${suffix}` };
    }),
}));
