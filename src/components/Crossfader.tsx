import { useAppStore } from '../stores/useAppStore';
import { useAudioEngine } from '../hooks/useAudioEngine';

export function Crossfader() {
  const crossfaderPosition = useAppStore((s) => s.crossfaderPosition);
  const { setCrossfader } = useAudioEngine();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCrossfader(parseFloat(e.target.value));
  };

  const isLeft = crossfaderPosition < -0.1;
  const isRight = crossfaderPosition > 0.1;

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-bg-secondary border-y border-border">
      <span className={`text-xs font-bold w-6 text-center transition-colors duration-200 ${isLeft ? 'text-accent' : 'text-text-muted'}`}>
        A
      </span>

      <div className="flex-1 relative flex items-center">
        <div className="absolute left-1/2 top-1/2 -translate-x-px -translate-y-1/2 w-px h-3 bg-border-strong rounded-full" />
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={crossfaderPosition}
          onChange={handleChange}
          className={`relative w-full h-6 ${crossfaderPosition > 0 ? 'accent-blue' : ''}`}
        />
      </div>

      <span className={`text-xs font-bold w-6 text-center transition-colors duration-200 ${isRight ? 'text-accent-2' : 'text-text-muted'}`}>
        B
      </span>

      <span className="text-[11px] font-mono text-text-muted w-12 text-right">
        {crossfaderPosition > 0 ? '+' : ''}{crossfaderPosition.toFixed(2)}
      </span>
    </div>
  );
}
