import { useAppStore } from '../stores/useAppStore';

export function AIThinkingOverlay() {
  const isAIThinking = useAppStore((s) => s.isAIThinking);
  const aiThinkingMessage = useAppStore((s) => s.aiThinkingMessage);

  if (!isAIThinking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="px-6 py-3 rounded-xl border border-accent/20 flex items-center gap-3 bg-bg-primary/90 backdrop-blur-xl animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
        <span className="text-sm font-medium text-accent">
          {aiThinkingMessage || 'AI thinking…'}
        </span>
      </div>
    </div>
  );
}
