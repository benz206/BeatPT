import { computeOnsetEnvelope, detectBPM, trackBeats, detectDownbeat } from './BPMDetector';
import { analyzeEnergy, type EnergySegment } from './EnergyAnalyzer';
import { detectKey, type TrackKey } from './KeyDetector';
import { computeTrimGain } from './Loudness';

export interface AnalysisRequest {
  id: number;
  channelData: Float32Array;
  sampleRate: number;
  duration: number;
}

export interface AnalysisResult {
  id: number;
  bpm: number;
  key: TrackKey;
  gain: number;
  downbeatIndex: number;
  waveformData: number[];
  beatPositions: number[];
  energySegments: EnergySegment[];
}

function generateWaveformData(channelData: Float32Array, points = 200): number[] {
  const blockSize = Math.floor(channelData.length / points);
  const waveform: number[] = [];

  for (let i = 0; i < points; i++) {
    let peak = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > peak) peak = abs;
    }
    waveform.push(peak);
  }

  return waveform;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, channelData, sampleRate, duration } = e.data;

  const onsetEnv = computeOnsetEnvelope(channelData, sampleRate);
  const bpm = detectBPM(onsetEnv);
  const beatPositions = trackBeats(onsetEnv, bpm, duration);
  const downbeatIndex = detectDownbeat(channelData, sampleRate, beatPositions);
  const waveformData = generateWaveformData(channelData);
  const energySegments = analyzeEnergy(channelData, sampleRate, duration, beatPositions, downbeatIndex);
  const key = detectKey(channelData, sampleRate);
  const gain = computeTrimGain(channelData, sampleRate);

  const result: AnalysisResult = { id, bpm, key, gain, downbeatIndex, waveformData, beatPositions, energySegments };
  ctx.postMessage(result);
};
