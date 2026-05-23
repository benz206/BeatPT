import { useAppStore } from '../stores/useAppStore';
import { Card, Label } from './ui';

export function ActionLog() {
  const actionLog = useAppStore((s) => s.actionLog);
  const visible = actionLog.slice(0, 8);

  const getOpacity = (index: number) => {
    if (index === 0) return 1;
    if (index === 1) return 0.75;
    if (index <= 3) return 0.5;
    return 0.3;
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <Card accent="default" className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <Label>Action Log</Label>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-text-muted">No actions yet</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2 py-1">
            {visible.map((entry, index) => (
              <li
                key={entry.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
                  index === 0 ? 'bg-accent-subtle' : ''
                }`}
                style={{ opacity: getOpacity(index) }}
              >
                <span className="text-sm w-5 text-center shrink-0">{entry.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{entry.name}</p>
                  <p className="text-[11px] text-text-secondary truncate">{entry.description}</p>
                </div>
                <span className="text-[11px] font-mono text-text-muted shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
