// Linear trim gain that normalizes perceived loudness to a -14 dBFS RMS target.
export function computeTrimGain(channelData: Float32Array, sampleRate: number): number {
  const winSamples = Math.floor(0.4 * sampleRate);  // 400 ms windows
  const hopSamples = Math.floor(0.1 * sampleRate);  // 100 ms hop

  if (winSamples < 1 || hopSamples < 1 || channelData.length < winSamples) return 1;

  const floor = Math.pow(10, -60 / 20); // -60 dBFS gate
  const rmsValues: number[] = [];

  for (let start = 0; start + winSamples <= channelData.length; start += hopSamples) {
    let sumSq = 0;
    for (let j = start; j < start + winSamples; j++) {
      sumSq += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sumSq / winSamples);
    if (rms >= floor) rmsValues.push(rms);
  }

  if (rmsValues.length === 0) return 1;

  rmsValues.sort((a, b) => a - b);
  const idx = Math.min(rmsValues.length - 1, Math.floor(0.95 * (rmsValues.length - 1)));
  const loudness = rmsValues[idx];

  if (loudness <= 0) return 1;

  const loudnessDb = 20 * Math.log10(loudness);
  const gain = Math.pow(10, (-14 - loudnessDb) / 20);
  return Math.max(0.5, Math.min(1.6, gain));
}
