import { useAppStore } from '../stores/useAppStore';

export function ActionLog() {
  const actionLog = useAppStore((s) => s.actionLog);
  const visible = actionLog.slice(0, 8);

  const getOpacity = (index: number) => {
    if (index === 0) return 1;
    if (index === 1) return 0.8;
    if (index <= 3) return 0.6;
    if (index <= 5) return 0.4;
    return 0.2;
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-bg-secondary rounded-xl border border-white/5 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/5">
        <span className="text-xs font-black uppercase tracking-widest text-text-secondary">
          Action Log
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-text-secondary">No actions yet…</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2 py-1">
            {visible.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                style={{
                  opacity: getOpacity(index),
                  background: index === 0 ? 'rgba(224,64,251,0.08)' : undefined,
                  boxShadow: index === 0 ? '0 0 8px rgba(224,64,251,0.15)' : undefined,
                }}
              >
                <span className="text-base w-5 text-center flex-shrink-0">{entry.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">{entry.name}</p>
                  <p className="text-[10px] text-text-secondary truncate">{entry.description}</p>
                </div>
                <span className="text-[10px] font-mono text-text-secondary flex-shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
