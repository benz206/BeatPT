import type { Track } from '../stores/useAppStore';
import { keyCompatibility } from './KeyDetector';

function meanEnergy(track: Track): number {
  const segs = track.energySegments;
  if (segs.length === 0) return 0.5;

  let weightedSum = 0;
  let totalDuration = 0;
  for (const seg of segs) {
    const dur = seg.endTime - seg.startTime;
    weightedSum += seg.avgEnergy * dur;
    totalDuration += dur;
  }
  return totalDuration > 0 ? weightedSum / totalDuration : 0.5;
}

// 0..1: how well `to` would mix after `from`
export function scoreTransitionPair(from: Track, to: Track): number {
  // Tempo score: try half/double matches, penalize >12% pitch correction
  const ratios = [0.5, 1, 2];
  let minErr = Infinity;
  for (const mult of ratios) {
    const err = Math.abs(Math.log2(from.bpm / (to.bpm * mult)));
    if (err < minErr) minErr = err;
  }
  const tempoScore = Math.max(0, 1 - minErr / 0.12);

  // Key score
  const keyScore = keyCompatibility(from.key, to.key);

  // Energy score
  const meanFrom = meanEnergy(from);
  const meanTo = meanEnergy(to);
  const energyScore = Math.max(0, Math.min(1, 1 - Math.abs(meanFrom - meanTo)));

  return 0.5 * tempoScore + 0.3 * keyScore + 0.2 * energyScore;
}

// Best next track from the library, or null. Skips `from` itself and tracks
// without a decoded buffer.
export function pickNextTrack(from: Track, candidates: Track[]): Track | null {
  const eligible = candidates.filter((t) => t.id !== from.id && t.audioBuffer !== null);
  if (eligible.length === 0) return null;

  let best = eligible[0];
  let bestScore = scoreTransitionPair(from, eligible[0]);

  for (let i = 1; i < eligible.length; i++) {
    const score = scoreTransitionPair(from, eligible[i]);
    if (score > bestScore) {
      best = eligible[i];
      bestScore = score;
    }
  }

  return best;
}
