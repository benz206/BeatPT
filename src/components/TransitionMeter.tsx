import { useAppStore } from '../stores/useAppStore';
import { Card, Label } from './ui';

export function TransitionMeter() {
  const confidence = useAppStore((s) => s.transitionConfidence);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - confidence / 100);

  return (
    <Card accent="default" className="flex flex-col items-center gap-2 p-3 h-full">
      <Label className="text-center">Transition</Label>

      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="6"
            />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-text-primary">{Math.round(confidence)}</span>
            <span className="text-[10px] text-text-muted">%</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
