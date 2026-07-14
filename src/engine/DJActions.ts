import { AudioEngine } from './AudioEngine';
import { EchoOut, FilterSweep, getBassSwapSettings, StutterEffect, Reverb } from './Effects';
import { useAppStore } from '../stores/useAppStore';

export type MixPhase = 'groove' | 'buildup' | 'drop';
export type ConflictGroup = 'gain' | 'filter' | 'spatial' | 'eq';

export type DJAction = {
  name: string;
  description: string;
  icon: string;
  execute: () => void;
  conflictGroup: ConflictGroup;
  cooldown: number;
  phases: MixPhase[];
};

function engine(): AudioEngine {
  return AudioEngine.getInstance();
}

function audioCtx(): AudioContext {
  return engine().getContext();
}

function activeDeck(): 'A' | 'B' {
  const e = engine();
  if (e.isPlaying('A') && !e.isPlaying('B')) return 'A';
  if (e.isPlaying('B') && !e.isPlaying('A')) return 'B';
  return e.getCrossfaderValue() <= 0 ? 'A' : 'B';
}

function inactiveDeck(): 'A' | 'B' {
  return activeDeck() === 'A' ? 'B' : 'A';
}

function deckTrack(deck: 'A' | 'B') {
  const state = useAppStore.getState();
  return (deck === 'A' ? state.deckA : state.deckB).track;
}

// Audible tempo of the deck the effect will hit (track BPM × varispeed rate)
function effectiveBPM(deck: 'A' | 'B'): number {
  const track = deckTrack(deck);
  if (!track) return 128;
  return track.bpm * engine().getPlaybackRate(deck);
}

// The deck's fader level, so gain effects restore what the user set (not 1)
function deckVolume(deck: 'A' | 'B'): number {
  const state = useAppStore.getState();
  return (deck === 'A' ? state.deckA : state.deckB).volume;
}

// EQ change that also mirrors into the store so the deck knobs move with it
function setDeckEQ(deck: 'A' | 'B', band: 'low' | 'mid' | 'high', value: number): void {
  engine().setEQ(deck, band, value);
  const state = useAppStore.getState();
  const eq = (deck === 'A' ? state.deckA : state.deckB).eq;
  state.updateDeck(deck, { eq: { ...eq, [band]: Math.max(-26, Math.min(12, value)) } });
}

// AudioContext time at which the deck's next beat becomes audible, so gain
// effects land on the grid instead of wherever the keypress fell.
function nextBeatTime(deck: 'A' | 'B'): number {
  const e = engine();
  const now = audioCtx().currentTime;
  const track = deckTrack(deck);
  if (!track || !e.isPlaying(deck)) return now;

  const pos = e.getPlaybackPosition(deck);
  const rate = e.getPlaybackRate(deck);
  let next = track.beatPositions.find((b) => b > pos + 0.001);
  if (next === undefined) {
    const interval = 60 / track.bpm;
    const last = track.beatPositions[track.beatPositions.length - 1] ?? 0;
    next = last + Math.max(1, Math.ceil((pos - last) / interval)) * interval;
    if (next <= pos) next += interval;
  }
  return now + (next - pos) / rate + e.getOutputLatency(deck);
}

