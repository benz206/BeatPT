import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Waveform } from './Waveform';
import { Card, Label, Badge } from './ui';

interface DeckProps {
  deckId: 'A' | 'B';
}

export function Deck({ deckId }: DeckProps) {
  const deckState = useAppStore((s) => (deckId === 'A' ? s.deckA : s.deckB));
  const { togglePlayback, setVolume, setEQ, loadTrack } = useAudioEngine();

  const isA = deckId === 'A';
  const { track, isPlaying, volume, eq } = deckState;
  const sliderClass = isA ? '' : 'accent-blue';

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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeBorder = isA ? 'border-accent/25' : 'border-accent-2/25';

  return (
    <Card accent={isA ? 'default' : 'blue'} className={`flex flex-col flex-1 min-h-0 overflow-y-auto p-4 transition-all duration-300 ${isPlaying ? activeBorder : ''}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className={isA ? 'text-accent' : 'text-accent-2'}>
            Deck {deckId}
          </Label>
          {track && (
            <Badge accent={isA ? 'default' : 'blue'}>
              {Math.round(track.bpm)} BPM
            </Badge>
          )}
        </div>

        <Waveform deckId={deckId} />

        <div className="min-h-[32px]">
          {track ? (
            <div>
              <p className="text-sm font-medium text-text-primary truncate">{track.name}</p>
              <p className="text-xs text-text-secondary truncate">
                {track.artist} · {formatDuration(track.duration)}
              </p>
            </div>
          ) : (
            <button
              onClick={handleFileImport}
              className="w-full py-1.5 text-xs font-medium text-text-secondary rounded bg-bg-tertiary border border-border hover:border-border-hover hover:text-text-primary transition-all duration-200 cursor-pointer"
            >
              Load Track
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-4" />

      <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-2">

        <button
          onClick={() => togglePlayback(deckId)}
          disabled={!track}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 border-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
            isPlaying
              ? isA
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-accent-2 bg-accent-2/10 text-accent-2'
              : 'border-border-strong text-text-secondary hover:border-border-hover hover:text-text-primary'
          }`}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="1" width="3.5" height="12" rx="0.5" />
              <rect x="8.5" y="1" width="3.5" height="12" rx="0.5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 1.5v11l9-5.5z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => { if (isPlaying) togglePlayback(deckId); }}
          disabled={!track}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 border border-border text-text-muted hover:border-border-hover hover:text-text-secondary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <rect x="1" y="1" width="8" height="8" rx="1" />
          </svg>
        </button>
      </div>

      <div className="flex items-end justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <Label>Vol</Label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(deckId, parseFloat(e.target.value))}
            className={`h-16 ${sliderClass}`}
            style={{ writingMode: 'vertical-lr' as const, direction: 'rtl' as const, width: '18px' }}
          />
        </div>

        <div className="w-px h-12 bg-border" />

        {(['low', 'mid', 'high'] as const).map((band) => (
          <div key={band} className="flex flex-col items-center gap-1 w-10">
            <Label>{band}</Label>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={eq[band]}
              onChange={(e) => setEQ(deckId, band, parseFloat(e.target.value))}
              className={`h-14 ${sliderClass}`}
              style={{ writingMode: 'vertical-lr' as const, direction: 'rtl' as const, width: '18px' }}
            />
            <span className="text-[10px] font-mono text-text-muted">
              {eq[band] > 0 ? '+' : ''}{Math.round(eq[band])}
            </span>
          </div>
        ))}
      </div>
      </div>
    </Card>
  );
}
