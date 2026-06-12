export interface OnsetEnvelope {
  onsets: Float32Array; // half-wave-rectified energy flux, one value per hop
  envRate: number;      // envelope frames per second
}

export function computeOnsetEnvelope(channelData: Float32Array, sampleRate: number): OnsetEnvelope {
  const H = Math.max(1, Math.round(sampleRate / 86)); // ~512 samples at 44.1kHz
  const win = 2 * H;
  const nFrames = Math.floor(channelData.length / H);
  const envRate = sampleRate / H;

  if (nFrames < 2) {
    return { onsets: new Float32Array(0), envRate };
  }

  // Log-compressed energy per frame (window centered on the hop position).
  const log = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    const start = f * H;
    const end = Math.min(start + win, channelData.length);
    let sumSq = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sumSq += channelData[j] * channelData[j];
      count++;
    }
    const energy = count > 0 ? sumSq / count : 0;
    log[f] = Math.log(1 + 1000 * energy);
  }

  // Half-wave-rectified flux.
  const onsets = new Float32Array(nFrames);
  onsets[0] = 0;
  for (let i = 1; i < nFrames; i++) {
    const diff = log[i] - log[i - 1];
    onsets[i] = diff > 0 ? diff : 0;
  }

  // Normalize by standard deviation.
  let mean = 0;
  for (let i = 0; i < nFrames; i++) mean += onsets[i];
  mean /= nFrames;
  let variance = 0;
  for (let i = 0; i < nFrames; i++) {
    const d = onsets[i] - mean;
    variance += d * d;
  }
  variance /= nFrames;
  const std = Math.sqrt(variance) + 1e-9;
  for (let i = 0; i < nFrames; i++) onsets[i] /= std;

  return { onsets, envRate };
}

// Fractional BPM in [60, 200]. Never round to integer. Returns 120 on degenerate input.
export function detectBPM(onsetEnv: OnsetEnvelope): number {
  const { onsets, envRate } = onsetEnv;

  const minLag = Math.floor(envRate * 60 / 200); // fastest tempo -> shortest lag
  const maxLag = Math.ceil(envRate * 60 / 60);    // slowest tempo -> longest lag

  // Bound autocorrelation cost to the first ~180 s of envelope.
  const n = Math.min(onsets.length, Math.floor(envRate * 180));

  if (n < minLag + 2 || maxLag <= minLag) return 120;

  // Raw autocorrelation over the candidate lag range (plus headroom for 2*lag).
  const acMax = Math.min(2 * maxLag, n - 1);
  const ac = new Float64Array(acMax + 1);
  for (let lag = minLag; lag <= acMax; lag++) {
    let sum = 0;
    for (let i = lag; i < n; i++) {
      sum += onsets[i] * onsets[i - lag];
    }
    ac[lag] = sum;
  }

  const lag120 = envRate * 60 / 120;

  let bestLag = -1;
  let bestTotal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const wExp = Math.log2(lag / lag120) / 1.0;
    const w = Math.exp(-0.5 * wExp * wExp);
    const lagHalf = Math.round(lag / 2);
    const acDouble = 2 * lag <= acMax ? ac[2 * lag] : 0;
    const acHalf = lagHalf >= minLag && lagHalf <= acMax ? ac[lagHalf] : 0;
    const total = w * ac[lag] + 0.5 * acDouble + 0.25 * acHalf;
    if (total > bestTotal) {
      bestTotal = total;
      bestLag = lag;
    }
  }

  if (bestLag < 0) return 120;

  // Parabolic interpolation through ac at (best-1, best, best+1) for a fractional lag.
  let refinedLag = bestLag;
  if (bestLag - 1 >= minLag && bestLag + 1 <= acMax) {
    const yPrev = ac[bestLag - 1];
    const yMid = ac[bestLag];
    const yNext = ac[bestLag + 1];
    const denom = yPrev - 2 * yMid + yNext;
    if (denom !== 0) {
      const delta = 0.5 * (yPrev - yNext) / denom;
      if (delta > -1 && delta < 1) refinedLag = bestLag + delta;
    }
  }

  const bpm = 60 * envRate / refinedLag;
  return Math.max(60, Math.min(200, bpm));
}

