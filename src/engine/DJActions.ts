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

function bpmGuess(): number {
  const state = useAppStore.getState();
  const aDeck = state.deckA.track;
  const bDeck = state.deckB.track;
  if (aDeck && bDeck) return (aDeck.bpm + bDeck.bpm) / 2;
  if (aDeck) return aDeck.bpm;
  if (bDeck) return bDeck.bpm;
  return 128;
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
      effect.apply(e.getDeckOutputNode(deck), bpmGuess(), audioCtx());
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
      e.setEQ(a, 'low', settings.deckA.low);
      e.setEQ(b, 'low', settings.deckB.low);
      setTimeout(() => {
        e.setEQ(a, 'low', currentALow);
        e.setEQ(b, 'low', currentBLow);
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
      effect.apply(e.getDeckOutputNode(deck), bpmGuess(), audioCtx());
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
      const bpm = bpmGuess();
      const beatSecs = 60 / bpm;
      const ctx = audioCtx();
      const gainNode = e.getDeckOutputNode(deck);
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.02);
      gainNode.gain.setValueAtTime(0, now + beatSecs * 2 - 0.02);
      gainNode.gain.linearRampToValueAtTime(1, now + beatSecs * 2);
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
      effect.apply(e.getDeckOutputNode(deck), bpmGuess(), audioCtx());
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
      e.setEQ(deck, band, -12);
      setTimeout(() => e.setEQ(deck, band, current), 2500);
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
      const bpm = bpmGuess();
      const beatSecs = 60 / bpm;
      const gainNode = e.getDeckOutputNode(deck);
      const ctx = audioCtx();
      const pulses = 8;
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      for (let i = 0; i < pulses; i++) {
        const t = now + i * beatSecs;
        gainNode.gain.linearRampToValueAtTime(0.15, t + beatSecs * 0.1);
        gainNode.gain.linearRampToValueAtTime(1, t + beatSecs * 0.9);
      }
      gainNode.gain.linearRampToValueAtTime(1, now + pulses * beatSecs);
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
      effect.apply(e.getDeckOutputNode(deck), bpmGuess(), audioCtx());
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
      const ctx = audioCtx();
      const gainNode = e.getDeckOutputNode(deck);
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.8);
      gainNode.gain.setValueAtTime(0, now + 0.85);
      gainNode.gain.linearRampToValueAtTime(1, now + 1.1);
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
