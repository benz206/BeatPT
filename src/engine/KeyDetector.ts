export interface TrackKey {
  camelot: string; // e.g. '8A'
  name: string;    // e.g. 'A Minor'
}

// Krumhansl-Schmuckler profiles, index 0 = C
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Camelot codes indexed by tonic pitch class (C=0 .. B=11)
const MAJOR_CAMELOT = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const MINOR_CAMELOT = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

// Note names matching the flat convention in the spec
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// --- Radix-2 in-place FFT (complex, power-of-2 length) ---

function bitReverse(n: number, bits: number): number {
  let rev = 0;
  for (let i = 0; i < bits; i++) {
    rev = (rev << 1) | (n & 1);
    n >>= 1;
  }
  return rev;
}

// re and im are interleaved: re[0], im[0], re[1], im[1], ...
// size must be a power of 2; buf must have length 2*size
function fftInPlace(buf: Float64Array, size: number): void {
  const bits = Math.log2(size);

  // Bit-reversal permutation
  for (let i = 0; i < size; i++) {
    const j = bitReverse(i, bits);
    if (j > i) {
      let tmp = buf[2 * i];     buf[2 * i]     = buf[2 * j];     buf[2 * j]     = tmp;
      tmp      = buf[2 * i + 1]; buf[2 * i + 1] = buf[2 * j + 1]; buf[2 * j + 1] = tmp;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= size; len <<= 1) {
    const half = len >> 1;
    const angStep = -2 * Math.PI / len;
    for (let start = 0; start < size; start += len) {
      for (let k = 0; k < half; k++) {
        const angle = angStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const uRe = buf[2 * (start + k)];
        const uIm = buf[2 * (start + k) + 1];
        const vRe = wr * buf[2 * (start + k + half)] - wi * buf[2 * (start + k + half) + 1];
        const vIm = wr * buf[2 * (start + k + half) + 1] + wi * buf[2 * (start + k + half)];
        buf[2 * (start + k)]         = uRe + vRe;
        buf[2 * (start + k) + 1]     = uIm + vIm;
        buf[2 * (start + k + half)]  = uRe - vRe;
        buf[2 * (start + k + half) + 1] = uIm - vIm;
      }
    }
  }
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let meanA = 0, meanB = 0;
  for (let i = 0; i < n; i++) { meanA += a[i]; meanB += b[i]; }
  meanA /= n; meanB /= n;
  let num = 0, da2 = 0, db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    da2 += da * da;
    db2 += db * db;
  }
  const denom = Math.sqrt(da2 * db2);
  return denom === 0 ? 0 : num / denom;
}

