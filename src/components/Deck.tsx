import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Waveform } from './Waveform';

interface DeckProps {
  deckId: 'A' | 'B';
}

export function Deck({ deckId }: DeckProps) {
  const deckState = useAppStore((s) => (deckId === 'A' ? s.deckA : s.deckB));
  const { togglePlayback, setVolume, setEQ, loadTrack } = useAudioEngine();

  const accentColor = deckId === 'A' ? 'accent' : 'accent-2';
  const accentHex = deckId === 'A' ? '#e040fb' : '#00e5ff';

  const { track, isPlaying, volume, eq } = deckState;

  const handleFileImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) await loadTrack(deckId, file);
    };
    input.click();
  }, [deckId, loadTrack]);

  const borderClass = isPlaying
    ? `border-${accentColor}/60 shadow-[0_0_20px_${accentHex}33]`
    : 'border-white/5';

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`flex flex-col gap-3 p-4 rounded-xl bg-bg-secondary border transition-all duration-300 ${isPlaying ? 'shadow-lg' : 'opacity-90'}`}
      style={{
        borderColor: isPlaying ? `${accentHex}55` : 'rgba(255,255,255,0.05)',
        boxShadow: isPlaying ? `0 0 24px ${accentHex}22` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-black uppercase tracking-widest"
          style={{ color: accentHex }}
        >
          DECK {deckId}
        </span>
        {track && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-md"
            style={{ background: `${accentHex}22`, color: accentHex }}
          >
            {Math.round(track.bpm)} BPM
          </span>
        )}
      </div>

      <Waveform deckId={deckId} />

      <div className="min-h-[36px]">
        {track ? (
          <div>
            <p className="text-sm font-semibold text-text-primary truncate">{track.name}</p>
            <p className="text-xs text-text-secondary truncate">
              {track.artist} · {formatDuration(track.duration)}
            </p>
          </div>
        ) : (
          <button
            onClick={handleFileImport}
            className="w-full py-2 text-xs font-semibold text-text-secondary rounded-lg bg-bg-tertiary border border-white/10 hover:border-white/20 hover:text-text-primary transition-all duration-200"
          >
            Load Track
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center justify-center gap-3">
          <button
            onClick={() => togglePlayback(deckId)}
            disabled={!track}
            className="w-12 h-12 rounded-full font-bold text-lg flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: isPlaying ? `${accentHex}33` : `${accentHex}22`,
              border: `2px solid ${accentHex}`,
              color: accentHex,
              boxShadow: isPlaying ? `0 0 16px ${accentHex}66` : undefined,
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => {
              if (isPlaying) togglePlayback(deckId);
            }}
            disabled={!track}
            className="w-8 h-8 rounded-full text-sm flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-bg-tertiary border border-white/10 hover:border-white/30 text-text-secondary"
          >
            ⏹
          </button>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-text-secondary uppercase tracking-wider">VOL</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(deckId, parseFloat(e.target.value))}
            className="h-20 cursor-pointer"
            style={{
              writingMode: 'vertical-lr' as const,
              direction: 'rtl' as const,
              accentColor: accentHex,
              width: '20px',
            }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        {(['low', 'mid', 'high'] as const).map((band) => (
          <div key={band} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider">{band}</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={eq[band]}
              onChange={(e) => setEQ(deckId, band, parseFloat(e.target.value))}
              className="h-16 cursor-pointer"
              style={{
                writingMode: 'vertical-lr' as const,
                direction: 'rtl' as const,
                accentColor: accentHex,
                width: '20px',
              }}
            />
            <span className="text-[10px] font-mono text-text-secondary">
              {eq[band] > 0 ? '+' : ''}{Math.round(eq[band])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
