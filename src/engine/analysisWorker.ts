import { detectBPM, detectBeatPhase, generateBeatPositions } from './BPMDetector';
import { analyzeEnergy, type EnergySegment } from './EnergyAnalyzer';

export interface AnalysisRequest {
  id: number;
  channelData: Float32Array;
  sampleRate: number;
  duration: number;
}

export interface AnalysisResult {
  id: number;
  bpm: number;
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

  const bpm = detectBPM(channelData, sampleRate);
  const waveformData = generateWaveformData(channelData);
  const beatPositions = generateBeatPositions(bpm, duration, detectBeatPhase(channelData, sampleRate, bpm));
  const energySegments = analyzeEnergy(channelData, sampleRate, duration, beatPositions);

  const result: AnalysisResult = { id, bpm, waveformData, beatPositions, energySegments };
  ctx.postMessage(result);
};
