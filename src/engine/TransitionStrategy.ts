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
  if (ratio >= 1.9 && ratio <= 2.1) return 'half-double';
  const gap = Math.abs(fromBPM - toBPM);
  if (gap < 5) return 'same';
  if (gap < 15) return 'small-gap';
  return 'large-gap';
}

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
  let estimatedDuration: number;

  switch (relationship) {
    case 'same':
      type = 'long-blend';
      estimatedDuration = 24;
      break;
    case 'small-gap':
      if (Math.random() < 0.5) {
        type = 'tempo-ramp';
        estimatedDuration = 26;
      } else {
        type = 'filter-sweep';
        estimatedDuration = 20;
      }
      break;
    case 'large-gap':
      if (Math.random() < 0.5) {
        type = 'echo-drop';
        estimatedDuration = 8;
      } else {
        type = 'breakdown-bridge';
        estimatedDuration = 16;
      }
      break;
    case 'half-double':
      type = 'long-blend';
      estimatedDuration = 24;
      break;
  }

  return {
    type,
    relationship,
    bpmGap,
    estimatedDuration,
    description: DESCRIPTIONS[type](fromTrack.bpm, toTrack.bpm),
  };
}
