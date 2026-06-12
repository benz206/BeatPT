import { AudioEngine } from './AudioEngine';
import { parseMetadata } from './MetadataParser';
import type { AnalysisResult } from './analysisWorker';
import type { Track } from '../stores/useAppStore';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (result: AnalysisResult) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AnalysisResult>) => {
      const resolve = pending.get(e.data.id);
      pending.delete(e.data.id);
      resolve?.(e.data);
    };
  }
  return worker;
}

function analyzeInWorker(audioBuffer: AudioBuffer): Promise<AnalysisResult> {
  // Copy the channel data — transferring the original would detach the AudioBuffer's storage
  const channelData = audioBuffer.getChannelData(0).slice();
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    getWorker().postMessage(
      { id, channelData, sampleRate: audioBuffer.sampleRate, duration: audioBuffer.duration },
      [channelData.buffer]
    );
  });
}

export async function analyzeTrackFile(file: File): Promise<Track> {
  const engine = AudioEngine.getInstance();

  const arrayBuffer = await file.arrayBuffer();
  const metadata = parseMetadata(arrayBuffer);
  const audioBuffer = await engine.decodeAudioFile(arrayBuffer);
  const { bpm, waveformData, beatPositions, energySegments } = await analyzeInWorker(audioBuffer);

  return {
    id: `${file.name}-${file.size}`,
    name: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
    artist: metadata.artist || 'Unknown Artist',
    duration: audioBuffer.duration,
    bpm,
    filePath: file.name,
    audioBuffer,
    waveformData,
    beatPositions,
    energySegments,
    albumArt: metadata.albumArt,
  };
}
