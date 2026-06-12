import { bassEnvelopePerBeat } from './BPMDetector';

export type EnergySegmentType = 'low' | 'rising' | 'peak' | 'falling';

export interface EnergySegment {
  startBeat: number;
  endBeat: number;
  startTime: number;
  endTime: number;
  type: EnergySegmentType;
  avgEnergy: number;
}

export function analyzeEnergy(
  channelData: Float32Array,
  sampleRate: number,
  duration: number,
  beatPositions: number[],
  downbeatIndex = 0
): EnergySegment[] {
  if (beatPositions.length < 2) return [];

  // Full-band per-beat RMS.
  const fullEnergies: number[] = [];
  for (let i = 0; i < beatPositions.length - 1; i++) {
    const startSample = Math.floor(beatPositions[i] * sampleRate);
    const endSample = Math.floor(beatPositions[i + 1] * sampleRate);
    const count = endSample - startSample;
    if (count <= 0) { fullEnergies.push(0); continue; }
    let sumSquares = 0;
    for (let j = startSample; j < endSample && j < channelData.length; j++) {
      sumSquares += channelData[j] * channelData[j];
    }
    fullEnergies.push(Math.sqrt(sumSquares / count));
  }

  // Bass per-beat RMS via the shared 150 Hz lowpass helper.
  const bassEnergies = bassEnvelopePerBeat(channelData, sampleRate, beatPositions);

  // Normalize each band separately to [0,1] by its own max, then combine.
  const maxFull = Math.max(...fullEnergies, 0.001);
  const maxBass = Math.max(...bassEnergies, 0.001);
  const combinedRaw: number[] = [];
  for (let i = 0; i < fullEnergies.length; i++) {
    const normFull = fullEnergies[i] / maxFull;
    const normBass = (bassEnergies[i] ?? 0) / maxBass;
    combinedRaw.push(0.5 * normFull + 0.5 * normBass);
  }

  // Smooth combined energy (±4 beats).
  const smoothWindow = 4;
  const combined: number[] = [];
  for (let i = 0; i < combinedRaw.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - smoothWindow); j <= Math.min(combinedRaw.length - 1, i + smoothWindow); j++) {
      sum += combinedRaw[j];
      count++;
    }
    combined.push(sum / count);
  }

  const groupSize = 8;
  const segments: EnergySegment[] = [];

  const classify = (g: number, end: number): void => {
    const groupEnergies = combined.slice(g, end);
    if (groupEnergies.length === 0) return;
    const avgEnergy = groupEnergies.reduce((a, b) => a + b, 0) / groupEnergies.length;

    let slope = 0;
    if (groupEnergies.length > 1) {
      for (let i = 1; i < groupEnergies.length; i++) {
        slope += groupEnergies[i] - groupEnergies[i - 1];
      }
      slope /= (groupEnergies.length - 1);
    }

    let type: EnergySegmentType;
    if (avgEnergy > 0.7) {
      type = 'peak';
    } else if (avgEnergy < 0.3) {
      type = 'low';
    } else if (slope > 0.02) {
      type = 'rising';
    } else if (slope < -0.02) {
      type = 'falling';
    } else {
      type = avgEnergy >= 0.5 ? 'peak' : 'low';
    }

    segments.push({
      startBeat: g,
      endBeat: end - 1,
      startTime: beatPositions[g],
      endTime: end < beatPositions.length ? beatPositions[end] : duration,
      type,
      avgEnergy,
    });
  };

  // Beats before the downbeat form one stub group so blocks align to bars.
  const barStart = Math.min(Math.max(downbeatIndex, 0), combined.length);
  if (barStart > 0) classify(0, barStart);
  for (let g = barStart; g < combined.length; g += groupSize) {
    const end = Math.min(g + groupSize, combined.length);
    classify(g, end);
  }

  const merged: EnergySegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === seg.type) {
      prev.endBeat = seg.endBeat;
      prev.endTime = seg.endTime;
      prev.avgEnergy = (prev.avgEnergy + seg.avgEnergy) / 2;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

export function getCurrentSegment(
  segments: EnergySegment[],
  currentTime: number
): EnergySegment | null {
  for (const seg of segments) {
    if (currentTime >= seg.startTime && currentTime < seg.endTime) return seg;
  }
  return segments[segments.length - 1] ?? null;
}
