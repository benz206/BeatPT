import { useAppStore } from '../stores/useAppStore';

function getEmoji(level: number): string {
  if (level < 20) return '😴';
  if (level < 45) return '🙂';
  if (level < 70) return '🔥';
  return '🤯';
}

function getColor(level: number): string {
  if (level < 40) return '#76ff03';
  if (level < 70) return '#ffea00';
  return '#ff1744';
}

export function HypeMeter() {
  const hypeLevel = useAppStore((s) => s.hypeLevel);
  const color = getColor(hypeLevel);

  return (
    <div className="flex flex-col items-center gap-2 bg-bg-secondary rounded-xl border border-white/5 p-3 h-full">
      <span className="text-xs font-black uppercase tracking-widest text-text-secondary">
        Crowd Hype
      </span>

      <div className="flex-1 flex flex-col items-center justify-center gap-2 w-full">
        <span className="text-3xl">{getEmoji(hypeLevel)}</span>

        <div className="w-full flex-1 flex flex-col justify-end">
          <div className="relative w-8 mx-auto flex-1 max-h-32 rounded-full bg-bg-tertiary overflow-hidden border border-white/10">
            <div
              className="absolute bottom-0 w-full rounded-full transition-all duration-500"
              style={{
                height: `${hypeLevel}%`,
                background: `linear-gradient(to top, ${color}cc, ${color}44)`,
                boxShadow: `0 0 12px ${color}66`,
              }}
            />
          </div>
        </div>

        <span
          className="text-lg font-black font-mono transition-colors duration-500"
          style={{ color }}
        >
          {Math.round(hypeLevel)}
        </span>
      </div>
    </div>
  );
}
