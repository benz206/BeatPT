import { useAppStore } from '../stores/useAppStore';
import { useAudioEngine } from '../hooks/useAudioEngine';

export function Crossfader() {
  const crossfaderPosition = useAppStore((s) => s.crossfaderPosition);
  const { setCrossfader } = useAudioEngine();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCrossfader(parseFloat(e.target.value));
  };

  const pct = ((crossfaderPosition + 1) / 2) * 100;
  const isLeft = crossfaderPosition < -0.1;
  const isRight = crossfaderPosition > 0.1;

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-bg-secondary border-b border-white/5">
      <span
        className="text-sm font-black uppercase tracking-wider w-6 text-center transition-all duration-200"
        style={{ color: isLeft ? '#e040fb' : '#ffffff33' }}
      >
        A
      </span>

      <div className="flex-1 relative flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full overflow-hidden"
          style={{ background: 'linear-gradient(90deg, #e040fb44, #00e5ff44)' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/20 rounded-full"
          style={{ left: '50%' }}
        />
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={crossfaderPosition}
          onChange={handleChange}
          className="relative w-full h-6 cursor-pointer appearance-none bg-transparent"
          style={{
            accentColor: crossfaderPosition < 0 ? '#e040fb' : '#00e5ff',
          }}
        />
        <div
          className="absolute bottom-0 w-1 h-1 rounded-full"
          style={{
            left: `calc(${pct}% - 2px)`,
            background: crossfaderPosition < 0 ? '#e040fb' : '#00e5ff',
            boxShadow: `0 0 6px ${crossfaderPosition < 0 ? '#e040fb' : '#00e5ff'}`,
          }}
        />
      </div>

      <span
        className="text-sm font-black uppercase tracking-wider w-6 text-center transition-all duration-200"
        style={{ color: isRight ? '#00e5ff' : '#ffffff33' }}
      >
        B
      </span>

      <span className="text-xs font-mono text-text-secondary w-12 text-right">
        {crossfaderPosition > 0 ? '+' : ''}{crossfaderPosition.toFixed(2)}
      </span>
    </div>
  );
}
