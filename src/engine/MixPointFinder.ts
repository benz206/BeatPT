import { EnergySegment, EnergySegmentType } from './EnergyAnalyzer';

export interface MixPoint {
  triggerTime: number;
  segmentType: EnergySegmentType;
  confidence: number;
}

export function findBestMixPoint(
  energySegments: EnergySegment[],
  trackDuration: number,
  transitionDuration: number,
  preferPeaks?: boolean
): MixPoint | null {
  const latestStart = trackDuration - transitionDuration - 2;
  if (latestStart <= 0) return null;

  const windowStart = Math.max(0, latestStart - 30);

  const candidates = energySegments.filter(
    (s) => s.startTime >= windowStart && s.startTime <= latestStart
  );

  if (candidates.length === 0) {
    return { triggerTime: latestStart, segmentType: 'low', confidence: 0.5 };
  }

  const scores: Record<EnergySegmentType, number> = preferPeaks
    ? { peak: 1.0, rising: 0.7, falling: 0.3, low: 0.2 }
    : { low: 1.0, falling: 0.8, rising: 0.3, peak: 0.1 };

  let best = candidates[0];
  let bestScore = scores[best.type];

  for (let i = 1; i < candidates.length; i++) {
    const score = scores[candidates[i].type];
    if (score > bestScore || (score === bestScore && candidates[i].startTime > best.startTime)) {
      best = candidates[i];
      bestScore = score;
    }
  }

  return { triggerTime: best.startTime, segmentType: best.type, confidence: bestScore };
}
