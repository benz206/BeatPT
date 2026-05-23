export type EnergySegmentType = 'low' | 'rising' | 'peak' | 'falling';

export interface EnergySegment {
  startBeat: number;
  endBeat: number;
  startTime: number;
  endTime: number;
  type: EnergySegmentType;
  avgEnergy: number;
}

export function analyzeEnergy(audioBuffer: AudioBuffer, beatPositions: number[]): EnergySegment[] {
  if (beatPositions.length < 2) return [];

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  const beatEnergies: number[] = [];
  for (let i = 0; i < beatPositions.length - 1; i++) {
    const startSample = Math.floor(beatPositions[i] * sampleRate);
    const endSample = Math.floor(beatPositions[i + 1] * sampleRate);
    const count = endSample - startSample;
    if (count <= 0) { beatEnergies.push(0); continue; }
    let sumSquares = 0;
    for (let j = startSample; j < endSample && j < channelData.length; j++) {
      sumSquares += channelData[j] * channelData[j];
    }
    beatEnergies.push(Math.sqrt(sumSquares / count));
  }

  const smoothWindow = 4;
  const smoothed: number[] = [];
  for (let i = 0; i < beatEnergies.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - smoothWindow); j <= Math.min(beatEnergies.length - 1, i + smoothWindow); j++) {
      sum += beatEnergies[j];
      count++;
    }
    smoothed.push(sum / count);
  }

  const maxEnergy = Math.max(...smoothed, 0.001);
  const normalized = smoothed.map(e => e / maxEnergy);

  const groupSize = 8;
  const segments: EnergySegment[] = [];

  for (let g = 0; g < normalized.length; g += groupSize) {
    const end = Math.min(g + groupSize, normalized.length);
    const groupEnergies = normalized.slice(g, end);
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
      endTime: end < beatPositions.length ? beatPositions[end] : audioBuffer.duration,
      type,
      avgEnergy,
    });
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
