export function generateBeatPositions(bpm: number, duration: number, phase = 0): number[] {
  const interval = 60 / bpm;
  const positions: number[] = [];
  for (let t = phase; t < duration; t += interval) {
    positions.push(t);
  }
  return positions;
}

// Find the grid offset (0..one beat, in seconds) that best lines up with onsets,
// so generated beat positions land on actual beats instead of being anchored at t=0.
export function detectBeatPhase(channelData: Float32Array, sampleRate: number, bpm: number): number {
  const step = Math.floor(sampleRate / 200);
  const envRate = sampleRate / step;

  const env: number[] = [];
  for (let i = 0; i < channelData.length; i += step) {
    env.push(Math.abs(channelData[i]));
  }

  // Onset strength: positive energy increase emphasizes beat attacks
  const onsets: number[] = [0];
  for (let i = 1; i < env.length; i++) {
    onsets.push(Math.max(0, env[i] - env[i - 1]));
  }

  const beatLen = (60 / bpm) * envRate;
  const limit = Math.min(onsets.length, Math.floor(envRate * 90));
  const nOffsets = 48;

  let bestOffset = 0;
  let bestScore = -1;
  for (let k = 0; k < nOffsets; k++) {
    const offset = (k / nOffsets) * beatLen;
    let score = 0;
    for (let p = offset; p < limit; p += beatLen) {
      score += onsets[Math.round(p)] ?? 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  return bestOffset / envRate;
}

export function detectBPM(channelData: Float32Array, sampleRate: number): number {
  // Downsample to reduce computation — process every Nth sample
  const step = Math.floor(sampleRate / 200);
  const downsampled: number[] = [];
  for (let i = 0; i < channelData.length; i += step) {
    downsampled.push(Math.abs(channelData[i]));
  }

  // Smooth with a simple moving average to emphasize energy bursts (acts as low-pass)
  const windowSize = 10;
  const smoothed: number[] = [];
  for (let i = 0; i < downsampled.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(downsampled.length - 1, i + windowSize); j++) {
      sum += downsampled[j];
      count++;
    }
    smoothed.push(sum / count);
  }

  // Find peaks: local maxima above a dynamic threshold
  const mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
  const threshold = mean * 1.4;

  const peaks: number[] = [];
  const minPeakDistance = Math.floor((60 / 200) * (sampleRate / step));

  let lastPeak = -minPeakDistance;
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (
      smoothed[i] > threshold &&
      smoothed[i] >= smoothed[i - 1] &&
      smoothed[i] >= smoothed[i + 1] &&
      i - lastPeak >= minPeakDistance
    ) {
      peaks.push(i);
      lastPeak = i;
    }
  }

  if (peaks.length < 2) return 120;

  // Compute intervals between consecutive peaks
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  // Median interval is more robust than mean
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Convert interval (in downsampled units) back to seconds
  const intervalSecs = (median * step) / sampleRate;
  const bpm = 60 / intervalSecs;

  return Math.round(Math.max(60, Math.min(200, bpm)));
}
