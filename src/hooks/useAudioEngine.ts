import { useRef, useCallback } from 'react';
import { AudioEngine } from '../engine/AudioEngine';
import { analyzeTrackFile } from '../engine/TrackAnalyzer';
import { computeMatchRate } from '../engine/TransitionExecutor';
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
      engineRef.current.loadTrack(deck, track.audioBuffer!, track.gain);
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

  const seek = useCallback(
    (deck: Deck, position: number) => {
      const engine = engineRef.current;
      engine.seek(deck, position);
      if (!engine.getLoop(deck)) {
        updateDeck(deck, { loop: null });
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

  const setMasterVolume = useCallback((value: number) => {
    engineRef.current.setMasterVolume(value);
    useAppStore.getState().setMasterVolume(value);
  }, []);

  // Match this deck's effective BPM to the other deck's, treating half/double
  // time as equivalent so a 170↔85 pair syncs with a tiny nudge, not 2x speed
  const sync = useCallback(
    (deck: Deck) => {
      const state = useAppStore.getState();
      const thisState = deck === 'A' ? state.deckA : state.deckB;
      const otherState = deck === 'A' ? state.deckB : state.deckA;
      if (!thisState.track || !otherState.track) return;

      const rate = computeMatchRate(otherState.track.bpm, otherState.speed, thisState.track.bpm);
      engineRef.current.setPlaybackRate(deck, rate);
      updateDeck(deck, { speed: rate });
    },
    [updateDeck]
  );

  // Return the deck to neutral: flat EQ, full volume, original tempo
  const resetDeck = useCallback(
    (deck: Deck) => {
      const engine = engineRef.current;
      (['low', 'mid', 'high'] as const).forEach((band) => engine.setEQ(deck, band, 0));
      engine.setVolume(deck, 1);
      engine.setPlaybackRate(deck, 1);
      updateDeck(deck, { eq: { low: 0, mid: 0, high: 0 }, volume: 1, speed: 1 });
    },
    [updateDeck]
  );

  const setHotCue = useCallback(
    (deck: Deck, slot: number) => {
      const state = useAppStore.getState();
      const deckState = deck === 'A' ? state.deckA : state.deckB;
      if (!deckState.track) return;

      const hotCues = [...deckState.hotCues];
      hotCues[slot] = engineRef.current.getPlaybackPosition(deck);
      updateDeck(deck, { hotCues });
    },
    [updateDeck]
  );

  const jumpToHotCue = useCallback(
    (deck: Deck, slot: number) => {
      const state = useAppStore.getState();
      const deckState = deck === 'A' ? state.deckA : state.deckB;
      const position = deckState.hotCues[slot];
      if (position === null || position === undefined) return;
      seek(deck, position);
    },
    [seek]
  );

  const clearHotCue = useCallback(
    (deck: Deck, slot: number) => {
      const state = useAppStore.getState();
      const deckState = deck === 'A' ? state.deckA : state.deckB;
      const hotCues = [...deckState.hotCues];
      hotCues[slot] = null;
      updateDeck(deck, { hotCues });
    },
    [updateDeck]
  );

  // Loop N beats starting from the most recent beat marker
  const setBeatLoop = useCallback(
    (deck: Deck, beats: number) => {
      const engine = engineRef.current;
      const state = useAppStore.getState();
      const deckState = deck === 'A' ? state.deckA : state.deckB;
      const track = deckState.track;
      if (!track) return;

      const position = engine.getPlaybackPosition(deck);
      let start = position;
      for (const beat of track.beatPositions) {
        if (beat > position) break;
        start = beat;
      }

      const end = start + beats * (60 / track.bpm);
      if (end > track.duration) return;

      engine.setLoop(deck, start, end);
      updateDeck(deck, { loop: { start, end, beats } });
    },
    [updateDeck]
  );

  const clearLoop = useCallback(
    (deck: Deck) => {
      engineRef.current.clearLoop(deck);
      updateDeck(deck, { loop: null });
    },
    [updateDeck]
  );

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
    setMasterVolume,
    sync,
    resetDeck,
    setHotCue,
    jumpToHotCue,
    clearHotCue,
    setBeatLoop,
    clearLoop,
  };
}
