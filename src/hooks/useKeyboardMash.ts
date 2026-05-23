import { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { ActionScheduler } from '../engine/ActionScheduler';
import type { MixPhase } from '../engine/DJActions';

const PHASE_MESSAGES: Record<MixPhase, string[]> = {
  groove: [
    'Analyzing harmonic spectrum...',
    'Monitoring crowd energy...',
    'Evaluating sonic texture...',
    'Calibrating frequency response...',
  ],
  buildup: [
    'Computing build sequence...',
    'Tensioning frequency envelope...',
    'Preparing transition vector...',
    'Neural beat-matching in progress...',
  ],
  drop: [
    'EXECUTING DROP SEQUENCE',
    'Neural drop calibration LOCKED',
    'Impact point calculated',
  ],
};

const IGNORED_KEYS = new Set(['Escape', ' ', 'Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock']);

export function useKeyboardMash() {
  const showAIThinking = useAppStore((state) => state.showAIThinking);
  const hideAIThinking = useAppStore((state) => state.hideAIThinking);
  const addAction = useAppStore((state) => state.addAction);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (IGNORED_KEYS.has(e.key)) return;

      const scheduler = ActionScheduler.getInstance();
      const phase = scheduler.getPhase();

      const messages = PHASE_MESSAGES[phase];
      const message = messages[Math.floor(Math.random() * messages.length)];
      const thinkingDuration = Math.floor(Math.random() * 500) + 300;

      showAIThinking(message);
      setTimeout(() => hideAIThinking(), thinkingDuration);

      const action = scheduler.selectAndExecute();
      if (action) {
        addAction({ name: action.name, icon: action.icon, description: action.description });
      }
    },
    [showAIThinking, hideAIThinking, addAction]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
