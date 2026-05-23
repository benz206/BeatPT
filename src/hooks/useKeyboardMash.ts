import { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { triggerRandomAction } from '../engine/DJActions';

const AI_THINKING_MESSAGES = [
  'Analyzing harmonic compatibility...',
  'Computing optimal transition point...',
  'Neural beat-matching in progress...',
  'Calibrating frequency spectrum...',
  'AI mixing algorithm engaged...',
  'Synchronizing phase alignment...',
  'Deep learning the vibe...',
  'Quantum beat analysis...',
];

const IGNORED_KEYS = new Set(['Escape', ' ', 'Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock']);

export function useKeyboardMash() {
  const isMashMode = useAppStore((state) => state.isMashMode);
  const showAIThinking = useAppStore((state) => state.showAIThinking);
  const hideAIThinking = useAppStore((state) => state.hideAIThinking);
  const addAction = useAppStore((state) => state.addAction);
  const hypeLevel = useAppStore((state) => state.hypeLevel);
  const setHypeLevel = useAppStore((state) => state.setHypeLevel);
  const setTransitionConfidence = useAppStore((state) => state.setTransitionConfidence);

  // Track timeout for hype decay
  const hypeDecayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isMashMode) return;
      if (IGNORED_KEYS.has(e.key)) return;

      const message = AI_THINKING_MESSAGES[Math.floor(Math.random() * AI_THINKING_MESSAGES.length)];
      const thinkingDuration = Math.floor(Math.random() * 500) + 300; // 300–800ms

      showAIThinking(message);

      setTimeout(() => {
        hideAIThinking();
      }, thinkingDuration);

      const action = triggerRandomAction();
      addAction({ name: action.name, icon: action.icon, description: action.description });

      // Bump hype by 1–5, capped at 100
      const bump = Math.floor(Math.random() * 5) + 1;
      setHypeLevel(Math.min(100, hypeLevel + bump));

      // Update transition confidence randomly
      const newConfidence = Math.floor(Math.random() * 101);
      setTransitionConfidence(newConfidence);

      // Schedule hype decay after 3 seconds of inactivity
      if (hypeDecayRef.current) clearTimeout(hypeDecayRef.current);
      hypeDecayRef.current = setTimeout(() => {
        const currentHype = useAppStore.getState().hypeLevel;
        setHypeLevel(Math.max(0, currentHype - 10));
      }, 3000);
    },
    [isMashMode, showAIThinking, hideAIThinking, addAction, hypeLevel, setHypeLevel, setTransitionConfidence]
  );

  useEffect(() => {
    if (!isMashMode) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMashMode, handleKeyDown]);

  // Clean up decay timer on unmount
  useEffect(() => {
    return () => {
      if (hypeDecayRef.current) clearTimeout(hypeDecayRef.current);
    };
  }, []);

  return { isActive: isMashMode };
}
