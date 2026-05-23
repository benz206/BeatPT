import { useAppStore } from '../stores/useAppStore';

export function AIThinkingOverlay() {
  const isAIThinking = useAppStore((s) => s.isAIThinking);
  const aiThinkingMessage = useAppStore((s) => s.aiThinkingMessage);

  if (!isAIThinking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div
        className="px-6 py-3 rounded-2xl border border-accent/40 flex items-center gap-3"
        style={{
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 40px #e040fb44',
          animation: 'pulse 1s ease-in-out infinite',
        }}
      >
        <span
          className="w-2 h-2 rounded-full bg-accent"
          style={{ animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite' }}
        />
        <span className="text-sm font-semibold text-accent">
          {aiThinkingMessage || 'AI thinking…'}
        </span>
        <span
          className="w-2 h-2 rounded-full bg-accent"
          style={{ animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.2s' }}
        />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
