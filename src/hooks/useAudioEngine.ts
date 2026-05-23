import { useRef, useCallback } from 'react';
import { AudioEngine } from '../engine/AudioEngine';
import { detectBPM } from '../engine/BPMDetector';
import { useAppStore } from '../stores/useAppStore';
import type { Track } from '../stores/useAppStore';

type Deck = 'A' | 'B';
type EQBand = 'low' | 'mid' | 'high';

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

function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine>(AudioEngine.getInstance());

  const addTrack = useAppStore((s) => s.addTrack);
  const loadTrackToDeck = useAppStore((s) => s.loadTrackToDeck);
  const updateDeck = useAppStore((s) => s.updateDeck);
  const setCrossfaderPosition = useAppStore((s) => s.setCrossfaderPosition);

  const loadTrack = useCallback(
    async (deck: Deck, file: File) => {
      const engine = engineRef.current;

      const arrayBuffer = await fileToArrayBuffer(file);
      const audioBuffer = await engine.decodeAudioFile(arrayBuffer);
      const bpm = detectBPM(audioBuffer);
      const waveformData = generateWaveformData(audioBuffer);

      // Derive a simple track id from name + size to deduplicate
      const id = `${file.name}-${file.size}`;
      const name = file.name.replace(/\.[^/.]+$/, '');

      const track: Track = {
        id,
        name,
        artist: 'Unknown Artist',
        duration: audioBuffer.duration,
        bpm,
        filePath: file.name,
        audioBuffer,
        waveformData,
      };

      addTrack(track);
      engine.loadTrack(deck, audioBuffer);
      loadTrackToDeck(deck, track);
    },
    [addTrack, loadTrackToDeck]
  );

  const play = useCallback(
    (deck: Deck) => {
      engineRef.current.play(deck);
      updateDeck(deck, { isPlaying: true });
    },
    [updateDeck]
  );

  const pause = useCallback(
    (deck: Deck) => {
      engineRef.current.pause(deck);
      updateDeck(deck, { isPlaying: false });
    },
    [updateDeck]
  );

  const togglePlayback = useCallback(
    (deck: Deck) => {
      const engine = engineRef.current;
      if (engine.isPlaying(deck)) {
        engine.pause(deck);
        updateDeck(deck, { isPlaying: false });
      } else {
        engine.play(deck);
        updateDeck(deck, { isPlaying: true });
      }
    },
    [updateDeck]
  );

  const setCrossfader = useCallback(
    (value: number) => {
      engineRef.current.setCrossfader(value);
      setCrossfaderPosition(value);
    },
    [setCrossfaderPosition]
  );

  const setVolume = useCallback(
    (deck: Deck, value: number) => {
      engineRef.current.setVolume(deck, value);
      updateDeck(deck, { volume: value });
    },
    [updateDeck]
  );

  const setEQ = useCallback(
    (deck: Deck, band: EQBand, value: number) => {
      engineRef.current.setEQ(deck, band, value);
      updateDeck(deck, {
        eq: {
          // Read current store eq by re-selecting inline
          ...useAppStore.getState()[deck === 'A' ? 'deckA' : 'deckB'].eq,
          [band]: value,
        },
      });
    },
    [updateDeck]
  );

  const getAnalyserNode = useCallback((deck: Deck): AnalyserNode => {
    return engineRef.current.getAnalyserNode(deck);
  }, []);

  return {
    loadTrack,
    play,
    pause,
    togglePlayback,
    setCrossfader,
    setVolume,
    setEQ,
    getAnalyserNode,
  };
}
