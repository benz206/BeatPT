import { useAppStore } from '../stores/useAppStore';

export function TransitionMeter() {
  const confidence = useAppStore((s) => s.transitionConfidence);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - confidence / 100);

  return (
    <div className="flex flex-col items-center gap-2 bg-bg-secondary rounded-xl border border-white/5 p-3 h-full">
      <span className="text-xs font-black uppercase tracking-widest text-text-secondary text-center">
        Transition Confidence
      </span>

      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="8"
            />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="#e040fb"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 0.5s ease',
                filter: 'drop-shadow(0 0 6px #e040fb88)',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black text-text-primary">{Math.round(confidence)}</span>
            <span className="text-[10px] text-text-secondary">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
