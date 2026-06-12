import { useRef, useCallback } from 'react';
import { AudioEngine } from '../engine/AudioEngine';
import { analyzeTrackFile } from '../engine/TrackAnalyzer';
import { useAppStore } from '../stores/useAppStore';

type Deck = 'A' | 'B';
type EQBand = 'low' | 'mid' | 'high';

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine>(AudioEngine.getInstance());

  const addTrack = useAppStore((s) => s.addTrack);
  const loadTrackToDeck = useAppStore((s) => s.loadTrackToDeck);
  const updateDeck = useAppStore((s) => s.updateDeck);
  const setCrossfaderPosition = useAppStore((s) => s.setCrossfaderPosition);

  const loadTrack = useCallback(
    async (deck: Deck, file: File) => {
      const track = await analyzeTrackFile(file);
      addTrack(track);
      engineRef.current.loadTrack(deck, track.audioBuffer!);
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

  const seek = useCallback((deck: Deck, position: number) => {
    engineRef.current.seek(deck, position);
  }, []);

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

  const setSpeed = useCallback(
    (deck: Deck, value: number) => {
      const clamped = Math.max(0.5, Math.min(2, value));
      engineRef.current.setPlaybackRate(deck, clamped);
      updateDeck(deck, { speed: clamped });
    },
    [updateDeck]
  );

  const setEQ = useCallback(
    (deck: Deck, band: EQBand, value: number) => {
      engineRef.current.setEQ(deck, band, value);
      updateDeck(deck, {
        eq: {
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
    seek,
    setCrossfader,
    setVolume,
    setSpeed,
    setEQ,
    getAnalyserNode,
  };
}