export function detectKey(channelData: Float32Array, sampleRate: number): TrackKey {
  const NEUTRAL: TrackKey = { camelot: '8A', name: 'A Minor' };

  // Step 1: center-crop to 90 seconds
  const maxSamples = Math.round(90 * sampleRate);
  let start = 0;
  let length = channelData.length;
  if (length > maxSamples) {
    start = Math.floor((length - maxSamples) / 2);
    length = maxSamples;
  }

  // Step 2: downsample to ~11025 Hz by integer averaging
  const targetRate = 11025;
  const factor = Math.max(1, Math.round(sampleRate / targetRate));
  const dsLength = Math.floor(length / factor);
  if (dsLength === 0) return NEUTRAL;

  const ds = new Float32Array(dsLength);
  for (let i = 0; i < dsLength; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += channelData[start + i * factor + j];
    ds[i] = sum / factor;
  }

  const dsRate = sampleRate / factor;

  // Step 3: frame the signal, apply Hann window, FFT per frame
  const FRAME = 4096;
  const HOP   = 2048;

  // Precompute Hann window
  const hann = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  }

  // Reusable FFT scratch buffer (interleaved real/imag)
  const fftBuf = new Float64Array(FRAME * 2);

  const chroma = new Float64Array(12);

  const freqResolution = dsRate / FRAME;
  const fLow  = 55;
  const fHigh = 1760;
  const binLow  = Math.ceil(fLow  / freqResolution);
  const binHigh = Math.floor(fHigh / freqResolution);

  let frameCount = 0;

  for (let frameStart = 0; frameStart + FRAME <= dsLength; frameStart += HOP) {
    // Fill FFT buffer: real = windowed sample, imag = 0
    for (let i = 0; i < FRAME; i++) {
      fftBuf[2 * i]     = ds[frameStart + i] * hann[i];
      fftBuf[2 * i + 1] = 0;
    }

    fftInPlace(fftBuf, FRAME);

    // Step 4: accumulate chroma
    for (let bin = binLow; bin <= binHigh && bin < FRAME / 2; bin++) {
      const f = bin * freqResolution;
      const mag = Math.sqrt(fftBuf[2 * bin] ** 2 + fftBuf[2 * bin + 1] ** 2);
      // pitch class mapping: A4=440 → pc 9, C=0
      const semitones = 12 * Math.log2(f / 440);
      const pc = ((Math.round(semitones) % 12) + 12 + 9) % 12;
      chroma[pc] += mag;
    }

    frameCount++;
  }

  if (frameCount === 0) return NEUTRAL;

  // Normalize chroma
  let chromaSum = 0;
  for (let i = 0; i < 12; i++) chromaSum += chroma[i];
  if (chromaSum === 0) return NEUTRAL;
  const chromaNorm: number[] = [];
  for (let i = 0; i < 12; i++) chromaNorm.push(chroma[i] / chromaSum);

  // Step 5: Pearson correlation against all 24 key profiles
  let bestCorr = -Infinity;
  let bestTonic = 0;
  let bestMode = 0; // 0 = major, 1 = minor

  for (let r = 0; r < 12; r++) {
    // Rotate chroma so tonic = r aligns with profile index 0
    const rotated: number[] = [];
    for (let i = 0; i < 12; i++) rotated.push(chromaNorm[(i + r) % 12]);

    const corrMaj = pearson(rotated, MAJOR_PROFILE);
    const corrMin = pearson(rotated, MINOR_PROFILE);

    if (corrMaj > bestCorr) { bestCorr = corrMaj; bestTonic = r; bestMode = 0; }
    if (corrMin > bestCorr) { bestCorr = corrMin; bestTonic = r; bestMode = 1; }
  }

  // Step 6: map to Camelot
  const camelot = bestMode === 0 ? MAJOR_CAMELOT[bestTonic] : MINOR_CAMELOT[bestTonic];
  const noteName = bestMode === 0 ? MAJOR_NAMES[bestTonic] : MINOR_NAMES[bestTonic];
  const modeName = bestMode === 0 ? 'Major' : 'Minor';

  return { camelot, name: `${noteName} ${modeName}` };
}

// Camelot wheel harmonic compatibility, 0..1.
// Returns 0.5 (neutral) if either key is null/undefined or unparseable.
export function keyCompatibility(
  a: TrackKey | null | undefined,
  b: TrackKey | null | undefined,
): number {
  if (!a || !b) return 0.5;

  const parse = (code: string): { n: number; letter: string } | null => {
    const m = code.match(/^(\d{1,2})([AB])$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (n < 1 || n > 12) return null;
    return { n, letter: m[2] };
  };

  const pa = parse(a.camelot);
  const pb = parse(b.camelot);
  if (!pa || !pb) return 0.5;

  if (pa.n === pb.n && pa.letter === pb.letter) return 1.0;
  if (pa.n === pb.n && pa.letter !== pb.letter) return 0.9;

  const diff = Math.abs(pa.n - pb.n);
  const d = Math.min(diff, 12 - diff);

  if (d === 1 && pa.letter === pb.letter) return 0.8;
  if (d === 1 && pa.letter !== pb.letter) return 0.5;
  if (d === 2 && pa.letter === pb.letter) return 0.4;
  return Math.max(0, 0.3 - 0.05 * d);
}
