import { useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Waveform } from './Waveform';
import { LevelMeter } from './LevelMeter';
import { Card, Label, Badge } from './ui';

interface DeckProps {
  deckId: 'A' | 'B';
}

export function Deck({ deckId }: DeckProps) {
  const deckState = useAppStore((s) => (deckId === 'A' ? s.deckA : s.deckB));
  const otherHasTrack = useAppStore((s) => !!(deckId === 'A' ? s.deckB : s.deckA).track);
  const {
    togglePlayback, setVolume, setSpeed, setEQ, loadTrack,
    sync, resetDeck, setHotCue, jumpToHotCue, clearHotCue, setBeatLoop, clearLoop,
  } = useAudioEngine();

  const isA = deckId === 'A';
  const { track, isPlaying, volume, speed, eq, hotCues, loop } = deckState;
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
  const effectiveBpm = track ? Math.round(track.bpm * speed) : 0;

  return (
    <Card accent={isA ? 'default' : 'blue'} className={`flex flex-col flex-1 min-h-0 overflow-y-auto p-4 transition-all duration-300 ${isPlaying ? activeBorder : ''}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className={isA ? 'text-accent' : 'text-accent-2'}>
            Deck {deckId}
          </Label>
          {track && (
            <div className="flex items-center gap-2">
              <Badge accent={isA ? 'default' : 'blue'}>
                {effectiveBpm} BPM
              </Badge>
              {track.key && (
                <span className="text-[11px] font-mono text-accent-2" title={track.key.name}>{track.key.camelot}</span>
              )}
            </div>
          )}
        </div>

        <Waveform deckId={deckId} />

        {track && (
          <div className="flex items-center gap-1">
            {hotCues.map((cue, slot) => (
              <button
                key={slot}
                onClick={(e) => {
                  if (e.shiftKey) clearHotCue(deckId, slot);
                  else if (cue === null) setHotCue(deckId, slot);
                  else jumpToHotCue(deckId, slot);
                }}
                title={
                  cue === null
                    ? 'Set hot cue at current position'
                    : `Jump to ${formatDuration(cue)} — shift-click to clear`
                }
                className={`w-7 h-6 text-[10px] font-mono font-bold rounded border transition-all duration-150 cursor-pointer ${
                  cue !== null
                    ? isA
                      ? 'border-accent/40 bg-accent/15 text-accent'
                      : 'border-accent-2/40 bg-accent-2/15 text-accent-2'
                    : 'border-border text-text-muted hover:border-border-hover hover:text-text-secondary'
                }`}
              >
                {slot + 1}
              </button>
            ))}

            <div className="w-px h-4 bg-border mx-1.5" />

            {[1, 2, 4, 8].map((beats) => (
              <button
                key={beats}
                onClick={() => (loop?.beats === beats ? clearLoop(deckId) : setBeatLoop(deckId, beats))}
                title={loop?.beats === beats ? 'Release loop' : `Loop ${beats} beat${beats > 1 ? 's' : ''}`}
                className={`w-7 h-6 text-[10px] font-mono font-bold rounded border transition-all duration-150 cursor-pointer ${
                  loop?.beats === beats
                    ? 'border-success/50 bg-success/15 text-success'
                    : 'border-border text-text-muted hover:border-border-hover hover:text-text-secondary'
                }`}
              >
                {beats}
              </button>
            ))}
            <span className="text-[9px] text-text-muted font-medium ml-0.5">LOOP</span>

            <div className="flex-1" />

            <button
              onClick={() => sync(deckId)}
              disabled={!otherHasTrack}
              title="Match BPM to the other deck"
              className={`px-2.5 h-6 text-[10px] font-bold rounded border transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isA
                  ? 'border-accent/40 text-accent hover:bg-accent/10'
                  : 'border-accent-2/40 text-accent-2 hover:bg-accent-2/10'
              }`}
            >
              SYNC
            </button>

            <button
              onClick={() => resetDeck(deckId)}
              title="Reset EQ, volume, and tempo to neutral"
              className="px-2.5 h-6 text-[10px] font-bold rounded border border-border text-text-muted hover:border-border-hover hover:text-text-secondary transition-all duration-150 cursor-pointer"
            >
              RESET
            </button>
          </div>
        )}

        <div className="min-h-[40px]">
          {track ? (
            <div className="flex items-center gap-3">
              {track.albumArt ? (
                <img src={track.albumArt} className="w-10 h-10 rounded object-cover shrink-0" alt="" />
              ) : (
                <div className="w-10 h-10 rounded bg-bg-tertiary border border-border shrink-0 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{track.name}</p>
                <p className="text-xs text-text-secondary truncate">
                  {track.artist} · {formatDuration(track.duration)}
                </p>
              </div>
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

      {track && (
        <div className="flex items-center gap-2 px-2">
          <Label className="text-[10px] shrink-0">BPM</Label>
          <input
            type="range"
            min={Math.round(track.bpm * 0.75)}
            max={Math.round(track.bpm * 1.25)}
            step={1}
            value={effectiveBpm}
            onChange={(e) => setSpeed(deckId, parseFloat(e.target.value) / track.bpm)}
            className={`flex-1 ${sliderClass}`}
          />
        </div>
      )}

      <div className="flex items-end justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <Label>Lvl</Label>
          <LevelMeter deckId={deckId} />
        </div>

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
