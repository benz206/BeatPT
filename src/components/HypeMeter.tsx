import { useAppStore } from '../stores/useAppStore';
import { Card, Label } from './ui';

function getLevel(value: number): string {
  if (value < 20) return 'LOW';
  if (value < 45) return 'WARM';
  if (value < 70) return 'HOT';
  return 'PEAK';
}

function getColor(value: number): string {
  if (value < 40) return 'var(--color-text-muted)';
  if (value < 70) return 'var(--color-accent)';
  return 'var(--color-danger)';
}

function getBarColor(value: number): string {
  if (value < 40) return 'var(--color-border-strong)';
  if (value < 70) return 'var(--color-accent)';
  return 'var(--color-danger)';
}

export function HypeMeter() {
  const hypeLevel = useAppStore((s) => s.hypeLevel);
  const color = getColor(hypeLevel);
  const barColor = getBarColor(hypeLevel);

  return (
    <Card accent="default" className="flex flex-col items-center gap-2 p-3 h-full">
      <Label>Hype</Label>

      <div className="flex-1 flex flex-col items-center justify-center gap-2 w-full">
        <span
          className="text-[10px] font-bold uppercase tracking-wider transition-colors duration-500"
          style={{ color }}
        >
          {getLevel(hypeLevel)}
        </span>

        <div className="w-full flex-1 flex flex-col justify-end">
          <div className="relative w-6 mx-auto flex-1 max-h-28 rounded-full bg-bg-tertiary overflow-hidden border border-border">
            <div
              className="absolute bottom-0 w-full rounded-full transition-all duration-500"
              style={{
                height: `${hypeLevel}%`,
                background: barColor,
                opacity: 0.8,
              }}
            />
          </div>
        </div>

        <span
          className="text-base font-bold font-mono transition-colors duration-500"
          style={{ color }}
        >
          {Math.round(hypeLevel)}
        </span>
      </div>
    </Card>
  );
}
