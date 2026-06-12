import { EnergySegment, EnergySegmentType } from './EnergyAnalyzer';

export interface MixTrackInfo {
  bpm: number;
  duration: number;
  beatPositions: number[];
  downbeatIndex: number;
  energySegments: EnergySegment[];
}

export interface MixPoint {
  triggerTime: number;
  segmentType: EnergySegmentType;
  confidence: number;
}

// Returns beat times that are phrase boundaries: indices downbeatIndex + k*16.
// Falls back to bar boundaries (k*4) if fewer than 16 beats, then to raw time.
function phraseBoundaryTimes(track: MixTrackInfo): number[] {
  const { beatPositions, downbeatIndex } = track;
  if (beatPositions.length === 0) return [];

  const di = Math.max(0, Math.min(downbeatIndex, beatPositions.length - 1));
  const available = beatPositions.length - di;

  // Determine step: 16-beat phrases, or 4-beat bars if track is short
  const step = available >= 16 ? 16 : available >= 4 ? 4 : 1;

  const times: number[] = [];
  for (let k = 0; di + k * step < beatPositions.length; k++) {
    times.push(beatPositions[di + k * step]);
  }
  return times;
}

// Nearest phrase-boundary at-or-before (direction='before') or at-or-after
// (direction='after') the given time. Clamps to available beat range.
function snapToPhraseStart(
  track: MixTrackInfo,
  time: number,
  direction: 'before' | 'after',
): number {
  const boundaries = phraseBoundaryTimes(track);
  if (boundaries.length === 0) return time;

  if (direction === 'before') {
    // Walk backward to find the last boundary <= time
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (boundaries[i] <= time) return boundaries[i];
    }
    // All boundaries are after time; clamp to the first
    return boundaries[0];
  } else {
    // Walk forward to find the first boundary >= time
    for (let i = 0; i < boundaries.length; i++) {
      if (boundaries[i] >= time) return boundaries[i];
    }
    // All boundaries are before time; clamp to the last
    return boundaries[boundaries.length - 1];
  }
}

// Segment containing triggerTime, or null.
function segmentAt(
  energySegments: EnergySegment[],
  time: number,
): EnergySegment | null {
  for (const seg of energySegments) {
    if (time >= seg.startTime && time < seg.endTime) return seg;
  }
  return energySegments[energySegments.length - 1] ?? null;
}

export function findBestMixPoint(
  track: MixTrackInfo,
  transitionDuration: number,
  preferPeaks?: boolean,
): MixPoint | null {
  const latestStart = track.duration - transitionDuration - 2;
  if (latestStart <= 0) return null;

  // Degenerate: no beat/segment data
  if (track.beatPositions.length === 0 || track.energySegments.length === 0) {
    return { triggerTime: latestStart, segmentType: 'low', confidence: 0.5 };
  }

  // Find outro: last contiguous run of low/falling from the track end
  const segs = track.energySegments;
  let outroStart = latestStart;
  {
    let runStart = segs[segs.length - 1].endTime;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (segs[i].type === 'low' || segs[i].type === 'falling') {
        runStart = segs[i].startTime;
      } else {
        break;
      }
    }
    // Only treat it as an outro if the run actually reaches the track end
    const lastSegEnd = segs[segs.length - 1].endTime;
    if (runStart < lastSegEnd) {
      outroStart = runStart;
    }
  }

  const SNAP_GUARD = 45;

  if (preferPeaks) {
    // Score segments whose startTime falls in [latestStart - 45, latestStart]
    const windowStart = latestStart - SNAP_GUARD;
    const peakScores: Record<EnergySegmentType, number> = {
      peak: 1.0, rising: 0.7, falling: 0.3, low: 0.2,
    };

    let best: EnergySegment | null = null;
    let bestScore = -1;

    for (const seg of segs) {
      if (seg.startTime < windowStart || seg.startTime > latestStart) continue;
      const score = peakScores[seg.type];
      if (score > bestScore || (score === bestScore && best && seg.startTime > best.startTime)) {
        best = seg;
        bestScore = score;
      }
    }

    if (best) {
      let triggerTime = snapToPhraseStart(track, best.startTime, 'before');
      if (triggerTime < best.startTime - SNAP_GUARD) {
        triggerTime = snapToPhraseStart(track, best.startTime, 'after');
      }
      triggerTime = Math.min(triggerTime, latestStart);
      const seg = segmentAt(segs, triggerTime);
      return {
        triggerTime,
        segmentType: seg?.type ?? 'peak',
        confidence: 0.9,
      };
    }

    // Fall through to default below
  }

  // Default: blend starts as the outro begins
  const ideal = Math.min(outroStart, latestStart);
  let triggerTime = snapToPhraseStart(track, ideal, 'before');

  if (triggerTime < ideal - SNAP_GUARD) {
    triggerTime = snapToPhraseStart(track, ideal, 'after');
  }
  triggerTime = Math.min(triggerTime, latestStart);

  const seg = segmentAt(segs, triggerTime);
  const inOutro = triggerTime >= outroStart || triggerTime <= ideal + 1;
  const confidence = inOutro && seg ? 0.9 : 0.6;

  return {
    triggerTime,
    segmentType: seg?.type ?? 'low',
    confidence,
  };
}

// Where to start the incoming track: skip a quiet intro and drop in at the
// first energetic section, as long as ≥60s of track remains after it.
// Result is snapped to the next phrase boundary so the deck starts on a downbeat.
export function findMixInPoint(track: MixTrackInfo): number {
  const { energySegments, duration, beatPositions, downbeatIndex } = track;

  let t = 0;
  for (const seg of energySegments) {
    if (seg.type !== 'low') {
      t = duration - seg.startTime > 60 ? seg.startTime : 0;
      break;
    }
  }

  // Always snap to the next phrase boundary so we land on a downbeat
  if (t === 0) {
    // For t=0, use the first phrase boundary (downbeat) if available
    const di = Math.max(0, Math.min(downbeatIndex, beatPositions.length - 1));
    return beatPositions[di] ?? 0;
  }

  return snapToPhraseStart(track, t, 'after');
}