const actions: DJAction[] = [
  {
    name: 'Echo Out',
    description: 'Apply feedback echo to current deck',
    icon: '🔁',
    conflictGroup: 'spatial',
    cooldown: 5000,
    phases: ['groove', 'buildup'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const effect = new EchoOut();
      effect.apply(e.getDeckOutputNode(deck), effectiveBPM(deck), audioCtx(), e.getEffectsBus());
    },
  },

  {
    name: 'Bass Swap',
    description: 'Kill bass on active deck, boost on the other',
    icon: '🔊',
    conflictGroup: 'eq',
    cooldown: 4000,
    phases: ['groove'],
    execute() {
      const e = engine();
      const a = activeDeck();
      const b = inactiveDeck();
      const currentALow = e.getEQ(a, 'low');
      const currentBLow = e.getEQ(b, 'low');
      const settings = getBassSwapSettings(currentALow, currentBLow);
      setDeckEQ(a, 'low', settings.deckA.low);
      setDeckEQ(b, 'low', settings.deckB.low);
      setTimeout(() => {
        setDeckEQ(a, 'low', currentALow);
        setDeckEQ(b, 'low', currentBLow);
      }, 3000);
    },
  },

  {
    name: 'Filter Sweep',
    description: 'Sweep a low-pass filter across the active deck',
    icon: '〰️',
    conflictGroup: 'filter',
    cooldown: 3000,
    phases: ['buildup'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const effect = new FilterSweep();
      effect.apply((node) => e.insertDeckEffect(deck, node), effectiveBPM(deck), audioCtx());
    },
  },

  {
    name: 'Beat Drop',
    description: 'Kill volume briefly then slam it back',
    icon: '💥',
    conflictGroup: 'gain',
    cooldown: 3000,
    phases: ['drop'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const beatSecs = 60 / effectiveBPM(deck);
      const vol = deckVolume(deck);
      const ctx = audioCtx();
      const gain = e.getDeckOutputNode(deck).gain;
      const now = ctx.currentTime;
      // Cut on the next beat, slam back exactly two beats later
      const t0 = nextBeatTime(deck);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.setValueAtTime(gain.value, Math.max(now, t0 - 0.02));
      gain.linearRampToValueAtTime(0, t0);
      gain.setValueAtTime(0, t0 + beatSecs * 2 - 0.02);
      gain.linearRampToValueAtTime(vol, t0 + beatSecs * 2);
    },
  },

  {
    name: 'Stutter',
    description: 'Beat-synced gating stutter on active deck',
    icon: '⚡',
    conflictGroup: 'gain',
    cooldown: 3000,
    phases: ['drop'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const effect = new StutterEffect();
      effect.apply(
        e.getDeckOutputNode(deck),
        effectiveBPM(deck),
        audioCtx(),
        e.getEffectsBus(),
        nextBeatTime(deck),
        deckVolume(deck),
      );
    },
  },

  {
    name: 'EQ Kill',
    description: 'Kill highs or mids temporarily on active deck',
    icon: '🎚️',
    conflictGroup: 'eq',
    cooldown: 3500,
    phases: ['buildup', 'groove'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const band = Math.random() > 0.5 ? ('high' as const) : ('mid' as const);
      const current = e.getEQ(deck, band);
      setDeckEQ(deck, band, -26);
      setTimeout(() => setDeckEQ(deck, band, current), 2500);
    },
  },

  {
    name: 'Volume Pump',
    description: 'Rhythmic volume pumping on active deck',
    icon: '📳',
    conflictGroup: 'gain',
    cooldown: 5000,
    phases: ['buildup'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const beatSecs = 60 / effectiveBPM(deck);
      const vol = deckVolume(deck);
      const gain = e.getDeckOutputNode(deck).gain;
      const ctx = audioCtx();
      const pulses = 8;
      const now = ctx.currentTime;
      // Duck right on each beat, swell back before the next — sidechain feel
      const t0 = nextBeatTime(deck);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(vol, t0);
      for (let i = 0; i < pulses; i++) {
        const t = t0 + i * beatSecs;
        gain.linearRampToValueAtTime(vol * 0.15, t + beatSecs * 0.1);
        gain.linearRampToValueAtTime(vol, t + beatSecs * 0.9);
      }
      gain.linearRampToValueAtTime(vol, t0 + pulses * beatSecs);
    },
  },

  {
    name: 'Reverb Wash',
    description: 'Add atmospheric reverb tail to active deck',
    icon: '🌊',
    conflictGroup: 'spatial',
    cooldown: 5000,
    phases: ['groove'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const effect = new Reverb();
      effect.apply(e.getDeckOutputNode(deck), effectiveBPM(deck), audioCtx(), e.getEffectsBus());
    },
  },

  {
    name: 'Spinback',
    description: 'Fake spinback via rapid gain ramp-down then restore',
    icon: '🎤',
    conflictGroup: 'gain',
    cooldown: 2500,
    phases: ['drop'],
    execute() {
      const e = engine();
      const deck = activeDeck();
      const vol = deckVolume(deck);
      const ctx = audioCtx();
      const gain = e.getDeckOutputNode(deck).gain;
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + 0.8);
      gain.setValueAtTime(0, now + 0.85);
      gain.linearRampToValueAtTime(vol, now + 1.1);
    },
  },
];

const weights = actions.map(() => 1);
const totalWeight = weights.reduce((s, w) => s + w, 0);

export function getRandomAction(): DJAction {
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < actions.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return actions[i];
  }
  return actions[actions.length - 1];
}

export function triggerRandomAction(): DJAction {
  const action = getRandomAction();
  try {
    action.execute();
  } catch (err) {
    console.error('[DJActions] action failed, audio state preserved', err);
  }
  return action;
}

export { actions as djActions };
