import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import type { Track } from '../stores/useAppStore';
import { detectBPM, generateBeatPositions } from '../engine/BPMDetector';
import { AudioEngine } from '../engine/AudioEngine';
import { parseMetadata } from '../engine/MetadataParser';

function generateWaveformData(audioBuffer: AudioBuffer, points = 200): number[] {
  const channelData = audioBuffer.getChannelData(0);
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

export function useFileImport() {
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addTrack = useAppStore((state) => state.addTrack);

  function getOrCreateInput(): HTMLInputElement {
    if (inputRef.current) return inputRef.current;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    inputRef.current = input;
    return input;
  }

  async function processFile(file: File): Promise<void> {
    const engine = AudioEngine.getInstance();

    const arrayBuffer = await file.arrayBuffer();
    const metadata = parseMetadata(arrayBuffer);
    const audioBuffer = await engine.decodeAudioFile(arrayBuffer);
    const bpm = detectBPM(audioBuffer);
    const waveformData = generateWaveformData(audioBuffer);
    const beatPositions = generateBeatPositions(bpm, audioBuffer.duration);

    const id = `${file.name}-${file.size}`;
    const name = metadata.title || file.name.replace(/\.[^/.]+$/, '');

    const track: Track = {
      id,
      name,
      artist: metadata.artist || 'Unknown Artist',
      duration: audioBuffer.duration,
      bpm,
      filePath: file.name,
      audioBuffer,
      waveformData,
      beatPositions,
      albumArt: metadata.albumArt,
    };

    addTrack(track);
  }

  const importFiles = useCallback(() => {
    const input = getOrCreateInput();

    input.onchange = async () => {
      const files = input.files;
      if (!files || files.length === 0) return;

      setIsImporting(true);
      try {
        await Promise.all(Array.from(files).map(processFile));
      } finally {
        setIsImporting(false);
        input.value = '';
      }
    };

    input.click();
  }, [addTrack]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('audio/')
      );
      if (files.length === 0) return;

      setIsImporting(true);
      try {
        await Promise.all(files.map(processFile));
      } finally {
        setIsImporting(false);
      }
    },
    [addTrack]
  );

  return { importFiles, isImporting, onDrop };
}
