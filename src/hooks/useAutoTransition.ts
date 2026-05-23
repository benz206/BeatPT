import { useEffect, useRef } from 'react';
import { AudioEngine } from '../engine/AudioEngine';
import { useAppStore } from '../stores/useAppStore';

const TRANSITION_LEAD_SECS = 30;
const CROSSFADE_SECS = 16;

export function useAutoTransition() {
  const transitioningRef = useRef(false);
  const lastConfidenceRef = useRef(0);

  useEffect(() => {
    let rafId: number;

    function tick() {
      const engine = AudioEngine.getInstance();
      const state = useAppStore.getState();
      const now = performance.now();

      if (!transitioningRef.current) {
        for (const deckId of ['A', 'B'] as const) {
          const otherDeck = deckId === 'A' ? 'B' : 'A';
          const deckState = deckId === 'A' ? state.deckA : state.deckB;
          const otherState = otherDeck === 'A' ? state.deckA : state.deckB;

          if (!engine.isPlaying(deckId) || !deckState.track) continue;
          if (!otherState.track) continue;
          if (engine.isPlaying(otherDeck)) continue;

          const position = engine.getPlaybackPosition(deckId);
          const remaining = deckState.track.duration - position;

          if (now - lastConfidenceRef.current > 500) {
            lastConfidenceRef.current = now;
            if (remaining > TRANSITION_LEAD_SECS * 2) {
              state.setTransitionConfidence(30);
            } else if (remaining > TRANSITION_LEAD_SECS) {
              const progress = 1 - (remaining - TRANSITION_LEAD_SECS) / TRANSITION_LEAD_SECS;
              state.setTransitionConfidence(Math.round(30 + progress * 55));
            }
          }

          if (remaining <= TRANSITION_LEAD_SECS && remaining > 2) {
            transitioningRef.current = true;
            state.setTransitionConfidence(95);
            performTransition(deckId, otherDeck, transitioningRef);
            break;
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);
}

function performTransition(
  fromDeck: 'A' | 'B',
  toDeck: 'A' | 'B',
  transitioningRef: { current: boolean }
) {
  const engine = AudioEngine.getInstance();
  const fromTrack = (fromDeck === 'A' ? useAppStore.getState().deckA : useAppStore.getState().deckB).track;
  const toTrack = (toDeck === 'A' ? useAppStore.getState().deckA : useAppStore.getState().deckB).track;

  if (!fromTrack || !toTrack) {
    transitioningRef.current = false;
    return;
  }

  const rate = fromTrack.bpm / toTrack.bpm;
  engine.setPlaybackRate(toDeck, Math.max(0.5, Math.min(2, rate)));

  engine.play(toDeck);
  useAppStore.getState().updateDeck(toDeck, { isPlaying: true });

  useAppStore.getState().addAction({
    name: 'Auto Transition',
    icon: '↔️',
    description: `Beat-synced crossfade to Deck ${toDeck} (${Math.round(rate * 100)}% speed)`,
  });

  const startValue = engine.getCrossfaderValue();
  const targetValue = toDeck === 'B' ? 1 : -1;
  const steps = 80;
  const stepTime = (CROSSFADE_SECS * 1000) / steps;
  let i = 0;

  const interval = setInterval(() => {
    i++;
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const pos = startValue + (targetValue - startValue) * eased;
    engine.setCrossfader(pos);
    useAppStore.getState().setCrossfaderPosition(pos);

    if (i >= steps) {
      clearInterval(interval);
      engine.stop(fromDeck);
      useAppStore.getState().updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });
      useAppStore.getState().setTransitionConfidence(50);
      setTimeout(() => {
        transitioningRef.current = false;
      }, 5000);
    }
  }, stepTime);
}