// Dynamic-programming beat tracking (Ellis 2007). Returns beat times in seconds, ascending.
export function trackBeats(onsetEnv: OnsetEnvelope, bpm: number, duration: number): number[] {
  const { onsets, envRate } = onsetEnv;
  const p = 60 * envRate / bpm; // beat period in frames (fractional)
  const n = onsets.length;

  const fallbackGrid = (): number[] => {
    const grid: number[] = [];
    const interval = 60 / bpm;
    for (let t = 0; t < duration; t += interval) grid.push(t);
    return grid;
  };

  if (n < 2 || p < 1) return fallbackGrid();

  const tightness = 100;
  const score = new Float32Array(n);
  const backlink = new Int32Array(n);

  const minStep = Math.max(1, Math.floor(p / 2));
  const maxStep = Math.ceil(2 * p);

  for (let i = 0; i < n; i++) {
    let bestPrev = -Infinity;
    let bestJ = -1;
    const jStart = i - maxStep;
    const jEnd = i - minStep;
    for (let j = jStart; j <= jEnd; j++) {
      if (j < 0) continue;
      const ratio = (i - j) / p;
      const logr = Math.log(ratio);
      const candidate = score[j] - tightness * logr * logr;
      if (candidate > bestPrev) {
        bestPrev = candidate;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      score[i] = onsets[i] + bestPrev;
      backlink[i] = bestJ;
    } else {
      score[i] = onsets[i];
      backlink[i] = -1;
    }
  }

  // Backtrack from the best score among the last 2p frames.
  const tailStart = Math.max(0, n - maxStep);
  let endIdx = -1;
  let bestEnd = -Infinity;
  for (let i = tailStart; i < n; i++) {
    if (score[i] > bestEnd) {
      bestEnd = score[i];
      endIdx = i;
    }
  }

  if (endIdx < 0) return fallbackGrid();

  const indices: number[] = [];
  let cur = endIdx;
  while (cur >= 0) {
    indices.push(cur);
    cur = backlink[cur];
  }
  indices.reverse();

  if (indices.length < 2) return fallbackGrid();

  return indices.map(i => i / envRate);
}

// One-pole 150 Hz lowpass producing a bass-band signal in a single pass.
function bassLowpass(channelData: Float32Array, sampleRate: number): Float32Array {
  const k = 1 - Math.exp(-2 * Math.PI * 150 / sampleRate);
  const out = new Float32Array(channelData.length);
  let y = 0;
  for (let n = 0; n < channelData.length; n++) {
    y = y + k * (channelData[n] - y);
    out[n] = y;
  }
  return out;
}

// Per-beat RMS of the bass-band (150 Hz lowpassed) signal.
export function bassEnvelopePerBeat(
  channelData: Float32Array,
  sampleRate: number,
  beatPositions: number[]
): number[] {
  if (beatPositions.length < 2) return [];
  const bass = bassLowpass(channelData, sampleRate);
  const rms: number[] = [];
  for (let i = 0; i < beatPositions.length - 1; i++) {
    const start = Math.floor(beatPositions[i] * sampleRate);
    const end = Math.min(Math.floor(beatPositions[i + 1] * sampleRate), bass.length);
    const count = end - start;
    if (count <= 0) { rms.push(0); continue; }
    let sumSq = 0;
    for (let j = start; j < end; j++) sumSq += bass[j] * bass[j];
    rms.push(Math.sqrt(sumSq / count));
  }
  return rms;
}

// Index (0..3) into beatPositions of the first downbeat (bar start).
export function detectDownbeat(
  channelData: Float32Array,
  sampleRate: number,
  beatPositions: number[]
): number {
  if (beatPositions.length < 8) return 0;

  const bassRMS = bassEnvelopePerBeat(channelData, sampleRate, beatPositions);

  const bassFlux: number[] = new Array(bassRMS.length);
  bassFlux[0] = bassRMS[0];
  for (let i = 1; i < bassRMS.length; i++) {
    const d = bassRMS[i] - bassRMS[i - 1];
    bassFlux[i] = d > 0 ? d : 0;
  }

  let bestOffset = 0;
  let bestScore = -Infinity;
  for (let o = 0; o < 4; o++) {
    let score = 0;
    for (let i = o; i < bassRMS.length; i += 4) {
      score += bassRMS[i] + 2 * bassFlux[i];
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = o;
    }
  }

  return bestOffset;
}
