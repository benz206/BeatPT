export type BPMRelationship = 'same' | 'small-gap' | 'large-gap' | 'half-double';
export type TransitionType = 'long-blend' | 'tempo-ramp' | 'filter-sweep' | 'echo-drop' | 'breakdown-bridge';

export interface TransitionPlan {
  type: TransitionType;
  relationship: BPMRelationship;
  bpmGap: number;
  estimatedDuration: number;
  description: string;
}

export function classifyBPMRelationship(fromBPM: number, toBPM: number): BPMRelationship {
  const ratio = Math.max(fromBPM, toBPM) / Math.min(fromBPM, toBPM);
  if (ratio >= 1.8 && ratio <= 2.2) return 'half-double';
  // Classify by the pitch adjustment a tempo match would need, not absolute BPM gap
  if (ratio <= 1.04) return 'same';
  if (ratio <= 1.1) return 'small-gap';
  return 'large-gap';
}

// Crossfade length per transition type, in beats of the outgoing track
export const FADE_BEATS: Record<TransitionType, number> = {
  'long-blend': 32,
  'tempo-ramp': 24,
  'filter-sweep': 24,
  'breakdown-bridge': 12,
  'echo-drop': 4,
};

const DESCRIPTIONS: Record<TransitionType, (from: number, to: number) => string> = {
  'long-blend':        (f, t) => `Long Blend — syncing ${Math.round(f)}→${Math.round(t)} BPM`,
  'tempo-ramp':        (f, t) => `Tempo Ramp — ramping ${Math.round(f)}→${Math.round(t)} BPM`,
  'filter-sweep':      (f, t) => `Filter Sweep — blending ${Math.round(f)}→${Math.round(t)} BPM`,
  'echo-drop':         (f, t) => `Echo Drop — cutting from ${Math.round(f)} to ${Math.round(t)} BPM`,
  'breakdown-bridge':  (f, t) => `Breakdown Bridge — bridging ${Math.round(f)} to ${Math.round(t)} BPM`,
};

export function selectTransition(
  fromTrack: { bpm: number },
  toTrack: { bpm: number },
): TransitionPlan {
  const relationship = classifyBPMRelationship(fromTrack.bpm, toTrack.bpm);
  const bpmGap = Math.abs(fromTrack.bpm - toTrack.bpm);

  let type: TransitionType;

  switch (relationship) {
    case 'same':
    case 'half-double':
      type = 'long-blend';
      break;
    case 'small-gap':
      type = Math.random() < 0.5 ? 'tempo-ramp' : 'filter-sweep';
      break;
    case 'large-gap':
      type = Math.random() < 0.5 ? 'echo-drop' : 'breakdown-bridge';
      break;
  }

  const beat = 60 / fromTrack.bpm;
  const estimatedDuration = FADE_BEATS[type] * beat + (type === 'echo-drop' ? 4 : 2);

  return {
    type,
    relationship,
    bpmGap,
    estimatedDuration,
    description: DESCRIPTIONS[type](fromTrack.bpm, toTrack.bpm),
  };
}
