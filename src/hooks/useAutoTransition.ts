import { useEffect, useRef } from 'react';
import { AudioEngine } from '../engine/AudioEngine';
import { useAppStore } from '../stores/useAppStore';
import { selectTransition } from '../engine/TransitionStrategy';
import { findBestMixPoint, MixPoint } from '../engine/MixPointFinder';
import { executeTransition } from '../engine/TransitionExecutor';

const TRANSITION_ICONS: Record<string, string> = {
  'long-blend': '🎶',
  'tempo-ramp': '⏫',
  'filter-sweep': '〰️',
  'echo-drop': '💥',
  'breakdown-bridge': '🌉',
};

export function useAutoTransition() {
  const transitioningRef = useRef(false);
  const lastConfidenceRef = useRef(0);
  const mixPointRef = useRef<MixPoint | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const planCacheRef = useRef<{ deckId: string; plan: ReturnType<typeof selectTransition> } | null>(null);

  useEffect(() => {
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

          if (!planCacheRef.current || planCacheRef.current.deckId !== deckId) {
            planCacheRef.current = {
              deckId,
              plan: selectTransition(deckState.track, otherState.track),
            };
            mixPointRef.current = null;
          }

          const plan = planCacheRef.current.plan;

          if (!mixPointRef.current) {
            const point = findBestMixPoint(
              deckState.track,
              plan.estimatedDuration,
              plan.type === 'echo-drop',
            );
            if (point && position >= point.triggerTime - 40) {
              mixPointRef.current = point;
            }
          }

          if (now - lastConfidenceRef.current > 500) {
            lastConfidenceRef.current = now;
            if (mixPointRef.current) {
              const timeUntilTrigger = mixPointRef.current.triggerTime - position;
              if (timeUntilTrigger <= 40 && timeUntilTrigger > 0) {
                const progress = 1 - timeUntilTrigger / 40;
                state.setTransitionConfidence(Math.round(30 + progress * 55));
              }
            } else if (remaining > 60) {
              state.setTransitionConfidence(30);
            }
          }

          const triggerTime = mixPointRef.current?.triggerTime ?? (deckState.track.duration - plan.estimatedDuration - 2);
          if (position >= triggerTime && remaining > 2) {
            transitioningRef.current = true;
            mixPointRef.current = null;
            planCacheRef.current = null;

            state.setTransitionConfidence(85);
            state.setActiveTransitionType(plan.type);
            state.addAction({
              name: plan.description.split(' — ')[0],
              icon: TRANSITION_ICONS[plan.type] ?? '↔️',
              description: plan.description,
            });

            abortRef.current = executeTransition({
              engine,
              fromDeck: deckId,
              toDeck: otherDeck,
              fromTrack: deckState.track,
              toTrack: otherState.track,
              fromSpeed: deckState.speed,
              toSpeed: otherState.speed,
              plan,
              onComplete: () => {
                transitioningRef.current = false;
                abortRef.current = null;
                state.setTransitionConfidence(50);
                state.setActiveTransitionType(null);
              },
              onProgress: (confidence, _message) => {
                state.setTransitionConfidence(confidence);
              },
              setCrossfaderPosition: (pos) => {
                useAppStore.getState().setCrossfaderPosition(pos);
              },
              updateDeck: (deck, updates) => {
                useAppStore.getState().updateDeck(deck, updates);
              },
            });
            break;
          }
        }
      }

    }

    const intervalId = setInterval(tick, 250);
    return () => {
      clearInterval(intervalId);
      abortRef.current?.abort();
    };
  }, []);
}
